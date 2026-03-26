import cron from "node-cron";
import connectDB from "./db/database.js";
import { syncYouTubeVideos } from "./services/youtubeSync.js";

const startWorker = async () => {
  try {
    await connectDB();

    console.log("🟢 Worker started");

    // Run once on startup
    await syncYouTubeVideos();

    // Schedule job
    cron.schedule("0 3 * * *", async () => {
      console.log("⏰ Running daily YouTube sync...");
      try {
        await syncYouTubeVideos();
      } catch (error) {
        console.error("❌ Sync failed:", error.message);
      }
    });

  } catch (error) {
    console.error("❌ Worker failed to start:", error);
    process.exit(1);
  }
};

startWorker();