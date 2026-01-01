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

router.get("/user/all", verifyJWT, getUserSubscriptions);
router.get("/:subscriptionId", verifyJWT, getSubscription);
router.post("/:subscriptionId/cancel", verifyJWT, cancelSubscription);
router.post("/:subscriptionId/pause", verifyJWT, pauseSubscription);
router.post("/:subscriptionId/resume", verifyJWT, resumeSubscription);

export default router;
