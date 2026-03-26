import { ApiError } from "../utils/ApiError.js";

const errorHandler = (err, req, res, next) => {
  // ✅ Prevent double-response crashes
  if (res.headersSent) {
    return next(err);
  }

  let error = err;

  // Log error details for debugging
  console.error("❌ Error occurred:", {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString(),
  });

  // If it's not already an ApiError, convert it to one
  if (!(error instanceof ApiError)) {
    let statusCode = 500;
    let message = "Internal Server Error";
    let errors = [];

    // Handle MongoDB CastError
    if (err.name === "CastError") {
      statusCode = 404;
      message = `Resource not found with id: ${err.value}`;
    }

    // Handle duplicate key errors
    else if (err.code === 11000) {
      statusCode = 400;
      const field = Object.keys(err.keyValue || {})[0] || "field";
      message = `Duplicate field value: ${field}`;
      errors = [{ field, message: `${field} already exists` }];
    }

    // Handle Mongoose validation errors
    else if (err.name === "ValidationError") {
      statusCode = 400;
      message = "Validation Error";
      errors = Object.values(err.errors || {}).map((val) => ({
        field: val.path,
        message: val.message,
      }));
    }

    // Handle JWT errors
    else if (err.name === "JsonWebTokenError") {
      statusCode = 401;
      message = "Invalid token. Please log in again";
    } else if (err.name === "TokenExpiredError") {
      statusCode = 401;
      message = "Your token has expired. Please log in again";
    }

    // Handle Multer errors
    else if (err.code === "LIMIT_FILE_SIZE") {
      statusCode = 400;
      message = "File too large";
    } else if (err.code === "LIMIT_FILE_COUNT") {
      statusCode = 400;
      message = "Too many files";
    } else if (err.code === "LIMIT_UNEXPECTED_FILE") {
      statusCode = 400;
      message = "Unexpected field in file upload";
    }

    // Handle custom errors with statusCode
    else if (err.statusCode) {
      statusCode = err.statusCode;
      message = err.message;
    }

    // Fallback for generic errors
    else if (err.message) {
      message = err.message;
    }

    error = new ApiError(statusCode, message, errors, err.stack);
  }

  const response = {
    success: false,
    message: error.message,
    errors: error.errors || [],
  };

  // Only expose stack in development
  if (process.env.NODE_ENV === "development") {
    response.stack = error.stack;
    response.originalError = err.name;
  }

  res.status(error.statusCode || 500).json(response);
};

// Handle 404 - Not Found
const notFound = (req, res, next) => {
  next(new ApiError(404, `Not found - ${req.originalUrl}`));
};

export { errorHandler, notFound };