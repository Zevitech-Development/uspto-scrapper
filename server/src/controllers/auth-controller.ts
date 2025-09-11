import { Request, Response, NextFunction } from "express";
import Joi from "joi";
import { ApiResponse, AppError } from "../types/global-interface";
import { AuthenticatedRequest } from "../middleware/auth-middleware";
import logger from "../utils/logger";
import { AuthService } from "../services/auth-service";
import { LoginCredentials } from "../types/user-interface";

export class AuthController {
  private authService: AuthService;

  constructor() {
    this.authService = AuthService.getInstance();
  }


  //   public register = async (
  //     req: Request,
  //     res: Response,
  //     next: NextFunction
  //   ): Promise<void> => {
  //     try {
  //       // Validation schema
  //       const schema = Joi.object({
  //         email: Joi.string().email().required().messages({
  //           "string.email": "Please provide a valid email address",
  //           "any.required": "Email is required",
  //         }),
  //         password: Joi.string().min(6).max(128).required().messages({
  //           "string.min": "Password must be at least 6 characters long",
  //           "string.max": "Password cannot exceed 128 characters",
  //           "any.required": "Password is required",
  //         }),
  //         firstName: Joi.string().trim().min(1).max(50).required().messages({
  //           "string.min": "First name is required",
  //           "string.max": "First name cannot exceed 50 characters",
  //           "any.required": "First name is required",
  //         }),
  //         lastName: Joi.string().trim().min(1).max(50).required().messages({
  //           "string.min": "Last name is required",
  //           "string.max": "Last name cannot exceed 50 characters",
  //           "any.required": "Last name is required",
  //         }),
  //       });

  //       const { error, value } = schema.validate(req.body);
  //       if (error) {
  //         throw new AppError(error.details[0].message, 400, "VALIDATION_ERROR");
  //       }

  //       // Public registration always creates regular users, not admins
  //       const registerData: RegisterData = {
  //         ...value,
  //         role: "user",
  //       };

  //       const authResponse = await this.authService.register(registerData);

  //       logger.info("User registration successful", {
  //         action: "user_register_success",
  //         email: registerData.email,
  //         role: registerData.role,
  //       });

  //       const response: ApiResponse = {
  //         success: true,
  //         data: authResponse,
  //         message: "Registration successful",
  //       };

  //       res.status(201).json(response);
  //     } catch (error) {
  //       next(error);
  //     }
  //   };


