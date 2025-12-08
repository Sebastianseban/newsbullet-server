import express from "express";
import {
  
  getAllNews,
  getNewsBySlug,
  updateNews,
  deleteNews,
  createNews
} from "../controllers/news.contoller.js"

const router = express.Router();

// CRUD routes
router.post("/", createNews);
router.get("/", getAllNews);
router.get("/:slug", getNewsBySlug);
router.put("/:slug", updateNews);
router.delete("/:slug", deleteNews);

export default router;
