// ============================================
// subscriptionController.js
// ============================================

import Subscription from "../models/Subscription.js";
import { razorpay } from "../utils/razorpayInstance.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import Plan from "../models/Plan.js";
import crypto from "crypto";

// Helper to convert Razorpay UNIX timestamps (seconds) to JS Date
const toDate = (ts) => (ts ? new Date(ts * 1000) : null);

// ============================================
// PLAN MANAGEMENT
// ============================================

/**
 * Create a subscription plan
 * POST /api/subscriptions/plans/create
 */
export const createPlan = asyncHandler(async (req, res) => {
  const { name, amount, interval, period, description } = req.body;

  // Validation
  if (!name || !amount || !period || !interval) {
    throw new ApiError(400, "Name, amount, period, and interval are required");
  }

  const validPeriods = ["daily", "weekly", "monthly", "yearly"];
  if (!validPeriods.includes(period)) {
    throw new ApiError(400, `Period must be one of: ${validPeriods.join(", ")}`);
  }

  if (isNaN(interval) || Number(interval) <= 0) {
    throw new ApiError(400, "Interval must be a positive number");
  }

  try {
    // 1) Create plan in Razorpay
    const plan = await razorpay.plans.create({
      period,
      interval: Number(interval),
      item: {
        name,
        amount: Number(amount) * 100, // Convert to paise
        currency: "INR",
        description: description || name,
      },
    });

    // 2) Save plan metadata in Mongo (our own system)
    const dbPlan = await Plan.create({
      razorpayPlanId: plan.id,
      name: plan.item.name,
      amount: plan.item.amount / 100, // store as rupees
      currency: plan.item.currency,
      period: plan.period,
      interval: plan.interval,
      description: plan.item.description,
      isActive: true,
    });

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
    // 1) Get active plans from our DB
    const activePlans = await Plan.find({ isActive: true }).lean();

    if (!activePlans.length) {
      return res
        .status(200)
        .json(new ApiResponse(200, [], "No active plans found"));
    }

    const activeIds = new Set(activePlans.map((p) => p.razorpayPlanId));

    // 2) Fetch all plans from Razorpay
    const razorpayPlans = await razorpay.plans.all();

    // 3) Keep only those which are active in our DB
    const filteredRazorpayPlans = razorpayPlans.items.filter((p) =>
      activeIds.has(p.id)
    );

    // 4) Merge DB meta + Razorpay data
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

  try {
    const plan = await razorpay.plans.fetch(planId);
    const dbPlan = await Plan.findOne({ razorpayPlanId: planId }).lean();

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
    throw new ApiError(404, "Plan not found");
  }
});
/**
 * Soft delete / deactivate a plan
 * DELETE /api/subscriptions/plans/:planId
 *
 * planId = Razorpay plan id
 */
export const deletePlan = asyncHandler(async (req, res) => {
  const { planId } = req.params;

  const updated = await Plan.findOneAndUpdate(
    { razorpayPlanId: planId },
    { isActive: false },
    { new: true }
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

  // ---------------------------------------------
  // Basic validation
  // ---------------------------------------------
  if (!plan_id) {
    throw new ApiError(400, "plan_id is required");
  }

  // Validate user details
  if (!req.user.email) {
    throw new ApiError(400, "User email is required for subscription");
  }

  // ✅ Check if plan is active in our system (Plan collection)
  const activePlan = await Plan.findOne({
    razorpayPlanId: plan_id,
    isActive: true,
  });

  if (!activePlan) {
    throw new ApiError(
      400,
      "Selected plan is not available. Please choose another plan."
    );
  }

  try {
    // ---------------------------------------------
    // 1) Check if user already has a subscription for this plan
    //    (created / authenticated / active / pending)
    // ---------------------------------------------
    const existingSubscription = await Subscription.findOne({
      userId,
      planId: plan_id,
      status: { $in: ["created", "authenticated", "active", "pending"] },
    });

    if (existingSubscription) {
      throw new ApiError(
        400,
        "You already have an active subscription for this plan"
      );
    }

    // ---------------------------------------------
    // 2) Find or create Razorpay customer
    // ---------------------------------------------
    let customer;

    const existingCustomer = await Subscription.findOne({
      userId,
      customerId: { $exists: true, $ne: null },
    }).select("customerId");

    if (existingCustomer?.customerId) {
      try {
        customer = await razorpay.customers.fetch(existingCustomer.customerId);
      } catch (err) {
        // Customer not found in Razorpay, create new one
        console.log("Customer not found in Razorpay, creating new one");
        customer = null;
      }
    }

    if (!customer) {
      customer = await razorpay.customers.create({
        name: req.user.name || "User",
        email: req.user.email,
        contact: req.user.phone || "",
        fail_existing: 0, // Don't fail if customer with email exists
      });
    }

    // ---------------------------------------------
    // 3) Create subscription on Razorpay
    // ---------------------------------------------
    const subscription = await razorpay.subscriptions.create({
      plan_id,
      customer_id: customer.id,
      total_count: total_count || 12,
      quantity: 1,
      customer_notify: 1,
      notes: notes || {},
    });

    // ---------------------------------------------
    // 4) Save subscription to MongoDB
    // ---------------------------------------------
    const newSubscription = await Subscription.create({
      userId,
      subscriptionId: subscription.id,
      planId: plan_id,
      customerId: customer.id,
      status: subscription.status,
      totalCount: subscription.total_count,
      paidCount: subscription.paid_count || 0,
      // IMPORTANT FIX: respect 0 instead of falling back
      remainingCount:
        subscription.remaining_count ?? subscription.total_count,
      startAt: toDate(subscription.start_at),
      endAt: toDate(subscription.end_at),
      chargeAt: toDate(subscription.charge_at),
      currentStart: toDate(subscription.current_start),
      currentEnd: toDate(subscription.current_end),
      notes: subscription.notes,
    });

    // ---------------------------------------------
    // 5) Send response
    // ---------------------------------------------
    return res.status(201).json(
      new ApiResponse(
        201,
        {
          subscription: {
            id: subscription.id,
            short_url: subscription.short_url,
            status: subscription.status,
          },
          dbRecord: newSubscription,
        },
        "Subscription created successfully. Please complete the payment."
      )
    );
  } catch (err) {
    console.error("Subscription creation failed:", err);
    if (err instanceof ApiError) throw err;
    throw new ApiError(500, `Failed to create subscription: ${err.message}`);
  }
});
/**
 * Verify subscription payment
 * POST /api/subscriptions/verify
 */
export const verifySubscriptionPayment = asyncHandler(async (req, res) => {
  const {
    razorpay_payment_id,
    razorpay_subscription_id,
    razorpay_signature,
  } = req.body;

  if (!razorpay_payment_id || !razorpay_subscription_id || !razorpay_signature) {
    throw new ApiError(400, "Missing required payment verification fields");
  }

  // Verify signature
  const generatedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_SECRET)
    .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
    .digest("hex");

  if (generatedSignature !== razorpay_signature) {
    // Mark as failed
    await Subscription.findOneAndUpdate(
      { subscriptionId: razorpay_subscription_id },
      {
        status: "failed",
        failureReason: "Invalid signature",
      }
    );
    throw new ApiError(400, "Invalid payment signature");
  }

  try {
    // Fetch subscription details from Razorpay
    const subscription = await razorpay.subscriptions.fetch(
      razorpay_subscription_id
    );

    // Fetch payment details
    const payment = await razorpay.payments.fetch(razorpay_payment_id);

    // Update subscription in database
    const updated = await Subscription.findOneAndUpdate(
      { subscriptionId: razorpay_subscription_id },
      {
        lastPaymentId: razorpay_payment_id,
        status: subscription.status,
        paidCount: subscription.paid_count,
        remainingCount:
          subscription.remaining_count ?? subscription.total_count,
        // Prefer gateway time if available
        lastChargedAt: payment.created_at
          ? toDate(payment.created_at)
          : new Date(),
        currentStart: toDate(subscription.current_start),
        currentEnd: toDate(subscription.current_end),
        chargeAt: toDate(subscription.charge_at),
        activatedAt: subscription.status === "active" ? new Date() : undefined,
      },
      { new: true }
    );

    if (!updated) {
      throw new ApiError(404, "Subscription not found in database");
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          subscription: updated,
          payment: {
            id: payment.id,
            amount: payment.amount,
            status: payment.status,
          },
        },
        "Payment verified and subscription activated successfully"
      )
    );
  } catch (err) {
    console.error("Payment verification failed:", err);
    if (err instanceof ApiError) throw err;
    throw new ApiError(500, `Payment verification failed: ${err.message}`);
  }
});

