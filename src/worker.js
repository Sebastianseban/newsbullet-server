import cron from "node-cron";
import mongoose from "mongoose";
import connectDB from "./db/database.js";
import { syncYouTubeVideos } from "./services/youtubeSync.js";
import {
  STARTUP_DB_RETRY_ATTEMPTS,
  STARTUP_DB_RETRY_DELAY_MS,
  WORKER_CRON_SCHEDULE,
  WORKER_CRON_TIMEZONE,
} from "./config/config.js";

let isShuttingDown = false;
let scheduledTask;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const shutdown = async (signal) => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`⚠️ Worker received ${signal}. Starting shutdown...`);

  try {
    if (scheduledTask) {
      scheduledTask.stop();
    }

    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Worker shutdown failed:", error);
    process.exit(1);
  }
};

const startWorker = async () => {
  try {
    let lastError;

    for (let attempt = 1; attempt <= STARTUP_DB_RETRY_ATTEMPTS; attempt += 1) {
      try {
        await connectDB();
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        console.error(
          `❌ Worker DB bootstrap attempt ${attempt}/${STARTUP_DB_RETRY_ATTEMPTS} failed:`,
          error.message
        );

        if (attempt < STARTUP_DB_RETRY_ATTEMPTS) {
          await sleep(STARTUP_DB_RETRY_DELAY_MS);
        }
      }
    }

    if (lastError) {
      throw lastError;
    }

    console.log("🟢 Worker started");

    // Run once on startup
    await syncYouTubeVideos();

    // Schedule job
    scheduledTask = cron.schedule(WORKER_CRON_SCHEDULE, async () => {
      console.log("⏰ Running daily YouTube sync...");
      try {
        await syncYouTubeVideos();
      } catch (error) {
        console.error("❌ Sync failed:", error.message);
      }
    }, {
      timezone: WORKER_CRON_TIMEZONE,
    });

  } catch (error) {
    console.error("❌ Worker failed to start:", error);
    process.exit(1);
  }
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => {
  console.error("💥 Worker unhandled rejection:", reason);
  shutdown("unhandledRejection");
});
process.on("uncaughtException", (error) => {
  console.error("💥 Worker uncaught exception:", error);
  shutdown("uncaughtException");
});

startWorker();
