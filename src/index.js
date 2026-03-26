import { app } from "./app.js";
import { PORT } from "./config/config.js";
import connectDB from "./db/database.js";
import mongoose from "mongoose";

let server;
let isShuttingDown = false;

/**
 * Graceful shutdown
 */
const shutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n⚠️ Received ${signal}. Starting graceful shutdown...`);

  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) return reject(err);
          resolve();
        });
      });
      console.log("✅ HTTP server closed");
    }

    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log("✅ MongoDB connection closed");
    }

    console.log("🛑 Shutdown complete");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error during graceful shutdown:", error);
    process.exit(1);
  }
};

/**
 * Bootstrap app safely
 */
const startServer = async () => {
  try {
    await connectDB();

    server = app.listen(PORT || 5000, () => {
      console.log(`🚀 Server is running on port ${PORT || 5000}`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

/**
 * Process-level crash handlers
 */
process.on("unhandledRejection", (reason) => {
  console.error("💥 Unhandled Promise Rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("💥 Uncaught Exception:", error);
  shutdown("uncaughtException");
});

/**
 * Graceful shutdown signals
 */
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

startServer();