import YoutubeVideo from "../models/YoutubeVideo.js";

export const getVideosFromDB = async (req, res) => {
  try {
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

    return res.json({
      success: true,
      data: {
        videos,
        hasMore,
        pagination: {
          page,
          limit,
        },
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Failed to load videos",
    });
  }
};
