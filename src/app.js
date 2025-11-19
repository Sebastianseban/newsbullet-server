import cookieParser from "cookie-parser";
import express from "express";
import cors from "cors";
import compression from "compression";
import helmet from "helmet";
import cron from "node-cron";

import { errorHandler, notFound } from "./middleware/errorHandler.middleware.js";

const app = express();

app.use(
  "/api/payments/webhook",
  express.raw({ type: "application/json" })
);

app.use(express.json({ limit: "20kb" }));
app.use(cookieParser());
app.use(compression());
app.use(helmet());

app.use(
  cors({
    origin: "*",
    credentials: true,
  })
);

import paymentRoutes from "./routes/payment.routes.js";
import youtubeRoutes from "./routes/youtube.routes.js";
import { syncYouTubeVideos } from "./services/youtubeSync.js";

// ---------------------------------------------
// 🔥 1. RUN SYNC ONCE (Optional First Fill)
// ---------------------------------------------
// Uncomment this only once to fill MongoDB the first time
// syncYouTubeVideos();

// ---------------------------------------------
// 🔥 2. CRON JOB — SYNC EVERY DAY AT 3 AM
// ---------------------------------------------




cron.schedule("0 3 * * *", () => {
  console.log("⏰ CRON: Running Daily YouTube Sync at 3 AM...");
  syncYouTubeVideos();
});

// ---------------------------------------------
// ROUTES
// ---------------------------------------------
app.use("/api/v1/payments", paymentRoutes);
app.use("/api/youtube", youtubeRoutes);

app.get("/", (req, res) => {
  res.send("News Bullet Kerala Backend Running 🚀");
});

// Error handlers
app.use(notFound);
app.use(errorHandler);

export { app };
