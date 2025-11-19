import mongoose from "mongoose";

const youtubeVideoSchema = new mongoose.Schema({
  videoId: { type: String, required: true, unique: true },
  title: String,
  description: String,
  publishedAt: { type: Date }, // <-- correct
  thumbnail: String,
  link: String,
});

export default mongoose.model("YoutubeVideo", youtubeVideoSchema);
