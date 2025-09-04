import rateLimit from "express-rate-limit";
import { Request, Response, NextFunction } from "express";
import logger from "../utils/logger";
import config from "../config/config";
import { ApiResponse, AppError } from "../types/global-interface";
import { MulterError } from "multer";

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export const rateLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS, // 15 minutes by default
  max: 100, // 100 requests per windowMs by default
  message: {
    success: false,
    message: "Too many requests from this IP, please try again later",
    error: "Rate limit exceeded",
  } as ApiResponse,
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req: Request, res: Response) => {
    logger.rateLimitHit(req.path, RATE_LIMIT_WINDOW_MS / 1000);

    const response: ApiResponse = {
      success: false,
      message: "Too many requests from this IP, please try again later",
      error: "Rate limit exceeded",
    };

    res.status(429).json(response);
  },
  skip: (req: Request) => {
  // Skip rate limiting for health checks and job status
  return req.path === "/api/health" || req.path.startsWith("/api/jobs/status/");
},
});


export const errorHandler = (
  error: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Log the error
  logger.error("Request error", error, {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get("User-Agent"),
  });

  // Handle AppError instances
  if (error instanceof AppError) {
    const response: ApiResponse = {
      success: false,
      message: error.message,
      error: config.isDevelopment()
        ? error.stack
        : error.code || "Application error",
    };

    res.status(error.statusCode).json(response);
    return;
  }

  // Handle Multer errors (file upload)

  if (error instanceof MulterError) {
    let message = "File upload error";
    let statusCode = 400;

    switch (error.code) {
      case "LIMIT_FILE_SIZE":
        message = "File too large. Maximum size is 10MB";
        break;
      case "LIMIT_FILE_COUNT":
        message = "Too many files. Only one file allowed";
        break;
      case "LIMIT_UNEXPECTED_FILE":
        message = "Unexpected file field";
        break;
      default:
        message = error.message || "File upload error";
    }

    const response: ApiResponse = {
      success: false,
      message,
      error: "File upload error",
    };

    res.status(statusCode).json(response);
    return;
  }
  // Handle Joi validation errors
  if (error.name === "ValidationError") {
    const response: ApiResponse = {
      success: false,
      message: error.message,
      error: "Validation error",
    };

    res.status(400).json(response);
    return;
  }

  // Handle MongoDB/Mongoose errors
  if (error.name === "MongoError" || error.name === "MongooseError") {
    const response: ApiResponse = {
      success: false,
      message: "Database error occurred",
      error: config.isDevelopment() ? error.message : "Database error",
    };

    res.status(500).json(response);
    return;
  }

  // Handle Redis errors
  if (error.message && error.message.includes("Redis")) {
    const response: ApiResponse = {
      success: false,
      message: "Cache service temporarily unavailable",
      error: config.isDevelopment() ? error.message : "Cache error",
    };

    res.status(503).json(response);
    return;
  }

  // Handle axios errors (USPTO API)
  if (error.name === "AxiosError" || (error as any).isAxiosError) {
    const axiosError = error as any;
    let message = "External API error";
    let statusCode = 502;

    if (axiosError.response) {
      statusCode = axiosError.response.status === 429 ? 429 : 502;
      message =
        axiosError.response.status === 429
          ? "USPTO API rate limit exceeded"
          : "USPTO API error";
    } else if (axiosError.request) {
      message = "USPTO API unavailable";
      statusCode = 503;
    }

    const response: ApiResponse = {
      success: false,
      message,
      error: config.isDevelopment() ? axiosError.message : "External API error",
    };

    res.status(statusCode).json(response);
    return;
  }

  // Handle generic errors
  const response: ApiResponse = {
    success: false,
    message: config.isDevelopment() ? error.message : "Internal server error",
    error: config.isDevelopment() ? error.stack : "Internal server error",
  };

  res.status(500).json(response);
};


export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const startTime = Date.now();

  // Log request start
  // logger.info("Request started", {
  //   method: req.method,
  //   path: req.path,
  //   ip: req.ip,
  //   userAgent: req.get("User-Agent"),
  // });

  // Save original `end` method
  const originalEnd = res.end.bind(res);

  res.end = ((chunk?: any, encoding?: any, cb?: () => void) => {
    const duration = Date.now() - startTime;

    // logger.info("Request completed", {
    //   method: req.method,
    //   path: req.path,
    //   statusCode: res.statusCode,
    //   duration,
    //   contentLength: res.get("content-length"),
    // });

    return originalEnd(chunk, encoding, cb);
  }) as typeof res.end;

  next();
};

// export const corsOptions = {
//   origin: (
//     origin: string | undefined,
//     callback: (error: Error | null, allow?: boolean) => void
//   ) => {
//     const allowedOrigins = config.get("corsOrigins");

//     // Allow requests with no origin (like mobile apps or curl requests)
//     if (!origin) return callback(null, true);

//     if (allowedOrigins.includes(origin)) {
//       callback(null, true);
//     } else {
//       callback(new Error("Not allowed by CORS"));
//     }
//   },
//   credentials: true,
//   methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
//   allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
//   exposedHeaders: ["Content-Disposition"], // For file downloads
// };

export const corsOptions = {
  origin: (
    origin: string | undefined,
    callback: (error: Error | null, allow?: boolean) => void
  ) => {
    const allowedOrigins = config.get("corsOrigins");

    // Allow requests with no origin (like mobile apps, curl, or local HTML files)
    if (!origin) {
      console.log('🔍 CORS: Allowing request with no origin');
      return callback(null, true);
    }

    // Check if origin starts with file:// (local HTML files)
    if (origin.startsWith('file://')) {
      console.log('🔍 CORS: Allowing local file access');
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('❌ CORS: Origin not allowed:', origin);
      callback(null, true); // <-- TEMPORARILY allow all for testing
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
  exposedHeaders: ["Content-Disposition"],
};


export const securityHeaders = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Remove powered-by header
  res.removeHeader("X-Powered-By");

  // Add security headers
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Add CSP header for API endpoints
  if (req.path.startsWith("/api/")) {
    res.setHeader("Content-Security-Policy", "default-src 'none'");
  }

  next();
};


export const requestSizeLimit = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // This is handled by express.json() and express.urlencoded() limits
  // But we can add additional checks here if needed

  const contentLength = req.get("content-length");
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    const maxSize = 50 * 1024 * 1024; // 50MB for file uploads

    if (size > maxSize) {
      const response: ApiResponse = {
        success: false,
        message: "Request too large",
        error: "Request size exceeds limit",
      };

      res.status(413).json(response);
      return;
    }
  }

  next();
};

export const validateApiKey = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const apiKey = req.get("x-api-key");

  // For now, just log if API key is present
  if (apiKey) {
    logger.debug("API key present in request", {
      hasApiKey: true,
      keyLength: apiKey.length,
    });
  }

  next();
};


export const healthCheckBypass = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Skip heavy middleware for health checks
  if (req.path === "/health" || req.path === "/api/health") {
    return next();
  }

  // Apply logging for non-health-check requests
  requestLogger(req, res, next);
};

export const gracefulShutdown = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Check if server is shutting down
  if (process.env.SHUTTING_DOWN === "true") {
    const response: ApiResponse = {
      success: false,
      message: "Server is shutting down, please try again later",
      error: "Service unavailable",
    };

    res.status(503).json(response);
    return;
  }

  next();
};
