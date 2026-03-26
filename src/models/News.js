import mongoose from "mongoose";

const newsSchema = new mongoose.Schema(
  {
    heading: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    slug: { type: String, unique: true, index: true },
  },
  { timestamps: true }
);

newsSchema.index({ createdAt: -1 });

export const News = mongoose.model("News", newsSchema);
