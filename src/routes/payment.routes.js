import express from "express";
import {
  createPlan,
  getAllPlans,
  getPlanById,
  deletePlan,
  createSubscription,
  verifySubscriptionPayment,
  getUserSubscriptions,
  getSubscription,
  cancelSubscription,
  pauseSubscription,
  resumeSubscription,
  subscriptionWebhook,
} from "../controllers/payment.controller.js";
import { verifyJWT } from "../middleware/auth.Middleware.js";

const router = express.Router();

// =====================
// Plan routes
// =====================

// (optional: protect with admin middleware later)
router.post("/plans/create", verifyJWT, createPlan);
router.get("/plans", verifyJWT, getAllPlans);
router.get("/plans/:planId", verifyJWT, getPlanById);
router.delete("/plans/:planId", verifyJWT, deletePlan);

// =====================
// Subscription routes
// =====================

router.post("/create", verifyJWT, createSubscription);
router.post("/verify", verifySubscriptionPayment); // Razorpay callback → no auth
router.get("/user/all", verifyJWT, getUserSubscriptions);
router.get("/:subscriptionId", verifyJWT, getSubscription);
router.post("/:subscriptionId/cancel", verifyJWT, cancelSubscription);
router.post("/:subscriptionId/pause", verifyJWT, pauseSubscription);
router.post("/:subscriptionId/resume", verifyJWT, resumeSubscription);

// =====================
// Webhook route (no auth)
// =====================

router.post("/webhook/razorpay/subscription", subscriptionWebhook);

export default router;
