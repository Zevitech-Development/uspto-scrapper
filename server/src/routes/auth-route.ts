import { Router } from "express";
import { AuthController } from "../controllers/auth-controller";
import { AuthMiddleware } from "../middleware/auth-middleware";

const router = Router();
const authController = new AuthController();

// Create stricter rate limiting for auth endpoints
import rateLimit from "express-rate-limit";

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    success: false,
    message: "Too many authentication attempts, please try again later",
    error: "Auth rate limit exceeded",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
});

// Public authentication routes
// router.post("/register", authRateLimiter, authController.register);
router.post("/login", authRateLimiter, authController.login);

// Protected routes (require authentication)
router.use(AuthMiddleware.authenticate);

router.get("/profile", authController.getProfile);
router.put("/profile", authController.updateProfile);
router.post("/change-password", authController.changePassword);
router.post("/logout", authController.logout);
router.get("/validate", authController.validateToken);

// Admin-only routes
router.use("/admin", AuthMiddleware.requireAdmin);

router.get("/admin/users", authController.getAllUsers);
router.post("/admin/users", authController.createUser);
router.put("/admin/users/:userId/status", authController.updateUserStatus);
router.delete("/admin/users/:userId", authController.deleteUser);
router.get("/admin/stats", authController.getUserStats);

export default router;
