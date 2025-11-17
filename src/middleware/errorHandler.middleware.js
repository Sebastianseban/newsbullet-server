import { ApiError } from '../utils/ApiError.js';

const errorHandler = (err, req, res, next) => {
    let error = err;

    // Log error details for debugging
    console.error('Error occurred:', {
        message: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        timestamp: new Date().toISOString()
    });

    // If it's not already an ApiError, convert it to one
    if (!(error instanceof ApiError)) {
        let statusCode = 500;
        let message = 'Internal Server Error';
        let errors = [];

        // Handle MongoDB errors
        if (err.name === 'CastError') {
            statusCode = 404;
            message = `Resource not found with id: ${err.value}`;
        } 
        else if (err.code === 11000) {
            // Duplicate key error
            statusCode = 400;
            const field = Object.keys(err.keyValue)[0];
            message = `Duplicate field value: ${field}`;
            errors = [{ field, message: `${field} already exists` }];
        } 
        else if (err.name === 'ValidationError') {
            // Mongoose validation error
            statusCode = 400;
            message = 'Validation Error';
            errors = Object.values(err.errors).map(val => ({
                field: val.path,
                message: val.message
            }));
        }
        // Handle JWT errors
        else if (err.name === 'JsonWebTokenError') {
            statusCode = 401;
            message = 'Invalid token. Please log in again';
        }
        else if (err.name === 'TokenExpiredError') {
            statusCode = 401;
            message = 'Your token has expired. Please log in again';
        }
        // Handle Multer errors (file upload)
        else if (err.code === 'LIMIT_FILE_SIZE') {
            statusCode = 400;
            message = 'File too large';
        }
        else if (err.code === 'LIMIT_FILE_COUNT') {
            statusCode = 400;
            message = 'Too many files';
        }
        else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            statusCode = 400;
            message = 'Unexpected field in file upload';
        }
        // Handle other known errors
        else if (err.statusCode) {
            statusCode = err.statusCode;
            message = err.message;
        }
        else if (err.message) {
            message = err.message;
        }

        // Create new ApiError instance
        error = new ApiError(statusCode, message, errors, err.stack);
    }

    // Prepare response object
    const response = {
        success: error.success,
        message: error.message,
        errors: error.errors
    };

    // Add additional info in development
    if (process.env.NODE_ENV === 'development') {
        response.stack = error.stack;
        response.originalError = err.name;
    }

    // Send error response
    res.status(error.statusCode).json(response);
};

// Handle 404 - Not Found (this should be placed before error handler)
const notFound = (req, res, next) => {
    const error = new ApiError(404, `Not found - ${req.originalUrl}`);
    next(error);
};

export { errorHandler, notFound };