
import YoutubeVideo from "../models/YoutubeVideo.js";

export const getVideosFromDB = async (req, res) => {
  try {
    let page = Number(req.query.page) || 1;
    let limit = 20;

    const videos = await YoutubeVideo.find()
      .sort({ publishedAt: -1 })   // 🔥 newest videos first
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await YoutubeVideo.countDocuments();

    res.json({
      success: true,
      data: {
        videos,
        hasMore: page * limit < total,
      },
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to load videos",
    });
  }
};
