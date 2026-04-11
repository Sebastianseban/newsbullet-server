import { app } from "./app.js";
import {
  PORT,
  STARTUP_DB_RETRY_ATTEMPTS,
  STARTUP_DB_RETRY_DELAY_MS,
} from "./config/config.js";
import connectDB from "./db/database.js";
import mongoose from "mongoose";
import { logger } from "./utils/logger.js";

const log = logger.child({ service: "api" });

let server;
let isShuttingDown = false;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Graceful shutdown
 */
const shutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  log.warn({ signal }, "graceful_shutdown_start");

  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) return reject(err);
          resolve();
        });
      });
      log.info("http_server_closed");
    }

    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      log.info("mongodb_connection_closed");
    }

    log.info("shutdown_complete");
    process.exit(0);
  } catch (error) {
    log.fatal({ err: error }, "graceful_shutdown_failed");
    process.exit(1);
  }
};

/**
 * Bootstrap app safely
 */
const startServer = async () => {
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
          "mongodb_bootstrap_attempt_failed"
        );

        if (attempt < STARTUP_DB_RETRY_ATTEMPTS) {
          await sleep(STARTUP_DB_RETRY_DELAY_MS);
        }
      }
    }

    if (lastError) {
      throw lastError;
    }

    server = app.listen(PORT || 5000, () => {
      log.info({ port: PORT || 5000 }, "server_listening");
    });
  } catch (error) {
    log.fatal({ err: error }, "failed_to_start_server");
    process.exit(1);
  }
};

/**
 * Process-level crash handlers
 * Note: unhandledRejection is logged but does not exit — full shutdown on every
 * floating promise would be brittle in production. uncaughtException still exits.
 */
process.on("unhandledRejection", (reason) => {
  log.error({ reason }, "unhandled_rejection");
});

process.on("uncaughtException", (error) => {
  log.fatal({ err: error }, "uncaught_exception");
  shutdown("uncaughtException");
});

/**
 * Graceful shutdown signals
 */
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

startServer();
