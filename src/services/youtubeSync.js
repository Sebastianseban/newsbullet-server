import axios from "axios";
import os from "os";
import YoutubeVideo from "../models/YoutubeVideo.js";
import {
  YOUTUBE_CHANNEL_ID,
  YOUTUBE_SYNC_LOCK_TTL_MS,
  YOUTUBE_SYNC_MAX_PAGES,
} from "../config/config.js";
import { acquireJobLock, releaseJobLock } from "../utils/jobLock.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ job: "youtube-sync" });

let isSyncRunning = false;
const JOB_NAME = "youtube-sync";
const ownerId = `${os.hostname()}-${process.pid}`;

export const syncYouTubeVideos = async () => {
  if (isSyncRunning) {
    log.warn("sync_already_running_skip");
    return;
  }

  isSyncRunning = true;

  try {
    const lockAcquired = await acquireJobLock({
      jobName: JOB_NAME,
      ownerId,
      ttlMs: YOUTUBE_SYNC_LOCK_TTL_MS,
    });

    if (!lockAcquired) {
      log.warn("sync_lock_held_skip");
      return;
    }

    const API_KEY = process.env.YOUTUBE_API_KEY;
    const CHANNEL_ID = YOUTUBE_CHANNEL_ID;

    if (!API_KEY) {
      throw new Error("Missing YOUTUBE_API_KEY");
    }

    const client = axios.create({
      timeout: 10000, // ✅ prevent hanging
    });

    let pageToken = "";
    let count = 0;

    for (let page = 0; page < YOUTUBE_SYNC_MAX_PAGES; page += 1) {
      const url = `https://www.googleapis.com/youtube/v3/search?key=${API_KEY}&channelId=${CHANNEL_ID}&part=snippet,id&order=date&maxResults=50&pageToken=${pageToken}`;

      const { data } = await client.get(url);

      const ops = [];
      const items = Array.isArray(data?.items) ? data.items : [];

      for (let item of items) {
        if (item.id.kind !== "youtube#video") continue;

        const videoId = item.id.videoId;

        ops.push({
          updateOne: {
            filter: { videoId },
            update: {
              $set: {
                videoId,
                title: item.snippet.title,
                description: item.snippet.description,
                publishedAt: new Date(item.snippet.publishedAt),
                thumbnail: item.snippet.thumbnails.high.url,
                link: `https://www.youtube.com/watch?v=${videoId}`,
              },
            },
            upsert: true,
          },
        });
      }

      // ✅ BULK WRITE (much faster)
      if (ops.length > 0) {
        await YoutubeVideo.bulkWrite(ops, { ordered: false });
        count += ops.length;
      }

      if (!data.nextPageToken) break;

      pageToken = data.nextPageToken;
    }

    log.info({ videosProcessed: count }, "youtube_sync_completed");
  } catch (error) {
    log.error({ err: error }, "youtube_sync_error");
  } finally {
    await releaseJobLock({
      jobName: JOB_NAME,
      ownerId,
    }).catch((error) => {
      log.error({ err: error }, "youtube_sync_lock_release_failed");
    });
    isSyncRunning = false; // ✅ always release lock
  }
};
