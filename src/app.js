import cookieParser from "cookie-parser";
import express from "express";
import cors from "cors";
import compression from "compression";
import helmet from "helmet";
import mongoose from "mongoose";

import { errorHandler, notFound } from "./middleware/errorHandler.middleware.js";
import {
  CORS_ORIGINS,
  TRUST_PROXY,
  TRUST_PROXY_HOPS,
  WEBHOOK_RAW_BODY_LIMIT,
} from "./config/config.js";

import paymentRoutes from "./routes/payment.routes.js";
import youtubeRoutes from "./routes/youtube.routes.js";
import authRoutes from "./routes/auth.routes.js";
import newsRoutes from "./routes/news.routes.js";

import { subscriptionWebhook } from "./controllers/payment.controller.js";

const app = express();

if (TRUST_PROXY) {
  app.set("trust proxy", TRUST_PROXY_HOPS);
}

/**
 * 🔒 RAW BODY FOR WEBHOOKS (must be before express.json)
 */
app.post(
  "/api/webhooks/razorpay/subscription",
  express.raw({ type: "application/json", limit: WEBHOOK_RAW_BODY_LIMIT }),
  (req, res) => {
    const buf = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(String(req.body ?? ""), "utf8");
    req.rawBody = buf.toString("utf8");

    let parsed;
    try {
      parsed = JSON.parse(req.rawBody || "{}");
    } catch {
      return res.status(400).json({
        received: false,
        message: "Invalid JSON body",
      });
    }

    req.body = parsed;
    return subscriptionWebhook(req, res);
  }
);

// Normal middleware
app.use(express.json({ limit: "20kb" }));
app.use(cookieParser());
app.use(compression());
app.use(helmet());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || CORS_ORIGINS.includes(origin)) {
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
app.get("/livez", (req, res) => {
  res.status(200).json({ status: "alive" });
});

app.get("/readyz", (req, res) => {
  const dbReady = mongoose.connection.readyState === 1;

  if (!dbReady) {
    return res.status(503).json({ status: "not ready", db: "down" });
  }

  res.status(200).json({ status: "ready" });
});

// ---------------------------------------------
// ERROR HANDLING
// ---------------------------------------------
app.use(notFound);
app.use(errorHandler);

export { app };
