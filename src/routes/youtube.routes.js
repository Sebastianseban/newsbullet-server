import express from "express";
import { getVideosFromDB } from "../controllers/youtube.controller.js";
import { verifyJWT } from "../middleware/auth.Middleware.js";
import { createRateLimiter } from "../middleware/rateLimit.middleware.js";

const router = express.Router();
const youtubeLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: "Too many YouTube requests. Please try again later.",
});

router.get("/", verifyJWT, youtubeLimiter, getVideosFromDB);

export default router;
