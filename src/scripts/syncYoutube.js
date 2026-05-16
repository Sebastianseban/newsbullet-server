import mongoose from "mongoose";
import connectDB from "../db/database.js";
import { syncYouTubeVideos } from "../services/youtubeSync.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ script: "sync-youtube" });

const shutdown = async (exitCode) => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
    log.info("mongodb_connection_closed");
  }

  process.exit(exitCode);
};

const run = async () => {
  try {
    log.info("manual_youtube_sync_start");

    await connectDB();
    const result = await syncYouTubeVideos({ throwOnError: true });

    if (result?.skipped) {
      log.warn({ reason: result.reason }, "manual_youtube_sync_skipped");
      await shutdown(0);
      return;
    }

    log.info(
      { videosProcessed: result?.videosProcessed || 0 },
      "manual_youtube_sync_complete"
    );
    await shutdown(0);
  } catch (error) {
    log.fatal({ err: error }, "manual_youtube_sync_failed");
    await shutdown(1);
  }
};

process.on("SIGINT", async () => {
  log.warn("manual_youtube_sync_interrupted");
  await shutdown(130);
});

process.on("SIGTERM", async () => {
  log.warn("manual_youtube_sync_terminated");
  await shutdown(143);
});

run();
