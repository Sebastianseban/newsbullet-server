import Subscription from "../models/Subscription.js";
import { getRazorpayInstance } from "../utils/razorpayInstance.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import Plan from "../models/Plan.js";
import crypto from "crypto";
import { withTimeout } from "../utils/withTimeout.js";
import { acquireJobLock, releaseJobLock } from "../utils/jobLock.js";

// Helper to convert Razorpay UNIX timestamps (seconds) to JS Date
const toDate = (ts) => (ts ? new Date(ts * 1000) : null);
const getRazorpayClient = () => {
  try {
    return getRazorpayInstance();
  } catch (error) {
    throw new ApiError(500, error.message);
  }
};
const isPlainObject = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;
const hasValidWebhookSignature = (receivedSignature, expectedSignature) => {
  const receivedBuffer = Buffer.from(receivedSignature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
};

// ============================================
// PLAN MANAGEMENT
// ============================================

/**
 * Create a subscription plan
 * POST /api/subscriptions/plans/create
 */
export const createPlan = asyncHandler(async (req, res) => {
  const { name, amount, interval, period, description } = req.body;
  const razorpay = getRazorpayClient();
  const normalizedName = typeof name === "string" ? name.trim() : "";
  const normalizedDescription =
    typeof description === "string" ? description.trim() : normalizedName;
  const parsedAmount = Number(amount);
  const parsedInterval = Number(interval);

  if (!normalizedName || !period || Number.isNaN(parsedAmount) || Number.isNaN(parsedInterval)) {
    throw new ApiError(400, "Name, amount, period, and interval are required");
  }

  const validPeriods = ["daily", "weekly", "monthly", "yearly"];
  if (!validPeriods.includes(period)) {
    throw new ApiError(400, `Period must be one of: ${validPeriods.join(", ")}`);
  }

  if (!Number.isInteger(parsedInterval) || parsedInterval <= 0) {
    throw new ApiError(400, "Interval must be a positive number");
  }

  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new ApiError(400, "Amount must be a positive number");
  }

  try {
    const plan = await withTimeout(
      razorpay.plans.create({
        period,
        interval: parsedInterval,
        item: {
          name: normalizedName,
          amount: Math.round(parsedAmount * 100),
          currency: "INR",
          description: normalizedDescription,
        },
      }),
      10000
    );

    const dbPlan = await withTimeout(
      Plan.create({
        razorpayPlanId: plan.id,
        name: plan.item.name,
        amount: plan.item.amount / 100,
        currency: plan.item.currency,
        period: plan.period,
        interval: plan.interval,
        description: plan.item.description,
        isActive: true,
      }),
      5000
    );

    return res.status(201).json(
      new ApiResponse(
        201,
        {
          razorpay: plan,
          plan: dbPlan,
        },
        "Plan created successfully"
      )
    );
  } catch (err) {
    console.error("Razorpay plan creation failed:", err);
    throw new ApiError(500, `Failed to create plan: ${err.message}`);
  }
});

/**
 * Get all plans
 * GET /api/subscriptions/plans
 */
export const getAllPlans = asyncHandler(async (req, res) => {
  try {
    const razorpay = getRazorpayClient();
    const activePlans = await withTimeout(
      Plan.find({ isActive: true }).lean(),
      5000
    );

    if (!activePlans.length) {
      return res
        .status(200)
        .json(new ApiResponse(200, [], "No active plans found"));
    }

    const activeIds = new Set(activePlans.map((p) => p.razorpayPlanId));

    const razorpayPlans = await withTimeout(
      razorpay.plans.all({ count: 50 }),
      10000
    );

    const filteredRazorpayPlans = razorpayPlans.items.filter((p) =>
      activeIds.has(p.id)
    );

    const merged = filteredRazorpayPlans.map((rp) => {
      const db = activePlans.find((p) => p.razorpayPlanId === rp.id);
      return {
        razorpay: rp,
        meta: db,
      };
    });

    return res.status(200).json(
      new ApiResponse(200, merged, "Active plans fetched successfully")
    );
  } catch (err) {
    console.error("Failed to fetch plans:", err);
    throw new ApiError(500, "Failed to fetch plans");
  }
});

