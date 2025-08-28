import config from "../config/config";
import { User } from "../models/user.model";
import { AppError } from "../types/global-interface";
import {
  AuthResponse,
  IUser,
  JWTPayload,
  LoginCredentials,
  RegisterData,
} from "../types/user-interface";
import logger from "../utils/logger";
import jwt, { Secret, SignOptions } from "jsonwebtoken";

export class AuthService {
  private static instance: AuthService;
  private jwtSecret: string;
  private jwtExpiresIn: string;

  private constructor() {
    this.jwtSecret = config.get("jwtSecret");
    this.jwtExpiresIn = config.get("jwtExpiresIn");
  }

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * Register a new user
   */
  public async register(userData: RegisterData): Promise<AuthResponse> {
    try {
      const { email, password, firstName, lastName, role = "user" } = userData;

      // Check if user already exists
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        throw new AppError(
          "User with this email already exists",
          409,
          "USER_EXISTS"
        );
      }

      // Only allow admin creation by existing admins (checked in controller)
      const user = new User({
        email: email.toLowerCase(),
        password,
        firstName,
        lastName,
        role,
      });

      await user.save();

      logger.info("User registered successfully", {
        action: "user_register",
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
      });

      // Update last login
      user.lastLogin = new Date();
      await user.save();

      return this.generateAuthResponse(user);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error("Failed to register user", error as Error, {
        email: userData.email,
      });

      throw new AppError("Registration failed", 500, "REGISTRATION_ERROR");
    }
  }

  /**
   * Login user
   */
  public async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      const { email, password } = credentials;

      // Find user with password field included
      const user = await User.findOne({
        email: email.toLowerCase(),
        isActive: true,
      }).select("+password");

      if (!user) {
        throw new AppError(
          "Invalid email or password",
          401,
          "INVALID_CREDENTIALS"
        );
      }

      // Check password
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        throw new AppError(
          "Invalid email or password",
          401,
          "INVALID_CREDENTIALS"
        );
      }

      // Update last login
      user.lastLogin = new Date();
      await user.save();

      logger.info("User logged in successfully", {
        action: "user_login",
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
      });

      return this.generateAuthResponse(user);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error("Login failed", error as Error, {
        email: credentials.email,
      });

      throw new AppError("Login failed", 500, "LOGIN_ERROR");
    }
  }

  /**
   * Verify JWT token and return user
   */
  public async verifyToken(token: string): Promise<IUser> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as JWTPayload;

      const user = await User.findById(decoded.userId);
      if (!user || !user.isActive) {
        throw new AppError("User not found or inactive", 401, "USER_NOT_FOUND");
      }

      return user;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AppError("Invalid token", 401, "INVALID_TOKEN");
      }

      if (error instanceof jwt.TokenExpiredError) {
        throw new AppError("Token expired", 401, "TOKEN_EXPIRED");
      }

      if (error instanceof AppError) {
        throw error;
      }

      logger.error("Token verification failed", error as Error);
      throw new AppError(
        "Token verification failed",
        401,
        "TOKEN_VERIFICATION_ERROR"
      );
    }
  }

  /**
   * Generate JWT token for user
   */

  private generateToken(user: IUser): string {
    const payload: JWTPayload = {
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    const secret: Secret = this.jwtSecret as Secret;

    const options: SignOptions = {
      expiresIn: (process.env.JWT_EXPIRES_IN ||
        "7d") as jwt.SignOptions["expiresIn"],
      issuer: "uspto-tsdr-api",
      audience: "uspto-tsdr-frontend",
    };

    return jwt.sign(payload, secret, options);
  }
  /**
   * Generate complete auth response
   */
  private generateAuthResponse(user: IUser): AuthResponse {
    const token = this.generateToken(user);

    return {
      user: {
        id: user._id.toString(),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        lastLogin: user.lastLogin,
      },
      token,
      expiresIn: this.jwtExpiresIn,
    };
  }

  /**
   * Change user password
   */
  public async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    try {
      const user = await User.findById(userId).select("+password");
      if (!user) {
        throw new AppError("User not found", 404, "USER_NOT_FOUND");
      }

      // Verify current password
      const isCurrentPasswordValid = await user.comparePassword(
        currentPassword
      );
      if (!isCurrentPasswordValid) {
        throw new AppError(
          "Current password is incorrect",
          400,
          "INVALID_CURRENT_PASSWORD"
        );
      }

      // Update password (will be hashed by pre-save middleware)
      user.password = newPassword;
      await user.save();

      logger.info("Password changed successfully", {
        action: "password_change",
        userId: user._id.toString(),
        email: user.email,
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error("Password change failed", error as Error, { userId });
      throw new AppError(
        "Password change failed",
        500,
        "PASSWORD_CHANGE_ERROR"
      );
    }
  }

  /**
   * Get user profile
   */
  public async getUserProfile(userId: string): Promise<IUser> {
    try {
      const user = await User.findById(userId);
      if (!user || !user.isActive) {
        throw new AppError("User not found", 404, "USER_NOT_FOUND");
      }

      return user;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error("Failed to get user profile", error as Error, { userId });
      throw new AppError(
        "Failed to get user profile",
        500,
        "PROFILE_FETCH_ERROR"
      );
    }
  }

  /**
   * Update user profile
   */
  public async updateUserProfile(
    userId: string,
    updates: Partial<Pick<IUser, "firstName" | "lastName" | "email">>
  ): Promise<IUser> {
    try {
      // If email is being updated, check if it's already taken
      if (updates.email) {
        const existingUser = await User.findOne({
          email: updates.email.toLowerCase(),
          _id: { $ne: userId },
        });

        if (existingUser) {
          throw new AppError("Email already in use", 409, "EMAIL_IN_USE");
        }

        updates.email = updates.email.toLowerCase();
      }

      const user = await User.findByIdAndUpdate(userId, updates, {
        new: true,
        runValidators: true,
      });

      if (!user) {
        throw new AppError("User not found", 404, "USER_NOT_FOUND");
      }

      logger.info("User profile updated", {
        action: "profile_update",
        userId: user._id.toString(),
        email: user.email,
        updatedFields: Object.keys(updates),
      });

      return user;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error("Failed to update user profile", error as Error, { userId });
      throw new AppError(
        "Failed to update user profile",
        500,
        "PROFILE_UPDATE_ERROR"
      );
    }
  }

  /**
   * Admin: Get all users
   */
  public async getAllUsers(
    page: number = 1,
    limit: number = 20
  ): Promise<{
    users: IUser[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const skip = (page - 1) * limit;

      const [users, total] = await Promise.all([
        User.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
        User.countDocuments(),
      ]);

      return {
        users,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      logger.error("Failed to get all users", error as Error);
      throw new AppError("Failed to retrieve users", 500, "USERS_FETCH_ERROR");
    }
  }

  /**
   * Admin: Create user
   */
  public async createUser(userData: RegisterData): Promise<IUser> {
    try {
      const { email, password, firstName, lastName, role = "user" } = userData;

      // Check if user already exists
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        throw new AppError(
          "User with this email already exists",
          409,
          "USER_EXISTS"
        );
      }

      const user = new User({
        email: email.toLowerCase(),
        password,
        firstName,
        lastName,
        role,
      });

      await user.save();

      logger.info("User created by admin", {
        action: "admin_create_user",
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
      });

      return user;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error("Failed to create user", error as Error, {
        email: userData.email,
      });

      throw new AppError("User creation failed", 500, "USER_CREATION_ERROR");
    }
  }

  /**
   * Admin: Update user status
   */
  public async updateUserStatus(
    userId: string,
    isActive: boolean
  ): Promise<IUser> {
    try {
      const user = await User.findByIdAndUpdate(
        userId,
        { isActive },
        { new: true, runValidators: true }
      );

      if (!user) {
        throw new AppError("User not found", 404, "USER_NOT_FOUND");
      }

      logger.info("User status updated", {
        action: "admin_update_user_status",
        userId: user._id.toString(),
        email: user.email,
        isActive,
      });

      return user;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error("Failed to update user status", error as Error, { userId });
      throw new AppError(
        "Failed to update user status",
        500,
        "USER_STATUS_UPDATE_ERROR"
      );
    }
  }

  /**
   * Admin: Delete user
   */
  public async deleteUser(userId: string): Promise<void> {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new AppError("User not found", 404, "USER_NOT_FOUND");
      }

      // Prevent deleting the last admin
      if (user.role === "admin") {
        const adminCount = await User.countDocuments({
          role: "admin",
          isActive: true,
        });
        if (adminCount <= 1) {
          throw new AppError(
            "Cannot delete the last admin user",
            400,
            "LAST_ADMIN_DELETE"
          );
        }
      }

      await User.findByIdAndDelete(userId);

      logger.info("User deleted", {
        action: "admin_delete_user",
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error("Failed to delete user", error as Error, { userId });
      throw new AppError("Failed to delete user", 500, "USER_DELETE_ERROR");
    }
  }

  /**
   * Create default admin user if none exists
   */
  public async createDefaultAdmin(): Promise<void> {
    try {
      const adminCount = await User.countDocuments({ role: "admin" });

      if (adminCount === 0) {
        const defaultAdmin = new User({
          email: "admin@uspto-tsdr.com",
          password: "admin123", // Should be changed immediately
          firstName: "Admin",
          lastName: "User",
          role: "admin",
        });

        await defaultAdmin.save();

        logger.info("Default admin user created", {
          action: "create_default_admin",
          email: defaultAdmin.email,
        });

        console.log("🚨 DEFAULT ADMIN CREATED:");
        console.log("Email: admin@uspto-tsdr.com");
        console.log("Password: admin123");
        console.log(
          "Please change the password immediately after first login!"
        );
      }
    } catch (error) {
      logger.error("Failed to create default admin", error as Error);
    }
  }

  /**
   * Get user statistics for admin dashboard
   */
  public async getUserStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    adminUsers: number;
    newUsersThisMonth: number;
    lastLoginActivity: Date | null;
  }> {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const [
        totalUsers,
        activeUsers,
        adminUsers,
        newUsersThisMonth,
        lastActiveUser,
      ] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ isActive: true }),
        User.countDocuments({ role: "admin", isActive: true }),
        User.countDocuments({ createdAt: { $gte: startOfMonth } }),
        User.findOne({ lastLogin: { $exists: true } })
          .sort({ lastLogin: -1 })
          .select("lastLogin"),
      ]);

      return {
        totalUsers,
        activeUsers,
        adminUsers,
        newUsersThisMonth,
        lastLoginActivity: lastActiveUser?.lastLogin || null,
      };
    } catch (error) {
      logger.error("Failed to get user stats", error as Error);
      throw new AppError(
        "Failed to retrieve user statistics",
        500,
        "USER_STATS_ERROR"
      );
    }
  }
}
