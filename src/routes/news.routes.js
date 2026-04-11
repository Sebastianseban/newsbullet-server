import express from "express";
import {
  getAllNews,
  getNewsBySlug,
  updateNews,
  deleteNews,
  createNews,
} from "../controllers/news.contoller.js";
import { verifyJWT } from "../middleware/auth.Middleware.js";
import { requireAdmin } from "../middleware/role.middleware.js";
import { createRateLimiter } from "../middleware/rateLimit.middleware.js";

const router = express.Router();
const newsReadLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: "Too many news requests. Please slow down.",
});

// CRUD routes (writes: admin only)
router.post("/", verifyJWT, requireAdmin, createNews);
router.get("/", newsReadLimiter, getAllNews);
router.get("/:slug", newsReadLimiter, getNewsBySlug);
router.put("/:slug", verifyJWT, requireAdmin, updateNews);
router.delete("/:slug", verifyJWT, requireAdmin, deleteNews);

export default router;
