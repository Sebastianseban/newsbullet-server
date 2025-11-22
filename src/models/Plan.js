// models/Plan.js
import mongoose from "mongoose";

const planSchema = new mongoose.Schema(
  {
    razorpayPlanId: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    amount: {
      type: Number, // store in rupees for your convenience
      required: true,
    },
    currency: {
      type: String,
      default: "INR",
    },
    period: {
      type: String, // daily / weekly / monthly / yearly
      required: true,
    },
    interval: {
      type: Number,
      required: true,
    },
    description: {
      type: String,
    },
    isActive: {
      type: Boolean,
      default: true, // soft delete flag
    },
  },
  { timestamps: true }
);

const Plan = mongoose.model("Plan", planSchema);
export default Plan;
