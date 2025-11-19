import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  subscriptionId: { type: String, required: true },   // Razorpay subscription
  planId: { type: String, required: true },
  customerId: { type: String, required: true },

  status: { type: String, default: "created" }, // created, active, charged, cancelled, expired

  currentPaymentId: { type: String },
  lastPaymentDate: { type: Date },

  nextDueDate: { type: Date },
});

export default mongoose.model("Subscription", subscriptionSchema);