/**
 * Get user's subscriptions
 * GET /api/subscriptions/user/all
 */
export const getUserSubscriptions = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { status } = req.query;

  const filter = { userId };
  if (status) {
    filter.status = status;
  }

  const subscriptions = await Subscription.find(filter)
    .sort({ createdAt: -1 })
    .lean();

  return res.status(200).json(
    new ApiResponse(
      200,
      subscriptions,
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

  const subscription = await Subscription.findOne({
    subscriptionId,
    userId, // Ensure user can only access their own subscriptions
  });

  if (!subscription) {
    throw new ApiError(404, "Subscription not found");
  }

  // Optionally fetch latest from Razorpay
  try {
    const razorpaySubscription = await razorpay.subscriptions.fetch(
      subscriptionId
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

  // Verify ownership
  const subscription = await Subscription.findOne({
    subscriptionId,
    userId,
  });

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
    // Cancel on Razorpay
    const cancelled = await razorpay.subscriptions.cancel(subscriptionId, {
      cancel_at_cycle_end: !!cancel_at_cycle_end,
    });

    // Update in database
    const updated = await Subscription.findOneAndUpdate(
      { subscriptionId },
      {
        status: cancel_at_cycle_end ? "pending_cancellation" : "cancelled",
        cancelledAt: new Date(),
        endAt: cancelled.ended_at ? toDate(cancelled.ended_at) : null,
      },
      { new: true }
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

  const subscription = await Subscription.findOne({
    subscriptionId,
    userId,
  });

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
    const paused = await razorpay.subscriptions.pause(subscriptionId, {
      pause_at: pause_at || "now",
    });

    const updated = await Subscription.findOneAndUpdate(
      { subscriptionId },
      {
        status: "paused",
        pausedAt: new Date(),
        currentStart: toDate(paused.current_start),
        currentEnd: toDate(paused.current_end),
        chargeAt: toDate(paused.charge_at),
      },
      { new: true }
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

  const subscription = await Subscription.findOne({
    subscriptionId,
    userId,
  });

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
    const resumed = await razorpay.subscriptions.resume(subscriptionId, {
      resume_at: resume_at || "now",
    });

    const updated = await Subscription.findOneAndUpdate(
      { subscriptionId },
      {
        status: "active",
        resumedAt: new Date(),
        currentStart: toDate(resumed.current_start),
        currentEnd: toDate(resumed.current_end),
        chargeAt: toDate(resumed.charge_at),
      },
      { new: true }
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

/**
 * Handle Razorpay webhooks
 * POST /api/webhooks/razorpay/subscription
 */
export const subscriptionWebhook = async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("⚠️ RAZORPAY_WEBHOOK_SECRET not configured");
      return res.status(200).json({ received: true }); // Still return 200
    }

    const receivedSignature = req.headers["x-razorpay-signature"];

    if (!receivedSignature) {
      console.error("⚠️ Missing webhook signature");
      return res.status(200).json({ received: true });
    }

    // req.rawBody must be set by middleware
    if (!req.rawBody) {
      console.error("⚠️ req.rawBody not available. Check webhook middleware.");
      return res.status(200).json({ received: true });
    }

    // Verify signature
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(req.rawBody)
      .digest("hex");

    if (receivedSignature !== expectedSignature) {
      console.error("⚠️ Invalid webhook signature");
      return res.status(200).json({ received: true });
    }

    const event = req.body.event;
    console.log(`📥 Webhook received: ${event}`);

    // Handle different events
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

    // Always return 200 to prevent Razorpay retries
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("❌ Webhook processing error:", error);
    // Still return 200 to prevent retries
    return res.status(200).json({ received: true });
  }
};

// ============================================
// WEBHOOK EVENT HANDLERS
// ============================================

async function handleSubscriptionActivated(payload) {
  try {
    const subscription = payload.subscription.entity;

    const updated = await Subscription.findOneAndUpdate(
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
  }
}

async function handleSubscriptionAuthenticated(payload) {
  try {
    const subscription = payload.subscription.entity;

    const updated = await Subscription.findOneAndUpdate(
      { subscriptionId: subscription.id },
      {
        status: "authenticated",
      }
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
  }
}

async function handleSubscriptionCharged(payload) {
  try {
    const payment = payload.payment.entity;
    const subscription = payload.subscription.entity;

    const updated = await Subscription.findOneAndUpdate(
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
  }
}

async function handleSubscriptionCompleted(payload) {
  try {
    const subscription = payload.subscription.entity;

    const updated = await Subscription.findOneAndUpdate(
      { subscriptionId: subscription.id },
      {
        status: "completed",
        completedAt: new Date(),
        endAt: toDate(subscription.end_at),
      }
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
  }
}

async function handleSubscriptionCancelled(payload) {
  try {
    const subscription = payload.subscription.entity;

    const updated = await Subscription.findOneAndUpdate(
      { subscriptionId: subscription.id },
      {
        status: "cancelled",
        cancelledAt: new Date(),
        endAt: subscription.ended_at ? toDate(subscription.ended_at) : null,
      }
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
  }
}

async function handleSubscriptionPaused(payload) {
  try {
    const subscription = payload.subscription.entity;

    const updated = await Subscription.findOneAndUpdate(
      { subscriptionId: subscription.id },
      {
        status: "paused",
        pausedAt: new Date(),
        currentStart: toDate(subscription.current_start),
        currentEnd: toDate(subscription.current_end),
        chargeAt: toDate(subscription.charge_at),
      }
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
  }
}

async function handleSubscriptionResumed(payload) {
  try {
    const subscription = payload.subscription.entity;

    const updated = await Subscription.findOneAndUpdate(
      { subscriptionId: subscription.id },
      {
        status: "active",
        resumedAt: new Date(),
        currentStart: toDate(subscription.current_start),
        currentEnd: toDate(subscription.current_end),
        chargeAt: toDate(subscription.charge_at),
      }
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
  }
}

async function handleSubscriptionPending(payload) {
  try {
    const subscription = payload.subscription.entity;

    const updated = await Subscription.findOneAndUpdate(
      { subscriptionId: subscription.id },
      {
        status: "pending",
      }
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
  }
}

async function handleSubscriptionHalted(payload) {
  try {
    const subscription = payload.subscription.entity;

    const updated = await Subscription.findOneAndUpdate(
      { subscriptionId: subscription.id },
      {
        status: "halted",
        haltedAt: new Date(),
      }
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
  }
}

async function handlePaymentFailed(payload) {
  try {
    const payment = payload.payment.entity;

    if (payment.subscription_id) {
      const updated = await Subscription.findOneAndUpdate(
        { subscriptionId: payment.subscription_id },
        {
          lastFailedPaymentId: payment.id,
          lastFailedAt: new Date(),
          failureReason: payment.error_description || "Payment failed",
        }
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
  }
}
