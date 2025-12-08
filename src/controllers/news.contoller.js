import { News } from "../models/News.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { nanoid } from "nanoid";


export const createNews = asyncHandler(async (req, res) => {
  const { heading, body } = req.body;

  if (!heading || !body) {
    throw new ApiError(400, "Required fields are missing");
  }

  const slug = nanoid(8);

  const news = await News.create({
    heading: heading.trim(),
    body: body.trim(),
    slug
  });

  return res
    .status(201)
    .json(new ApiResponse(201, { news }, "News created successfully"));
});


export const getAllNews = asyncHandler(async (req, res) => {
  const news = await News.find().sort({ createdAt: -1 });

  // news will never be null (find() returns empty array)
  if (news.length === 0) {
    return res
      .status(200)
      .json(new ApiResponse(200, { news: [] }, "No news available"));
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { news }, "News fetched successfully"));
});


export const getNewsBySlug = asyncHandler(async (req, res) => {
  const { slug } = req.params;

  if (!slug) {
    throw new ApiError(400, "Slug value is required");
  }

  const news = await News.findOne({ slug });

  if (!news) {
    throw new ApiError(404, "News not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { news }, "News fetched successfully"));
});


export const updateNews = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const { heading, body } = req.body;

  if (!slug) {
    throw new ApiError(400, "Slug is required");
  }

  // Build dynamic update object (senior dev pattern)
  const updateData = {};
  if (heading?.trim()) updateData.heading = heading.trim();
  if (body?.trim()) updateData.body = body.trim();

  // Nothing to update
  if (Object.keys(updateData).length === 0) {
    throw new ApiError(400, "At least one field (heading or body) must be provided");
  }

  const news = await News.findOneAndUpdate(
    { slug },
    { $set: updateData },
    { new: true, runValidators: true }
  );

  if (!news) {
    throw new ApiError(404, "No news article found for the provided slug");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { news }, "News updated successfully"));
});


export const deleteNews = asyncHandler(async (req, res) => {
  const { slug } = req.params;

  if (!slug) {
    throw new ApiError(400, "Slug is required");
  }

  // Check if the news exists before deleting (cleaner error)
  const existing = await News.findOne({ slug });

  if (!existing) {
    throw new ApiError(404, "No news article found for the provided slug");
  }

  await News.deleteOne({ slug });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "News deleted successfully"));
});
