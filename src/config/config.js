import dotenv from "dotenv";

dotenv.config();

const requiredEnv = ["MONGODB_URI"];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const NODE_ENV = process.env.NODE_ENV || "development";
export const PORT = Number(process.env.PORT) || 5000;
export const MONGODB_URI = process.env.MONGODB_URI;

// Optional envs (safe to be undefined if feature not used)
export const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "";
export const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";
export const RAZORPAY_WEBHOOK_SECRET =
  process.env.RAZORPAY_WEBHOOK_SECRET || "";

export const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || "";