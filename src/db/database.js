import mongoose from "mongoose";
import { MONGODB_URI } from "../config/config.js";

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
      maxPoolSize: 10,
    });

    console.log(
      `✅ MongoDB connected successfully | HOST: ${connectionInstance.connection.host}`
    );

    mongoose.connection.on("error", (err) => {
      console.error("❌ MongoDB runtime error:", err.message);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("⚠️ MongoDB disconnected");
    });

    return connectionInstance;
  } catch (error) {
    console.error("❌ MongoDB connection error:", error.message);
    throw error;
  }
};

export default connectDB;