/**
 * Get plan by ID
 * GET /api/subscriptions/plans/:planId
 */
export const getPlanById = asyncHandler(async (req, res) => {
  const { planId } = req.params;
  const razorpay = getRazorpayClient();

  if (!planId || typeof planId !== "string") {
    throw new ApiError(400, "planId is required");
  }

  try {
    const plan = await withTimeout(razorpay.plans.fetch(planId), 10000);
    const dbPlan = await withTimeout(
      Plan.findOne({ razorpayPlanId: planId }).lean(),
      5000
    );

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          razorpay: plan,
          meta: dbPlan,
        },
        "Plan fetched successfully"
      )
    );
  } catch (err) {
    console.error("Failed to fetch plan:", err);
    if (err?.statusCode === 404 || err?.error?.code === "BAD_REQUEST_ERROR") {
      throw new ApiError(404, "Plan not found");
    }

    throw new ApiError(500, `Failed to fetch plan: ${err.message}`);
  }
});

/**
 * Soft delete / deactivate a plan
 * DELETE /api/subscriptions/plans/:planId
 */
export const deletePlan = asyncHandler(async (req, res) => {
  const { planId } = req.params;

  const updated = await withTimeout(
    Plan.findOneAndUpdate(
      { razorpayPlanId: planId },
      { isActive: false },
      { new: true }
    ),
    5000
  );

  if (!updated) {
    throw new ApiError(404, "Plan not found in system");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, updated, "Plan deactivated successfully"));
});

// ============================================
// SUBSCRIPTION MANAGEMENT
// ============================================

/**
 * Create a new subscription
 * POST /api/subscriptions/create
 */
