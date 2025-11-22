// createAdmin.js
import dotenv from "dotenv";
import mongoose from "mongoose";
import { User } from "./models/User.js"; // path adjust cheyyu

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

const run = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ DB connected");

    const email = "admin@example.com";

    // already undo check
    let admin = await User.findOne({ email });

    if (admin) {
      console.log("⚠️ Admin already exists:", admin.email);
    } else {
      admin = await User.create({
        name: "Super Admin",
        email,
        phone: "9999999999",
        password: "Admin@123", // will be hashed by pre-save
        role: "admin",
        status: "active",
      });

      console.log("✅ Admin created:", admin.email);
    }

    process.exit(0);
  } catch (err) {
    console.error("❌ Error creating admin:", err);
    process.exit(1);
  }
};

run();
