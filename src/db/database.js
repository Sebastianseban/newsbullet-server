import mongoose from "mongoose";
import { MONGODB_URI } from "../config/config.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ component: "mongodb" });

const connectDB = async () => {
  if (!MONGODB_URI) {
    throw new Error("Missing MONGODB_URI in environment variables");
  }

  try {
    mongoose.set("strictQuery", true);
    mongoose.set("bufferCommands", false);

    const connectionInstance = await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 20000,
      maxPoolSize: 25,
    });

    log.info(
      { host: connectionInstance.connection.host },
      "mongodb_connected"
    );

    mongoose.connection.on("error", (err) => {
      log.error({ err }, "mongodb_runtime_error");
    });

    mongoose.connection.on("disconnected", () => {
      log.warn("mongodb_disconnected");
    });

    return connectionInstance;
  } catch (error) {
    log.error({ err: error }, "mongodb_connection_failed");
    throw error;
  }
};

export default connectDB;