export const createSubscription = asyncHandler(async (req, res) => {
  const { plan_id, total_count, notes } = req.body;
  const userId = req.user._id;
  const razorpay = getRazorpayClient();
  let lockAcquired = false;
  let subscription;

  if (!plan_id || typeof plan_id !== "string") {
    throw new ApiError(400, "plan_id is required");
  }

  const normalizedPlanId = plan_id.trim();

  if (!normalizedPlanId) {
    throw new ApiError(400, "plan_id is required");
  }

  const subscriptionLockKey = `subscription-create:${userId}:${normalizedPlanId}`;
  const lockOwner = `subscription-controller-${process.pid}-${crypto.randomUUID()}`;

  if (!req.user.email) {
    throw new ApiError(400, "User email is required for subscription");
  }

  if (
    total_count !== undefined &&
    (!Number.isInteger(Number(total_count)) || Number(total_count) <= 0)
  ) {
    throw new ApiError(400, "total_count must be a positive integer");
  }

  if (notes !== undefined && !isPlainObject(notes)) {
    throw new ApiError(400, "notes must be a valid object");
  }

  lockAcquired = await acquireJobLock({
    jobName: subscriptionLockKey,
    ownerId: lockOwner,
    ttlMs: 30000,
  });

  if (!lockAcquired) {
    throw new ApiError(
      409,
      "A subscription request is already being processed for this plan"
    );
  }

  try {
    const activePlan = await withTimeout(
      Plan.findOne({
        razorpayPlanId: normalizedPlanId,
        isActive: true,
      }),
      5000
    );

    if (!activePlan) {
      throw new ApiError(400, "Selected plan is not available");
    }

    const existingSubscription = await withTimeout(
      Subscription.findOne({
        userId,
        planId: normalizedPlanId,
        status: { $in: ["created", "authenticated", "active", "pending"] },
      }),
      5000
    );

    if (existingSubscription) {
      if (["created", "authenticated"].includes(existingSubscription.status)) {
        return res.status(200).json(
          new ApiResponse(
            200,
            {
              subscription: {
                id: existingSubscription.subscriptionId,
                short_url: existingSubscription.shortUrl,
                status: existingSubscription.status,
              },
            },
            "Pending subscription found. Please complete the payment."
          )
        );
      }

      throw new ApiError(
        400,
        "You already have an active subscription for this plan"
      );
    }

    let customer;

    const oldCustomer = await withTimeout(
      Subscription.findOne({
        userId,
        customerId: { $exists: true, $ne: null },
      }).select("customerId"),
      5000
    );

    if (oldCustomer?.customerId) {
      try {
        customer = await withTimeout(
          razorpay.customers.fetch(oldCustomer.customerId),
          10000
        );
      } catch {
        customer = null;
      }
    }

    if (!customer) {
      customer = await withTimeout(
        razorpay.customers.create({
          name: req.user.name || "User",
          email: req.user.email,
          contact: req.user.phone || "",
          fail_existing: 0,
        }),
        10000
      );
    }

    subscription = await withTimeout(
      razorpay.subscriptions.create({
        plan_id: normalizedPlanId,
        customer_id: customer.id,
        total_count: Number.isInteger(Number(total_count))
          ? Number(total_count)
          : 12,
        quantity: 1,
        customer_notify: 1,
        notes: notes || {},
      }),
      10000
    );

    const dbSubscription = await withTimeout(
      Subscription.create({
        userId,
        subscriptionId: subscription.id,
        planId: normalizedPlanId,
        customerId: customer.id,
        status: subscription.status,
        shortUrl: subscription.short_url,
        totalCount: subscription.total_count,
        paidCount: subscription.paid_count || 0,
        remainingCount:
          subscription.remaining_count ?? subscription.total_count,
        startAt: toDate(subscription.start_at),
        endAt: toDate(subscription.end_at),
        chargeAt: toDate(subscription.charge_at),
        currentStart: toDate(subscription.current_start),
        currentEnd: toDate(subscription.current_end),
        notes: subscription.notes,
      }),
      5000
    );

    return res.status(201).json(
      new ApiResponse(
        201,
        {
          subscription: {
            id: subscription.id,
            short_url: subscription.short_url,
            status: subscription.status,
          },
          dbRecord: dbSubscription,
        },
        "Subscription created successfully. Please complete the payment."
      )
    );
  } catch (error) {
    if (subscription?.id) {
      try {
        await withTimeout(
          razorpay.subscriptions.cancel(subscription.id, {
            cancel_at_cycle_end: false,
          }),
          10000
        );
      } catch (cancelError) {
        console.error(
          "Failed to rollback Razorpay subscription after local error:",
          cancelError
        );
      }
    }

    throw error;
  } finally {
    if (lockAcquired) {
      await releaseJobLock({
        jobName: subscriptionLockKey,
        ownerId: lockOwner,
      }).catch((releaseError) => {
        console.error("Failed to release subscription lock:", releaseError);
      });
    }
  }
});

/**
 * Get user's subscriptions
 * GET /api/subscriptions/user/all
 */
export const getUserSubscriptions = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { status } = req.query;
  const parsedPage = Number(req.query.page);
  const parsedLimit = Number(req.query.limit);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(20, parsedLimit)
      : 10;

  const filter = { userId };
  if (status) {
    filter.status = status;
  }

  const subscriptions = await withTimeout(
    Subscription.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit + 1)
      .lean(),
    5000
  );

  const hasMore = subscriptions.length > limit;
  if (hasMore) {
    subscriptions.pop();
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        subscriptions,
        pagination: {
          page,
          limit,
          hasMore,
        },
      },
      "User subscriptions fetched successfully"
    )
  );
});

/**
 * Get specific subscription
 * GET /api/subscriptions/:subscriptionId
 */
