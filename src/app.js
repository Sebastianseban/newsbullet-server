import cookieParser from "cookie-parser";
import express from "express";
import cors from "cors";
import compression from "compression";
import helmet from "helmet";

import { errorHandler, notFound } from "./middleware/errorHandler.middleware.js";

import paymentRoutes from "./routes/payment.routes.js";
import youtubeRoutes from "./routes/youtube.routes.js";
import authRoutes from "./routes/auth.routes.js";
import newsRoutes from "./routes/news.routes.js";

import { subscriptionWebhook } from "./controllers/payment.controller.js";

const app = express();

/**
 * 🔒 RAW BODY FOR WEBHOOKS (must be before express.json)
 */
app.post(
  "/api/webhooks/razorpay/subscription",
  express.raw({ type: "application/json" }),
  (req, res, next) => {
    try {
      req.rawBody = req.body.toString();
      req.body = JSON.parse(req.rawBody || "{}");
    } catch {
      req.body = {};
    }

    return subscriptionWebhook(req, res, next); // ✅ important
  }
);

// Normal middleware
app.use(express.json({ limit: "20kb" }));
app.use(cookieParser());
app.use(compression());
app.use(helmet());

// ✅ FIXED: dynamic CORS
const allowedOrigins = [
  "http://localhost:3000",
  "https://newsbulletkerala.com",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

// ---------------------------------------------
// ROUTES
// ---------------------------------------------
app.use("/api/v1/payments", paymentRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/news", newsRoutes);
app.use("/api/youtube", youtubeRoutes);

// ---------------------------------------------
// HEALTH CHECKS (REAL)
// ---------------------------------------------
import mongoose from "mongoose";

app.get("/livez", (req, res) => {
  res.status(200).json({ status: "alive" });
});

app.get("/readyz", (req, res) => {
  const dbReady = mongoose.connection.readyState === 1;

  if (!dbReady) {
    return res.status(500).json({ status: "not ready", db: "down" });
  }

  res.status(200).json({ status: "ready" });
});

// ---------------------------------------------
// ERROR HANDLING
// ---------------------------------------------
app.use(notFound);
app.use(errorHandler);

export { app };