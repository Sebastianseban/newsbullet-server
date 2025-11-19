import express from "express";
import { getVideosFromDB } from "../controllers/youtube.controller.js";


const router = express.Router();

router.get("/", getVideosFromDB);

export default router;
