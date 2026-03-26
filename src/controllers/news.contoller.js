import { News } from "../models/News.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { nanoid } from "nanoid";

export const createNews = asyncHandler(async (req, res) => {
  const { heading, body } = req.body;

  if (typeof heading !== "string" || typeof body !== "string") {
    throw new ApiError(400, "Heading and body must be valid strings");
  }

  if (!heading.trim() || !body.trim()) {
    throw new ApiError(400, "Required fields are missing");
  }

  const slug = nanoid(8);

  const news = await News.create({
    heading: heading.trim(),
    body: body.trim(),
    slug,
  });

  return res
    .status(201)
    .json(new ApiResponse(201, { news }, "News created successfully"));
});

export const getAllNews = asyncHandler(async (req, res) => {
  const parsedPage = Number(req.query.page);
  const parsedLimit = Number(req.query.limit);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(20, parsedLimit)
      : 10;
  const skip = (page - 1) * limit;

  const news = await News.find({}, "heading slug createdAt")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit + 1)
    .lean();

  const hasMore = news.length > limit;
  if (hasMore) {
    news.pop();
  }

  if (news.length === 0) {
    return res
      .status(200)
      .json(new ApiResponse(200, { news: [] }, "No news available"));
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        news,
        pagination: {
          page,
          limit,
          hasMore,
        },
      },
      "News fetched successfully"
    )
  );
});

export const getNewsBySlug = asyncHandler(async (req, res) => {
  const { slug } = req.params;

  if (!slug || typeof slug !== "string") {
    throw new ApiError(400, "Slug value is required");
  }

  const news = await News.findOne({ slug }).lean();

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

  if (!slug || typeof slug !== "string") {
    throw new ApiError(400, "Slug is required");
  }

  const updateData = {};

  if (typeof heading === "string" && heading.trim()) {
    updateData.heading = heading.trim();
  }

  if (typeof body === "string" && body.trim()) {
    updateData.body = body.trim();
  }

  if (Object.keys(updateData).length === 0) {
    throw new ApiError(
      400,
      "At least one field (heading or body) must be provided"
    );
  }

  const news = await News.findOneAndUpdate(
    { slug },
    { $set: updateData },
    { new: true, runValidators: true }
  ).lean();

  if (!news) {
    throw new ApiError(404, "No news article found for the provided slug");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { news }, "News updated successfully"));
});

export const deleteNews = asyncHandler(async (req, res) => {
  const { slug } = req.params;

  if (!slug || typeof slug !== "string") {
    throw new ApiError(400, "Slug is required");
  }

  const deleted = await News.findOneAndDelete({ slug });

  if (!deleted) {
    throw new ApiError(404, "No news article found for the provided slug");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "News deleted successfully"));
});