export const getSubscription = asyncHandler(async (req, res) => {
  const { subscriptionId } = req.params;
  const userId = req.user._id;
  const razorpay = getRazorpayClient();

  const subscription = await withTimeout(
    Subscription.findOne({
      subscriptionId,
      userId,
    }),
    5000
  );

  if (!subscription) {
    throw new ApiError(404, "Subscription not found");
  }

  try {
    const razorpaySubscription = await withTimeout(
      razorpay.subscriptions.fetch(subscriptionId),
      10000
    );

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          database: subscription,
          razorpay: razorpaySubscription,
        },
        "Subscription fetched successfully"
      )
    );
  } catch (err) {
    console.error("Failed to fetch from Razorpay:", err);
    return res.status(200).json(
      new ApiResponse(200, subscription, "Subscription fetched from database")
    );
  }
});

/**
 * Cancel subscription
 * POST /api/subscriptions/:subscriptionId/cancel
 */
export const cancelSubscription = asyncHandler(async (req, res) => {
  const { subscriptionId } = req.params;
  const { cancel_at_cycle_end } = req.body;
  const userId = req.user._id;
  const razorpay = getRazorpayClient();

  const subscription = await withTimeout(
    Subscription.findOne({
      subscriptionId,
      userId,
    }),
    5000
  );

  if (!subscription) {
    throw new ApiError(404, "Subscription not found");
  }

  if (!subscription.canCancel()) {
    throw new ApiError(
      400,
      `Cannot cancel subscription with status: ${subscription.status}`
    );
  }

  try {
    const cancelled = await withTimeout(
      razorpay.subscriptions.cancel(subscriptionId, {
        cancel_at_cycle_end: !!cancel_at_cycle_end,
      }),
      10000
    );

    const updated = await withTimeout(
      Subscription.findOneAndUpdate(
        { subscriptionId },
        {
          status: cancel_at_cycle_end ? "pending_cancellation" : "cancelled",
          cancelledAt: new Date(),
          endAt: cancelled.ended_at ? toDate(cancelled.ended_at) : null,
        },
        { new: true }
      ),
      5000
    );

    return res.status(200).json(
      new ApiResponse(
        200,
        updated,
        cancel_at_cycle_end
          ? "Subscription will be cancelled at the end of billing cycle"
          : "Subscription cancelled successfully"
      )
    );
  } catch (err) {
    console.error("Cancellation failed:", err);
    throw new ApiError(500, `Failed to cancel subscription: ${err.message}`);
  }
});

/**
 * Pause subscription
 * POST /api/subscriptions/:subscriptionId/pause
 */
export const pauseSubscription = asyncHandler(async (req, res) => {
  const { subscriptionId } = req.params;
  const { pause_at } = req.body;
  const userId = req.user._id;
  const razorpay = getRazorpayClient();

  if (
    pause_at !== undefined &&
    pause_at !== "now" &&
    (!Number.isInteger(Number(pause_at)) || Number(pause_at) <= 0)
  ) {
    throw new ApiError(400, "pause_at must be 'now' or a valid timestamp");
  }

  const subscription = await withTimeout(
    Subscription.findOne({
      subscriptionId,
      userId,
    }),
    5000
  );

  if (!subscription) {
    throw new ApiError(404, "Subscription not found");
  }

  if (!subscription.canPause()) {
    throw new ApiError(
      400,
      `Cannot pause subscription with status: ${subscription.status}`
    );
  }

  try {
    const paused = await withTimeout(
      razorpay.subscriptions.pause(subscriptionId, {
        pause_at: pause_at || "now",
      }),
      10000
    );

    const updated = await withTimeout(
      Subscription.findOneAndUpdate(
        { subscriptionId },
        {
          status: "paused",
          pausedAt: new Date(),
          currentStart: toDate(paused.current_start),
          currentEnd: toDate(paused.current_end),
          chargeAt: toDate(paused.charge_at),
        },
        { new: true }
      ),
      5000
    );

    return res
      .status(200)
      .json(new ApiResponse(200, updated, "Subscription paused successfully"));
  } catch (err) {
    console.error("Pause failed:", err);
    throw new ApiError(500, `Failed to pause subscription: ${err.message}`);
  }
});

