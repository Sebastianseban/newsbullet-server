import mongoose from "mongoose";

const youtubeVideoSchema = new mongoose.Schema(
  {
    videoId: { type: String, required: true, unique: true, index: true },
    title: String,
    description: String,
    publishedAt: { type: Date, index: true },
    thumbnail: String,
    link: String,
  },
  { timestamps: true }
);

export default mongoose.model("YoutubeVideo", youtubeVideoSchema);
