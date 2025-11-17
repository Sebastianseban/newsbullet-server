import mongoose from "mongoose";

const PaymentSchema = new mongoose.Schema(
  {
    orderId: String,
    paymentId: String,
    signature: String,
    amount: Number,
    currency: String,
    status: String,
    email: String,
    contact: String,
  },
  { timestamps: true }
);

export default mongoose.model("Payment", PaymentSchema);
