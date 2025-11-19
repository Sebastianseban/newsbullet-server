import Payment from "../models/Payment.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { razorpay } from "../utils/razorpayInstance.js";
import crypto from "crypto";

export const createOrder = asyncHandler(async (req, res) => {
  const { amount } = req.body;

  if (!amount || isNaN(amount) || Number(amount) <= 0) {
    throw new ApiError(
      400,
      "Amount is required and must be a valid number greater than 0"
    );
  }

  let order;
  try {
    order = await razorpay.orders.create({
      amount: Number(amount) * 100,
      currency: "INR",
      payment_capture: 1,
    });
  } catch (err) {
    console.error("Razorpay order creation failed:", err);
    throw new ApiError(500, "Failed to create Razorpay order");
  }

  // Store initial order in database
  await Payment.create({
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    status: "created",
  });

  return res
    .status(201)
    .json(new ApiResponse(201, order, "Order placed successfully"));
});

export const verifyPayment = asyncHandler(async (req, res) => {
  const { order_id, payment_id, signature } = req.body;

  if (!order_id || !payment_id || !signature) {
    throw new ApiError(400, "Missing required payment fields");
  }

  // Verify signature
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_SECRET)
    .update(order_id + "|" + payment_id)
    .digest("hex");

  const isValid = expectedSignature === signature;

  if (!isValid) {
    // Update payment status to failed
    await Payment.findOneAndUpdate(
      { orderId: order_id },
      { status: "failed" },
      { new: true }
    );
    throw new ApiError(400, "Invalid payment signature");
  }

  // Update payment with successful verification
  const updatedPayment = await Payment.findOneAndUpdate(
    { orderId: order_id },
    {
      paymentId: payment_id,
      signature,
      status: "captured",
    },
    { new: true }
  );

  if (!updatedPayment) {
    throw new ApiError(404, "Order not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, updatedPayment, "Payment verified successfully"));
});

export const webhookHandler = async (req, res) => {
  try {
    const webhookSecret = process.env.WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("⚠️ WEBHOOK_SECRET not configured");
      return res.status(500).json({ error: "Server configuration error" });
    }

    const receivedSig = req.headers["x-razorpay-signature"];
    
    if (!receivedSig) {
      console.error("⚠️ Missing signature header");
      return res.status(400).json({ error: "Missing signature" });
    }

    // req.rawBody should be set up in your Express middleware
    // See the middleware setup below
    const expectedSig = crypto
      .createHmac("sha256", webhookSecret)
      .update(req.rawBody)
      .digest("hex");

    if (receivedSig !== expectedSig) {
      console.error("⚠️ Invalid webhook signature");
      return res.status(400).json({ error: "Invalid signature" });
    }

    const event = req.body.event;
    const paymentEntity = req.body?.payload?.payment?.entity;

    if (!paymentEntity) {
      console.error("⚠️ Invalid webhook payload structure");
      // Still return 200 to prevent retries
      return res.status(200).json({ received: true });
    }

    // Update payment in database
    try {
      await Payment.findOneAndUpdate(
        { orderId: paymentEntity.order_id },
        {
          paymentId: paymentEntity.id,
          amount: paymentEntity.amount,
          currency: paymentEntity.currency,
          status: paymentEntity.status,
          email: paymentEntity.email,
          contact: paymentEntity.contact,
        },
        { upsert: true, new: true }
      );

      console.log("✅ Razorpay Webhook processed:", event);
    } catch (dbError) {
      console.error("❌ Database update failed:", dbError);
      // Still return 200 to Razorpay to prevent retries
    }

    // MUST respond with 200 or Razorpay will retry
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("❌ Webhook handler error:", error);
    // Return 200 even on error to prevent Razorpay retries
    return res.status(200).json({ received: true });
  }
};