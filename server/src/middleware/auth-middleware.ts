import { Request, Response, NextFunction } from "express";
import { AuthService } from "../services/auth-service";
import { ApiResponse, AppError } from "../types/global-interface";
import logger from "../utils/logger";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    firstName: string;
    lastName: string;
  };
}

export class AuthMiddleware {
  private static authService = AuthService.getInstance();

  public static async authenticate(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        const response: ApiResponse = {
          success: false,
          message: "Access token is required",
          error: "No authorization header",
        };
        res.status(401).json(response);
        return;
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix

      if (!token) {
        const response: ApiResponse = {
          success: false,
          message: "Access token is required",
          error: "No token provided",
        };
        res.status(401).json(response);
        return;
      }

      // Verify token and get user
      const user = await AuthMiddleware.authService.verifyToken(token);

      // Add user info to request
      req.user = {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
      };

      logger.debug("User authenticated successfully", {
        action: "auth_success",
        userId: req.user.id,
        email: req.user.email,
        path: req.path,
      });

      next();
    } catch (error) {
      if (error instanceof AppError) {
        const response: ApiResponse = {
          success: false,
          message: error.message,
          error: error.code || "Authentication failed",
        };
        res.status(error.statusCode).json(response);
        return;
      }

      logger.error("Authentication middleware error", error as Error, {
        path: req.path,
        method: req.method,
      });

      const response: ApiResponse = {
        success: false,
        message: "Authentication failed",
        error: "Internal authentication error",
      };
      res.status(500).json(response);
    }
  }

  public static requireAdmin(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): void {
    if (!req.user) {
      const response: ApiResponse = {
        success: false,
        message: "Authentication required",
        error: "No user context",
      };
      res.status(401).json(response);
      return;
    }

    if (req.user.role !== "admin") {
      logger.warn("Admin access attempted by non-admin user", {
        action: "admin_access_denied",
        userId: req.user.id,
        email: req.user.email,
        path: req.path,
      });

      const response: ApiResponse = {
        success: false,
        message: "Admin access required",
        error: "Insufficient permissions",
      };
      res.status(403).json(response);
      return;
    }

    logger.debug("Admin access granted", {
      action: "admin_access_granted",
      userId: req.user.id,
      path: req.path,
    });

    next();
  }

  public static requireActiveUser(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): void {
    if (!req.user) {
      const response: ApiResponse = {
        success: false,
        message: "Authentication required",
        error: "No user context",
      };
      res.status(401).json(response);
      return;
    }

    // Additional check would require database call
    // For now, we trust the JWT token validation
    next();
  }

  public static async optionalAuth(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return next(); // Continue without authentication
      }

      const token = authHeader.substring(7);

      if (!token) {
        return next(); // Continue without authentication
      }

      // Try to verify token
      const user = await AuthMiddleware.authService.verifyToken(token);

      // Add user info to request if token is valid
      req.user = {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
      };

      next();
    } catch (error) {
      // Log error but continue without authentication
      logger.debug("Optional auth failed, continuing without auth", {
        error: (error as Error).message,
        path: req.path,
      });

      next();
    }
  }

  public static checkResourceAccess(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): void {
    if (!req.user) {
      const response: ApiResponse = {
        success: false,
        message: "Authentication required",
        error: "No user context",
      };
      res.status(401).json(response);
      return;
    }

    // For now, all authenticated users can access their own resources
    // Add more specific logic here if needed (e.g., job ownership checks)
    next();
  }
}
