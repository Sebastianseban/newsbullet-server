import express from "express";
import {
  getAllNews,
  getNewsBySlug,
  updateNews,
  deleteNews,
  createNews,
} from "../controllers/news.contoller.js";
import { verifyJWT } from "../middleware/auth.Middleware.js";
import { createRateLimiter } from "../middleware/rateLimit.middleware.js";

const router = express.Router();
const newsReadLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: "Too many news requests. Please slow down.",
});

// CRUD routes
router.post("/", verifyJWT, createNews);
router.get("/", newsReadLimiter, getAllNews);
router.get("/:slug", newsReadLimiter, getNewsBySlug);
router.put("/:slug", verifyJWT, updateNews);
router.delete("/:slug", verifyJWT, deleteNews);

export default router;