/**
 * Resume subscription
 * POST /api/subscriptions/:subscriptionId/resume
 */
export const resumeSubscription = asyncHandler(async (req, res) => {
  const { subscriptionId } = req.params;
  const { resume_at } = req.body;
  const userId = req.user._id;
  const razorpay = getRazorpayClient();

  if (
    resume_at !== undefined &&
    resume_at !== "now" &&
    (!Number.isInteger(Number(resume_at)) || Number(resume_at) <= 0)
  ) {
    throw new ApiError(400, "resume_at must be 'now' or a valid timestamp");
  }

  const subscription = await withTimeout(
    Subscription.findOne({
      subscriptionId,
      userId,
    }),
    5000
  );

  if (!subscription) {
    throw new ApiError(404, "Subscription not found");
  }

  if (!subscription.canResume()) {
    throw new ApiError(
      400,
      `Cannot resume subscription with status: ${subscription.status}`
    );
  }

  try {
    const resumed = await withTimeout(
      razorpay.subscriptions.resume(subscriptionId, {
        resume_at: resume_at || "now",
      }),
      10000
    );

    const updated = await withTimeout(
      Subscription.findOneAndUpdate(
        { subscriptionId },
        {
          status: "active",
          resumedAt: new Date(),
          currentStart: toDate(resumed.current_start),
          currentEnd: toDate(resumed.current_end),
          chargeAt: toDate(resumed.charge_at),
        },
        { new: true }
      ),
      5000
    );

    return res
      .status(200)
      .json(new ApiResponse(200, updated, "Subscription resumed successfully"));
  } catch (err) {
    console.error("Resume failed:", err);
    throw new ApiError(500, `Failed to resume subscription: ${err.message}`);
  }
});

// ============================================
// WEBHOOK HANDLER
// ============================================

export const subscriptionWebhook = async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("⚠️ RAZORPAY_WEBHOOK_SECRET not configured");
      return res.status(503).json({ received: false, message: "Webhook secret missing" });
    }

    const receivedSignature = req.headers["x-razorpay-signature"];

    if (!receivedSignature) {
      console.error("⚠️ Missing webhook signature");
      return res.status(400).json({ received: false, message: "Missing signature" });
    }

    if (!req.rawBody) {
      console.error("⚠️ req.rawBody not available. Check webhook middleware.");
      return res.status(400).json({ received: false, message: "Missing raw body" });
    }

    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(req.rawBody)
      .digest("hex");

    if (!hasValidWebhookSignature(receivedSignature, expectedSignature)) {
      console.error("⚠️ Invalid webhook signature");
      return res.status(401).json({ received: false, message: "Invalid signature" });
    }

    const event = req.body.event;
    console.log(`📥 Webhook received: ${event}`);

    switch (event) {
      case "subscription.activated":
        await handleSubscriptionActivated(req.body.payload);
        break;

      case "subscription.charged":
        await handleSubscriptionCharged(req.body.payload);
        break;

      case "subscription.completed":
        await handleSubscriptionCompleted(req.body.payload);
        break;

      case "subscription.cancelled":
        await handleSubscriptionCancelled(req.body.payload);
        break;

      case "subscription.paused":
        await handleSubscriptionPaused(req.body.payload);
        break;

      case "subscription.resumed":
        await handleSubscriptionResumed(req.body.payload);
        break;

      case "subscription.pending":
        await handleSubscriptionPending(req.body.payload);
        break;

      case "subscription.halted":
        await handleSubscriptionHalted(req.body.payload);
        break;

      case "subscription.authenticated":
        await handleSubscriptionAuthenticated(req.body.payload);
        break;

      case "payment.failed":
        await handlePaymentFailed(req.body.payload);
        break;

      default:
        console.log(`ℹ️ Unhandled event: ${event}`);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("❌ Webhook processing error:", {
      message: error.message,
      stack: error.stack,
      event: req.body?.event,
    });

    return res
      .status(500)
      .json({ received: false, message: "Webhook processing failed" });
  }
};

