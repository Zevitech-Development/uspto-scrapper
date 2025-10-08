import { Router } from "express";
import { PipelineController } from "../controllers/pipeline-controller";
import { AuthMiddleware } from "../middleware/auth-middleware";
import rateLimit from "express-rate-limit";

const router = Router();
const pipelineController = new PipelineController();

// Rate limiter for pipeline endpoints
const pipelineRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 requests per window
  message: {
    success: false,
    message: "Too many pipeline requests, please try again later",
    error: "Rate limit exceeded",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply authentication to all routes
router.use(AuthMiddleware.authenticate);

// ========== USER ROUTES ==========
// These routes are accessible to all authenticated users

// Create new lead
router.post("/leads", pipelineRateLimiter, pipelineController.createLead);

// Get my submitted leads
router.get("/leads/my", pipelineController.getMyLeads);

// Get my stats
router.get("/stats/my", pipelineController.getMyStats);

// Get trademark by serial number (for auto-fill)
router.get("/trademark/:serialNumber", pipelineController.getTrademarkBySerial);

// ========== ADMIN ROUTES ==========
// These routes require admin privileges

// Get all leads (with filters)
router.get(
  "/admin/leads",
  AuthMiddleware.requireAdmin,
  pipelineController.getAllLeads
);

// Update lead
router.put(
  "/admin/leads/:leadId",
  AuthMiddleware.requireAdmin,
  pipelineController.updateLead
);

// Delete lead
router.delete(
  "/admin/leads/:leadId",
  AuthMiddleware.requireAdmin,
  pipelineController.deleteLead
);

// Archive lead
router.post(
  "/admin/leads/:leadId/archive",
  AuthMiddleware.requireAdmin,
  pipelineController.archiveLead
);

// Get pipeline stats
router.get(
  "/admin/stats",
  AuthMiddleware.requireAdmin,
  pipelineController.getPipelineStats
);

export default router;
