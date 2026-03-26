
import jwt from "jsonwebtoken";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/User.js";

/* ======================================================
   TOKEN HELPERS
====================================================== */

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

/* ======================================================
   REGISTER USER (EMAIL + PHONE REQUIRED)
====================================================== */

export const registerUser = asyncHandler(async (req, res) => {
  let { name, email, phone, password } = req.body;

  const errors = [];

  if (typeof name === "string") name = name.trim();
  if (typeof email === "string") email = email.toLowerCase().trim();
  if (typeof phone === "string") phone = phone.trim();

  // 🔍 Validation
  if (typeof name !== "string" || !name) {
    errors.push({ field: "name", message: "Name is required" });
  }

  if (typeof email !== "string" || !email) {
    errors.push({ field: "email", message: "Email is required" });
  }

  if (typeof phone !== "string" || !phone || !/^[6-9]\d{9}$/.test(phone)) {
    errors.push({
      field: "phone",
      message: "Valid Indian phone number is required",
    });
  }

  if (typeof password !== "string" || !password) {
    errors.push({ field: "password", message: "Password is required" });
  }

  if (errors.length > 0) {
    throw new ApiError(400, "Required fields are missing", errors);
  }

  // 🔍 Check existing user (email OR phone)
  const existingUser = await User.findOne({
    $or: [{ email }, { phone }],
  });

  if (existingUser) {
    throw new ApiError(409, "User already exists", [
      { field: "email/phone", message: "User already exists" },
    ]);
  }

  // ✅ Create user
  const user = await User.create({
    name,
    email,
    phone,
    password,
  });

  if (!user) {
    throw new ApiError(500, "Something went wrong while creating the user");
  }

  const { accessToken, refreshToken } =
    await generateAccessAndRefreshToken(user._id);

  const createdUser = await User.findById(user._id).select(
    "name email phone role status"
  );

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };

  return res
    .status(201)
    .cookie("refreshToken", refreshToken, cookieOptions)
    .json(
      new ApiResponse(
        201,
        { user: createdUser, accessToken },
        "Account created successfully"
      )
    );
});

/* ======================================================
   LOGIN USER (EMAIL OR PHONE)
====================================================== */

export const loginUser = asyncHandler(async (req, res) => {
  let { identifier, password } = req.body;

  if (typeof identifier !== "string" || typeof password !== "string") {
    throw new ApiError(400, "Identifier and password must be valid strings");
  }

  identifier = identifier.trim();

  if (!identifier || !password) {
    throw new ApiError(400, "Identifier and password are required");
  }

  let user;

  // 📱 Phone login
  if (/^[6-9]\d{9}$/.test(identifier)) {
    user = await User.findOne({ phone: identifier }).select("+password");
  }
  // 📧 Email login
  else {
    identifier = identifier.toLowerCase().trim();
    user = await User.findOne({ email: identifier }).select("+password");
  }

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

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };

  return res
    .status(200)
    .cookie("refreshToken", refreshToken, cookieOptions)
    .json(
      new ApiResponse(
        200,
        { user: loggedInUser, accessToken },
        "User logged in successfully"
      )
    );
});

/* ======================================================
   LOGOUT USER
====================================================== */

export const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, {
    $unset: { refreshToken: 1 },
  });

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
  };

  return res
    .status(200)
    .clearCookie("refreshToken", cookieOptions)
    .json(new ApiResponse(200, {}, "User logged out successfully"));
});

/* ======================================================
   REFRESH ACCESS TOKEN
====================================================== */

export const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken = req.cookies.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized request");
  }

  let decoded;

  try {
    decoded = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );
  } catch {
    throw new ApiError(401, "Invalid or expired refresh token");
  }

  const user = await User.findById(decoded._id);

  if (!user || user.refreshToken !== incomingRefreshToken) {
    throw new ApiError(401, "Invalid refresh token");
  }

  const { accessToken, refreshToken } =
    await generateAccessAndRefreshToken(user._id);

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };

  return res
    .status(200)
    .cookie("refreshToken", refreshToken, cookieOptions)
    .json(new ApiResponse(200, { accessToken }, "Access token refreshed"));
});

/* ======================================================
   GET CURRENT USER
====================================================== */

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
