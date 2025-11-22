import cookieParser from "cookie-parser";
import express from "express";
import cors from "cors";
import compression from "compression";
import helmet from "helmet";
import cron from "node-cron";

import { errorHandler, notFound } from "./middleware/errorHandler.middleware.js";

import paymentRoutes from "./routes/payment.routes.js";
import youtubeRoutes from "./routes/youtube.routes.js";
import authRoutes from "./routes/auth.routes.js";


import { subscriptionWebhook } from "./controllers/payment.controller.js"
import { syncYouTubeVideos } from "./services/youtubeSync.js";

const app = express();

/**
 * 🧾 RAW BODY FOR RAZORPAY PAYMENT WEBHOOK (EXISTING)
 * Make sure this stays BEFORE express.json()
 */
app.use(
  "/api/payments/webhook",
  express.raw({ type: "application/json" })
);

/**
 * 🧾 RAW BODY FOR RAZORPAY SUBSCRIPTION WEBHOOK
 * This route needs raw body for signature verification.
 * Must also be BEFORE express.json()
 */
app.post(
  "/api/webhooks/razorpay/subscription",
  express.raw({ type: "application/json" }),
  (req, res, next) => {
    // Save raw body for HMAC verification
    req.rawBody = req.body.toString();

    // Parse JSON body manually so controller can use req.body as object
    try {
      req.body = JSON.parse(req.rawBody || "{}");
    } catch (e) {
      req.body = {};
    }

    subscriptionWebhook(req, res, next);
  }
);

// Normal JSON/body parsers for all other routes
app.use(express.json({ limit: "20kb" }));
app.use(cookieParser());
app.use(compression());
app.use(helmet());

app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);

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

// Payments (existing)
app.use("/api/v1/payments", paymentRoutes );
app.use("/api/v1/auth", authRoutes);

// Subscriptions (new)


// YouTube routes (existing)
app.use("/api/youtube", youtubeRoutes);

app.get("/", (req, res) => {
  res.send("News Bullet Kerala Backend Running 🚀");
});

// Error handlers
app.use(notFound);
app.use(errorHandler);

export { app };
