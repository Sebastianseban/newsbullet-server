import Payment from "../models/Payment.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { razorpay } from "../utils/razorpayInstance.js";

export const createOrder = asyncHandler(async (req, res) => {
  const { amount } = req.body;


  if (!amount || isNaN(amount) || Number(amount) <= 0) {
    throw new ApiError(400, "Amount is required and must be a valid number greater than 0");
  }


  let order;
  try {
    order = await razorpay.orders.create({
      amount: Number(amount) * 100, 
      currency: "INR",
      payment_capture: 1,
    });
  } catch (err) {
    throw new ApiError(500, "Failed to create Razorpay order");
  }


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
