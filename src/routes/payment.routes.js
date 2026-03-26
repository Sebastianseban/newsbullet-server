import express from "express";
import {
  createPlan,
  getAllPlans,
  getPlanById,
  deletePlan,
  createSubscription,
  getUserSubscriptions,
  getSubscription,
  cancelSubscription,
  pauseSubscription,
  resumeSubscription,
} from "../controllers/payment.controller.js";
import { verifyJWT } from "../middleware/auth.Middleware.js";
import { requireAdmin } from "../middleware/role.middleware.js";
import { createRateLimiter } from "../middleware/rateLimit.middleware.js";

const router = express.Router();
const paymentLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: "Too many payment requests. Please try again later.",
});
const adminPlanLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  message: "Too many plan management requests. Please try again later.",
});

// =====================
// Plan routes
// =====================

router.post(
  "/plans/create",
  verifyJWT,
  requireAdmin,
  adminPlanLimiter,
  createPlan
);
router.get("/plans", verifyJWT, paymentLimiter, getAllPlans);
router.get("/plans/:planId", verifyJWT, paymentLimiter, getPlanById);
router.delete(
  "/plans/:planId",
  verifyJWT,
  requireAdmin,
  adminPlanLimiter,
  deletePlan
);

// =====================
// Subscription routes
// =====================

router.post("/create", verifyJWT, paymentLimiter, createSubscription);

router.get("/user/all", verifyJWT, paymentLimiter, getUserSubscriptions);
router.get("/:subscriptionId", verifyJWT, paymentLimiter, getSubscription);
router.post(
  "/:subscriptionId/cancel",
  verifyJWT,
  paymentLimiter,
  cancelSubscription
);
router.post(
  "/:subscriptionId/pause",
  verifyJWT,
  paymentLimiter,
  pauseSubscription
);
router.post(
  "/:subscriptionId/resume",
  verifyJWT,
  paymentLimiter,
  resumeSubscription
);

export default router;