  public login = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // Validation schema
      const schema = Joi.object({
        email: Joi.string().email().required().messages({
          "string.email": "Please provide a valid email address",
          "any.required": "Email is required",
        }),
        password: Joi.string().required().messages({
          "any.required": "Password is required",
        }),
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        throw new AppError(error.details[0].message, 400, "VALIDATION_ERROR");
      }

      const credentials: LoginCredentials = value;
      const authResponse = await this.authService.login(credentials);

      logger.info("User login successful", {
        action: "user_login_success",
        email: credentials.email,
        userId: authResponse.user.id,
      });

      const response: ApiResponse = {
        success: true,
        data: authResponse,
        message: "Login successful",
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  public getProfile = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError("User not authenticated", 401, "NOT_AUTHENTICATED");
      }

      const user = await this.authService.getUserProfile(req.user.id);

      const response: ApiResponse = {
        success: true,
        data: {
          id: user._id.toString(),
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          lastLogin: user.lastLogin,
          createdAt: user.createdAt,
        },
        message: "Profile retrieved successfully",
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  public updateProfile = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError("User not authenticated", 401, "NOT_AUTHENTICATED");
      }

      // Validation schema
      const schema = Joi.object({
        firstName: Joi.string().trim().min(1).max(50).optional(),
        lastName: Joi.string().trim().min(1).max(50).optional(),
        email: Joi.string().email().optional(),
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        throw new AppError(error.details[0].message, 400, "VALIDATION_ERROR");
      }

      const updatedUser = await this.authService.updateUserProfile(
        req.user.id,
        value
      );

      const response: ApiResponse = {
        success: true,
        data: {
          id: updatedUser._id.toString(),
          email: updatedUser.email,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          role: updatedUser.role,
        },
        message: "Profile updated successfully",
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  public changePassword = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError("User not authenticated", 401, "NOT_AUTHENTICATED");
      }

      // Validation schema
      const schema = Joi.object({
        currentPassword: Joi.string().required().messages({
          "any.required": "Current password is required",
        }),
        newPassword: Joi.string().min(6).max(128).required().messages({
          "string.min": "New password must be at least 6 characters long",
          "string.max": "New password cannot exceed 128 characters",
          "any.required": "New password is required",
        }),
        confirmPassword: Joi.string()
          .valid(Joi.ref("newPassword"))
          .required()
          .messages({
            "any.only": "Password confirmation does not match",
            "any.required": "Password confirmation is required",
          }),
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        throw new AppError(error.details[0].message, 400, "VALIDATION_ERROR");
      }

      await this.authService.changePassword(
        req.user.id,
        value.currentPassword,
        value.newPassword
      );

      logger.info("Password changed successfully", {
        action: "password_change_success",
        userId: req.user.id,
        email: req.user.email,
      });

      const response: ApiResponse = {
        success: true,
        message: "Password changed successfully",
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  public logout = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (req.user) {
        logger.info("User logged out", {
          action: "user_logout",
          userId: req.user.id,
          email: req.user.email,
        });
      }

      const response: ApiResponse = {
        success: true,
        message: "Logged out successfully",
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  public validateToken = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError("Invalid token", 401, "INVALID_TOKEN");
      }

      const response: ApiResponse = {
        success: true,
        data: {
          valid: true,
          user: req.user,
        },
        message: "Token is valid",
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  // =============== ADMIN ROUTES ===============

  public getAllUsers = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const result = await this.authService.getAllUsers(page, limit);

      const response: ApiResponse = {
        success: true,
        data: result,
        message: "Users retrieved successfully",
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  public createUser = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // Validation schema (allows admin role for admin creation)
      const schema = Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().min(6).max(128).required(),
        firstName: Joi.string().trim().min(1).max(50).required(),
        lastName: Joi.string().trim().min(1).max(50).required(),
        role: Joi.string().valid("admin", "user").default("user"),
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        throw new AppError(error.details[0].message, 400, "VALIDATION_ERROR");
      }

      const user = await this.authService.createUser(value);

      logger.info("User created by admin", {
        action: "admin_create_user_success",
        adminUserId: req.user?.id,
        newUserId: user._id.toString(),
        newUserEmail: user.email,
        role: user.role,
      });

      const response: ApiResponse = {
        success: true,
        data: {
          id: user._id.toString(),
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          isActive: user.isActive,
          createdAt: user.createdAt,
        },
        message: "User created successfully",
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  };

  public updateUserStatus = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { userId } = req.params;

      const schema = Joi.object({
        isActive: Joi.boolean().required(),
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        throw new AppError(error.details[0].message, 400, "VALIDATION_ERROR");
      }

      const user = await this.authService.updateUserStatus(
        userId,
        value.isActive
      );

      logger.info("User status updated by admin", {
        action: "admin_update_user_status",
        adminUserId: req.user?.id,
        targetUserId: userId,
        isActive: value.isActive,
      });

      const response: ApiResponse = {
        success: true,
        data: {
          id: user._id.toString(),
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          isActive: user.isActive,
        },
        message: `User ${
          value.isActive ? "activated" : "deactivated"
        } successfully`,
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  public deleteUser = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { userId } = req.params;

      // Prevent self-deletion
      if (req.user?.id === userId) {
        throw new AppError(
          "Cannot delete your own account",
          400,
          "SELF_DELETE_FORBIDDEN"
        );
      }

      await this.authService.deleteUser(userId);

      logger.info("User deleted by admin", {
        action: "admin_delete_user",
        adminUserId: req.user?.id,
        deletedUserId: userId,
      });

      const response: ApiResponse = {
        success: true,
        message: "User deleted successfully",
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  public getUserStats = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const stats = await this.authService.getUserStats();

      const response: ApiResponse = {
        success: true,
        data: stats,
        message: "User statistics retrieved successfully",
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };
}
