import express from "express";
import { createOrder, verifyPayment, webhookHandler } from "../controllers/payment.controller.js";

const router = express.Router()


// Create Razorpay Order
router.post("/create-order", createOrder);

// Verify payment (frontend callback)
router.post("/verify", verifyPayment);

// Razorpay webhook (must handle RAW body)
router.post("/webhook", webhookHandler);

export default router;