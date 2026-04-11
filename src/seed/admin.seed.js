import mongoose from "mongoose";
import dotenv from "dotenv";
import { User } from "../models/User.js";
import { logger } from "../utils/logger.js";

dotenv.config();

const log = logger.child({ service: "admin-seed" });

if (process.env.NODE_ENV === "production" && !process.env.ADMIN_PASSWORD) {
  log.fatal("admin_password_required_in_production");
  process.exit(1);
}

const seedAdmin = async () => {
  try {
    // Connect DB
    await mongoose.connect(process.env.MONGODB_URI);
    log.info("database_connected");

    const adminEmail = process.env.ADMIN_EMAIL || "admin@newsbullet.com";

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: adminEmail });

    if (existingAdmin) {
      log.info("admin_user_already_exists");
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

    log.info(
      { email: adminUser.email, role: adminUser.role },
      "admin_user_created"
    );

    process.exit(0);
  } catch (error) {
    log.fatal({ err: error }, "admin_seed_failed");
    process.exit(1);
  }
};

seedAdmin();
