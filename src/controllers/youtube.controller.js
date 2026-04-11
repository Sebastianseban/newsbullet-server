import YoutubeVideo from "../models/YoutubeVideo.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";

export const getVideosFromDB = asyncHandler(async (req, res) => {
  const parsedPage = Number(req.query.page);
  const parsedLimit = Number(req.query.limit);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(50, parsedLimit)
      : 20;

  const videos = await YoutubeVideo.find()
    .sort({ publishedAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit + 1)
    .lean();

  const hasMore = videos.length > limit;
  if (hasMore) {
    videos.pop();
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        videos,
        hasMore,
        pagination: {
          page,
          limit,
        },
      },
      "Videos fetched successfully"
    )
  );
});