// ============================================
// WEBHOOK EVENT HANDLERS
// ============================================

async function handleSubscriptionActivated(payload) {
  try {
    const subscription = payload.subscription.entity;

    const updated = await withTimeout(
      Subscription.findOneAndUpdate(
        { subscriptionId: subscription.id },
        {
          status: "active",
          startAt: toDate(subscription.start_at),
          endAt: toDate(subscription.end_at),
          currentStart: toDate(subscription.current_start),
          currentEnd: toDate(subscription.current_end),
          chargeAt: toDate(subscription.charge_at),
          activatedAt: new Date(),
          paidCount: subscription.paid_count || 0,
          remainingCount:
            subscription.remaining_count ?? subscription.total_count,
        }
      ),
      5000
    );

    if (!updated) {
      console.error(
        "❌ subscription.activated: Subscription not found for id:",
        subscription.id
      );
    } else {
      console.log("✅ Subscription activated:", subscription.id);
    }
  } catch (error) {
    console.error("❌ Error handling subscription.activated:", error);
    throw error;
  }
}

async function handleSubscriptionAuthenticated(payload) {
  try {
    const subscription = payload.subscription.entity;

    const updated = await withTimeout(
      Subscription.findOneAndUpdate(
        { subscriptionId: subscription.id },
        {
          status: "authenticated",
        }
      ),
      5000
    );

    if (!updated) {
      console.error(
        "❌ subscription.authenticated: Subscription not found for id:",
        subscription.id
      );
    } else {
      console.log("✅ Subscription authenticated:", subscription.id);
    }
  } catch (error) {
    console.error("❌ Error handling subscription.authenticated:", error);
    throw error;
  }
}

async function handleSubscriptionCharged(payload) {
  try {
    const payment = payload.payment.entity;
    const subscription = payload.subscription.entity;

    const updated = await withTimeout(
      Subscription.findOneAndUpdate(
        { subscriptionId: subscription.id },
        {
          status: subscription.status,
          lastPaymentId: payment.id,
          lastChargedAt: new Date(),
          paidCount: subscription.paid_count,
          remainingCount:
            subscription.remaining_count ?? subscription.total_count,
          currentStart: toDate(subscription.current_start),
          currentEnd: toDate(subscription.current_end),
          chargeAt: toDate(subscription.charge_at),
        }
      ),
      5000
    );

    if (!updated) {
      console.error(
        "❌ subscription.charged: Subscription not found for id:",
        subscription.id
      );
    } else {
      console.log("✅ Subscription charged:", subscription.id);
    }
  } catch (error) {
    console.error("❌ Error handling subscription.charged:", error);
    throw error;
  }
}

async function handleSubscriptionCompleted(payload) {
  try {
    const subscription = payload.subscription.entity;

    const updated = await withTimeout(
      Subscription.findOneAndUpdate(
        { subscriptionId: subscription.id },
        {
          status: "completed",
          completedAt: new Date(),
          endAt: toDate(subscription.end_at),
        }
      ),
      5000
    );

    if (!updated) {
      console.error(
        "❌ subscription.completed: Subscription not found for id:",
        subscription.id
      );
    } else {
      console.log("✅ Subscription completed:", subscription.id);
    }
  } catch (error) {
    console.error("❌ Error handling subscription.completed:", error);
    throw error;
  }
}

