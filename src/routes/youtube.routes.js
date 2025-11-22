import express from "express";
import { getVideosFromDB } from "../controllers/youtube.controller.js";
import { verifyJWT } from "../middleware/auth.Middleware.js";


const router = express.Router();


router.get("/",verifyJWT, getVideosFromDB);

export default router;
