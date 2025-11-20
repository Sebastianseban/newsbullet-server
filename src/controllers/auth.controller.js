
import jwt from "jsonwebtoken";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/User.js";

export const generateAccessAndRefreshToken = async (userId) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(404, "User not found while generating tokens");
  }

  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();

  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  return { accessToken, refreshToken };
};


export const registerUser = asyncHandler(async (req, res) => {
  let { name, email, phone, password } = req.body;

  const errors = [];

  if (typeof name === "string") name = name.trim();
  if (typeof email === "string") email = email.toLowerCase().trim();

  // Basic validation
  if (!name) {
    errors.push({ field: "name", message: "Name is required" });
  }

  if (!email && !phone) {
    errors.push({
      field: "emailOrPhone",
      message: "Email or phone number is required",
    });
  }

  if (!password) {
    errors.push({ field: "password", message: "Password is required" });
  }

  if (errors.length > 0) {
    throw new ApiError(400, "Required fields are missing", errors);
  }

  // Check existing user (by email or phone)
  const matchConditions = [];
  if (email) matchConditions.push({ email });
  if (phone) matchConditions.push({ phone });

  const existingUser =
    matchConditions.length > 0
      ? await User.findOne({ $or: matchConditions })
      : null;

  if (existingUser) {
    const conflictErrors = [];

    if (email && existingUser.email === email) {
      conflictErrors.push({
        field: "email",
        message: "User with this email already exists",
      });
    }

    if (phone && existingUser.phone === phone) {
      conflictErrors.push({
        field: "phone",
        message: "User with this phone number already exists",
      });
    }

    throw new ApiError(409, "User already exists", conflictErrors);
  }

  // Create user (password will be hashed by pre-save hook)
  const user = await User.create({
    name,
    email,
    phone,
    password,
  });

  if (!user) {
    throw new ApiError(500, "Something went wrong while creating the user");
  }

  // Tokens
  const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
    user._id
  );

  // Fetch safe user object
  const createdUser = await User.findById(user._id).select(
    " name phone role  status  "
  );

  if (!createdUser) {
    throw new ApiError(500, "User creation failed");
  }

  // Cookie options
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };

  return res
    .status(201)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        201,
        {
          user: createdUser,
          accessToken,
        },
        "Account created successfully! Please complete your profile."
      )
    );
});


export const loginUser = asyncHandler(async (req, res) => {
  let { email, phone, password } = req.body;

  const errors = [];

  if (typeof email === "string") email = email.toLowerCase().trim();

  // Basic validation
  if (!email && !phone) {
    errors.push({
      field: "emailOrPhone",
      message: "Email or phone number is required",
    });
  }

  if (!password) {
    errors.push({ field: "password", message: "Password is required" });
  }

  if (errors.length > 0) {
    throw new ApiError(400, "Required fields are missing", errors);
  }

  // Build query (login via email or phone)
  const matchConditions = [];
  if (email) matchConditions.push({ email });
  if (phone) matchConditions.push({ phone });

  const user = await User.findOne(
    matchConditions.length > 0 ? { $or: matchConditions } : {}
  ).select("+password"); // need password to compare

  if (!user) {
    throw new ApiError(404, "User does not exist");
  }

  if (user.status === "blocked") {
    throw new ApiError(403, "Your account is blocked. Please contact support.");
  }

  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid user credentials");
  }

  const { accessToken, refreshToken } =
    await generateAccessAndRefreshToken(user._id);

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };

  return res
    .status(200)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        { user: loggedInUser, accessToken },
        "User logged in successfully"
      )
    );
});


export const logoutUser = asyncHandler(async (req, res) => {
  // Remove refreshToken from DB
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $unset: {
        refreshToken: 1,
      },
    },
    {
      new: true,
    }
  );

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
  };

  return res
    .status(200)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out successfully"));
});


export const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken = req.cookies.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized request");
  }

  let decodedToken;

  try {
    decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );
  } catch (err) {
    throw new ApiError(401, "Invalid or expired refresh token");
  }

  const user = await User.findById(decodedToken?._id);

  if (!user) {
    throw new ApiError(401, "Invalid refresh token");
  }

  if (incomingRefreshToken !== user?.refreshToken) {
    throw new ApiError(401, "Refresh token is expired or already used");
  }

  const { accessToken, refreshToken } =
    await generateAccessAndRefreshToken(user._id);

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };

  return res
    .status(200)
    .cookie("refreshToken", refreshToken, options)
    .json(new ApiResponse(200, { accessToken }, "Access token refreshed"));
});


export const getCurrentUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select(
    "-password -refreshToken"
  );

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, user, "User fetched successfully"));
});
