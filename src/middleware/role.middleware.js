import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const requireAdmin = asyncHandler(async (req, _res, next) => {
  if (!req.user || req.user.role !== "admin") {
    throw new ApiError(403, "Admin access required");
  }

  next();
});
