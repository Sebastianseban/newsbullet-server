
import axios from "axios";
import YoutubeVideo from "../models/YoutubeVideo.js";

export const syncYouTubeVideos = async () => {
  try {
    const API_KEY = process.env.YOUTUBE_API_KEY;
    const CHANNEL_ID = "UCbXD5z_1OflMuiekSJfEO8Q";

    let pageToken = "";
    let count = 0;

    while (true) {
      const url = `https://www.googleapis.com/youtube/v3/search?key=${API_KEY}&channelId=${CHANNEL_ID}&part=snippet,id&order=date&maxResults=50&pageToken=${pageToken}`;

      const { data } = await axios.get(url);

      for (let item of data.items) {
        // Skip playlists, channels, etc
        if (item.id.kind !== "youtube#video") continue;

        const videoId = item.id.videoId;

        await YoutubeVideo.findOneAndUpdate(
          { videoId },
          {
            videoId,
            title: item.snippet.title,
            description: item.snippet.description,
            publishedAt: new Date(item.snippet.publishedAt), // 🔥 FIXED
            thumbnail: item.snippet.thumbnails.high.url,
            link: `https://www.youtube.com/watch?v=${videoId}`,
          },
          { upsert: true }
        );

        count++;
      }

      if (!data.nextPageToken) break;

      pageToken = data.nextPageToken;
    }

    console.log(`YouTube Sync Completed — Total Fetched: ${count}`);
  } catch (error) {
    console.error("Sync Error:", error.message);
  }
};
