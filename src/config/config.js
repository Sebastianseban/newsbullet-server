import dotenv from "dotenv";

dotenv.config();

const requiredEnv = [
  "MONGODB_URI",
  "ACCESS_TOKEN_SECRET",
  "REFRESH_TOKEN_SECRET",
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const defaultCorsOrigins = ["http://localhost:3000"];
const envCorsOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const NODE_ENV = process.env.NODE_ENV || "development";
export const PORT = Number(process.env.PORT) || 5000;
export const MONGODB_URI = process.env.MONGODB_URI;
export const CORS_ORIGINS = envCorsOrigins.length
  ? envCorsOrigins
  : defaultCorsOrigins;
export const STARTUP_DB_RETRY_ATTEMPTS =
  Number(process.env.STARTUP_DB_RETRY_ATTEMPTS) || 3;
export const STARTUP_DB_RETRY_DELAY_MS =
  Number(process.env.STARTUP_DB_RETRY_DELAY_MS) || 3000;
export const WORKER_CRON_SCHEDULE =
  process.env.WORKER_CRON_SCHEDULE || "0 3 * * *";
export const WORKER_CRON_TIMEZONE =
  process.env.WORKER_CRON_TIMEZONE || "Asia/Kolkata";
export const YOUTUBE_SYNC_LOCK_TTL_MS =
  Number(process.env.YOUTUBE_SYNC_LOCK_TTL_MS) || 15 * 60 * 1000;
export const YOUTUBE_SYNC_MAX_PAGES =
  Number(process.env.YOUTUBE_SYNC_MAX_PAGES) || 5;

// Optional envs (safe to be undefined if feature not used)
export const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "";
export const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";
export const RAZORPAY_WEBHOOK_SECRET =
  process.env.RAZORPAY_WEBHOOK_SECRET || "";

export const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || "";
