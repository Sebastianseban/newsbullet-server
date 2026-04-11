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
import { logger } from "./utils/logger.js";

const log = logger.child({ service: "worker" });

let isShuttingDown = false;
let scheduledTask;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const shutdown = async (signal) => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  log.warn({ signal }, "worker_shutdown_start");

  try {
    if (scheduledTask) {
      scheduledTask.stop();
    }

    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }

    process.exit(0);
  } catch (error) {
    log.fatal({ err: error }, "worker_shutdown_failed");
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
        log.error(
          {
            err: error,
            attempt,
            maxAttempts: STARTUP_DB_RETRY_ATTEMPTS,
          },
          "worker_db_bootstrap_attempt_failed"
        );

        if (attempt < STARTUP_DB_RETRY_ATTEMPTS) {
          await sleep(STARTUP_DB_RETRY_DELAY_MS);
        }
      }
    }

    if (lastError) {
      throw lastError;
    }

    log.info("worker_started");

    // Run once on startup
    await syncYouTubeVideos();

    // Schedule job
    scheduledTask = cron.schedule(WORKER_CRON_SCHEDULE, async () => {
      log.info("youtube_sync_cron_tick");
      try {
        await syncYouTubeVideos();
      } catch (error) {
        log.error({ err: error }, "youtube_sync_cron_failed");
      }
    }, {
      timezone: WORKER_CRON_TIMEZONE,
    });

  } catch (error) {
    log.fatal({ err: error }, "worker_failed_to_start");
    process.exit(1);
  }
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => {
  log.error({ reason }, "worker_unhandled_rejection");
});
process.on("uncaughtException", (error) => {
  log.fatal({ err: error }, "worker_uncaught_exception");
  shutdown("uncaughtException");
});

startWorker();
