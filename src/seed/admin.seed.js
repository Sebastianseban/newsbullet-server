import mongoose from "mongoose";
import dotenv from "dotenv";
import { User } from "../models/User.js";

dotenv.config();

const seedAdmin = async () => {
  try {
    // Connect DB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Database connected");

    const adminEmail = process.env.ADMIN_EMAIL || "admin@newsbullet.com";

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: adminEmail });

    if (existingAdmin) {
      console.log("Admin user already exists");
      process.exit(0);
    }

    // Create admin user
    const adminUser = await User.create({
      name: "Admin",
      email: adminEmail,
      password: process.env.ADMIN_PASSWORD || "Admin@123",
      role: "admin",
      status: "active",
    });

    console.log("Admin user created successfully");
    console.log({
      email: adminUser.email,
      role: adminUser.role,
    });

    process.exit(0);
  } catch (error) {
    console.error("Admin seed failed:", error);
    process.exit(1);
  }
};

seedAdmin();
