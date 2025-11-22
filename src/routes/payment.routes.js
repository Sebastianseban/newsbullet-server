import express from "express";
import {
  createPlan,
  getAllPlans,
  getPlanById,
  createSubscription,
  verifySubscriptionPayment,
  getUserSubscriptions,
  getSubscription,
  cancelSubscription,
  pauseSubscription,
  resumeSubscription,
  subscriptionWebhook,
} from "../controllers/payment.controller.js"
import { verifyJWT } from "../middleware/auth.Middleware.js";

const router = express.Router();

// Plan routes
router.post("/plans/create", createPlan);
router.get("/plans", getAllPlans);
router.get("/plans/:planId", getPlanById);

// Subscription routes
router.post("/create",verifyJWT, createSubscription);
router.post("/verify", verifySubscriptionPayment);
router.get("/user/all", getUserSubscriptions);
router.get("/:subscriptionId",  getSubscription);
router.post("/:subscriptionId/cancel",  cancelSubscription);
router.post("/:subscriptionId/pause",  pauseSubscription);
router.post("/:subscriptionId/resume", resumeSubscription);

export default router;


export const webhookHandler = subscriptionWebhook;