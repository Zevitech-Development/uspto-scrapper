import { errorHandler, rateLimiter } from "../middleware/index";
import { TrademarkController } from "../controllers/trademark-controller";
import { AuthMiddleware } from "../middleware/auth-middleware";
import authRoutes from "./auth-route";
import { Router } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { NotificationController } from "../controllers/notification-controller";

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
      "application/vnd.ms-excel", // .xls
      "text/csv", // .csv
    ];

    const allowedExtensions = [".xlsx", ".xls", ".csv"];
    const fileExtension = file.originalname
      .toLowerCase()
      .substring(file.originalname.lastIndexOf("."));

    if (
      allowedMimeTypes.includes(file.mimetype) ||
      allowedExtensions.includes(fileExtension)
    ) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Please upload an Excel file (.xlsx, .xls) or CSV file"
        )
      );
    }
  },
});

const router = Router();
const trademarkController = new TrademarkController();
const notificationController = new NotificationController();

// Health check route (no rate limiting, no auth)
router.get("/health", trademarkController.healthCheck);

// Auth routes (have their own rate limiting)
router.use("/auth", authRoutes);

// Authentication middleware for all routes below
router.use(AuthMiddleware.authenticate);

router.get(
  "/notifications",
  AuthMiddleware.requireAdmin,
  notificationController.getNotifications
);
router.get(
  "/notifications/unread-count",
  AuthMiddleware.requireAdmin,
  notificationController.getUnreadCount
);
router.patch(
  "/notifications/:notificationId/read",
  AuthMiddleware.requireAdmin,
  notificationController.markAsRead
);
router.patch(
  "/notifications/mark-all-read",
  AuthMiddleware.requireAdmin,
  notificationController.markAllAsRead
);

router.post(
  "/admin/jobs/:jobId/assign",
  AuthMiddleware.requireAdmin,
  trademarkController.assignJobToUser
);
router.get(
  "/admin/jobs/assignments",
  AuthMiddleware.requireAdmin,
  trademarkController.getJobAssignments
);

router.get(
  "/admin/user-timeline/:userId",
  AuthMiddleware.requireAdmin,
  trademarkController.getUserTimeline
);

// User job routes (no rate limiting for assigned jobs)
router.get("/user/jobs/assigned", trademarkController.getMyAssignedJobs);
router.patch(
  "/user/jobs/:jobId/status",
  trademarkController.updateJobUserStatus
);

// Job status and monitoring routes (NO RATE LIMITING - high frequency polling)
router.get("/jobs/status/:status", trademarkController.getJobsByStatus);
router.get("/jobs/:jobId", trademarkController.getJobStatus);
router.get("/jobs/:jobId/details", trademarkController.getDetailedJobInfo);
router.get("/jobs/:jobId/download", trademarkController.downloadResults);

// Queue management routes (admin only, no rate limiting)
router.get(
  "/queue/stats",
  AuthMiddleware.requireAdmin,
  trademarkController.getQueueStats
);

// Apply rate limiting to remaining routes
router.use(rateLimiter);

// File upload and processing routes (rate limited)
router.post(
  "/upload",
  AuthMiddleware.requireAdmin,
  upload.single("file"),
  trademarkController.uploadAndProcess
);

// Direct serial number processing (rate limited)
router.post(
  "/process",
  AuthMiddleware.requireAdmin,
  trademarkController.processSerialNumbers
);

// Job modification routes (rate limited)
router.delete("/jobs/:jobId", trademarkController.cancelJob);
router.post("/jobs/:jobId/retry", trademarkController.retryJob);

// Single trademark lookup (rate limited)
router.get("/trademark/:serialNumber", trademarkController.getSingleTrademark);

// Error handling middleware
router.use(errorHandler);

export default router;