async function handleSubscriptionCancelled(payload) {
  try {
    const subscription = payload.subscription.entity;

    const updated = await withTimeout(
      Subscription.findOneAndUpdate(
        { subscriptionId: subscription.id },
        {
          status: "cancelled",
          cancelledAt: new Date(),
          endAt: subscription.ended_at ? toDate(subscription.ended_at) : null,
        }
      ),
      5000
    );

    if (!updated) {
      console.error(
        "❌ subscription.cancelled: Subscription not found for id:",
        subscription.id
      );
    } else {
      console.log("✅ Subscription cancelled:", subscription.id);
    }
  } catch (error) {
    console.error("❌ Error handling subscription.cancelled:", error);
    throw error;
  }
}

async function handleSubscriptionPaused(payload) {
  try {
    const subscription = payload.subscription.entity;

    const updated = await withTimeout(
      Subscription.findOneAndUpdate(
        { subscriptionId: subscription.id },
        {
          status: "paused",
          pausedAt: new Date(),
          currentStart: toDate(subscription.current_start),
          currentEnd: toDate(subscription.current_end),
          chargeAt: toDate(subscription.charge_at),
        }
      ),
      5000
    );

    if (!updated) {
      console.error(
        "❌ subscription.paused: Subscription not found for id:",
        subscription.id
      );
    } else {
      console.log("✅ Subscription paused:", subscription.id);
    }
  } catch (error) {
    console.error("❌ Error handling subscription.paused:", error);
    throw error;
  }
}

async function handleSubscriptionResumed(payload) {
  try {
    const subscription = payload.subscription.entity;

    const updated = await withTimeout(
      Subscription.findOneAndUpdate(
        { subscriptionId: subscription.id },
        {
          status: "active",
          resumedAt: new Date(),
          currentStart: toDate(subscription.current_start),
          currentEnd: toDate(subscription.current_end),
          chargeAt: toDate(subscription.charge_at),
        }
      ),
      5000
    );

    if (!updated) {
      console.error(
        "❌ subscription.resumed: Subscription not found for id:",
        subscription.id
      );
    } else {
      console.log("✅ Subscription resumed:", subscription.id);
    }
  } catch (error) {
    console.error("❌ Error handling subscription.resumed:", error);
    throw error;
  }
}

async function handleSubscriptionPending(payload) {
  try {
    const subscription = payload.subscription.entity;

    const updated = await withTimeout(
      Subscription.findOneAndUpdate(
        { subscriptionId: subscription.id },
        {
          status: "pending",
        }
      ),
      5000
    );

    if (!updated) {
      console.error(
        "❌ subscription.pending: Subscription not found for id:",
        subscription.id
      );
    } else {
      console.log("⏳ Subscription pending:", subscription.id);
    }
  } catch (error) {
    console.error("❌ Error handling subscription.pending:", error);
    throw error;
  }
}

async function handleSubscriptionHalted(payload) {
  try {
    const subscription = payload.subscription.entity;

    const updated = await withTimeout(
      Subscription.findOneAndUpdate(
        { subscriptionId: subscription.id },
        {
          status: "halted",
          haltedAt: new Date(),
        }
      ),
      5000
    );

    if (!updated) {
      console.error(
        "❌ subscription.halted: Subscription not found for id:",
        subscription.id
      );
    } else {
      console.log("⚠️ Subscription halted:", subscription.id);
    }
  } catch (error) {
    console.error("❌ Error handling subscription.halted:", error);
    throw error;
  }
}

async function handlePaymentFailed(payload) {
  try {
    const payment = payload.payment.entity;

    if (payment.subscription_id) {
      const updated = await withTimeout(
        Subscription.findOneAndUpdate(
          { subscriptionId: payment.subscription_id },
          {
            lastFailedPaymentId: payment.id,
            lastFailedAt: new Date(),
            failureReason: payment.error_description || "Payment failed",
          }
        ),
        5000
      );

      if (!updated) {
        console.error(
          "❌ payment.failed: Subscription not found for id:",
          payment.subscription_id
        );
      } else {
        console.log("❌ Payment failed for subscription:", payment.subscription_id);
      }
    }
  } catch (error) {
    console.error("❌ Error handling payment.failed:", error);
    throw error;
  }
}
