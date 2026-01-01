import express from "express";
import {
  getAllNews,
  getNewsBySlug,
  updateNews,
  deleteNews,
  createNews,
} from "../controllers/news.contoller.js";
import { verifyJWT } from "../middleware/auth.Middleware.js";

const router = express.Router();

// CRUD routes
router.post("/", verifyJWT, createNews);
router.get("/", getAllNews);
router.get("/:slug", getNewsBySlug);
router.put("/:slug", verifyJWT, updateNews);
router.delete("/:slug", verifyJWT, deleteNews);

export default router;
