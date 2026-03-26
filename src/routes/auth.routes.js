import express from "express";
import {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  getCurrentUser,
} from "../controllers/auth.controller.js";
import { verifyJWT } from "../middleware/auth.Middleware.js";
import { createRateLimiter } from "../middleware/rateLimit.middleware.js";

const router = express.Router();
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many authentication requests. Please try again later.",
});

// Public routes
router.post("/register", authLimiter, registerUser);
router.post("/login", authLimiter, loginUser);
router.post("/refresh-token", authLimiter, refreshAccessToken);

// Protected routes
router.get("/me", verifyJWT, getCurrentUser);
router.post("/logout", verifyJWT, logoutUser);

export default router;
