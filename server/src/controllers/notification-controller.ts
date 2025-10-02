import { Response, NextFunction } from "express";
import { NotificationService } from "../services/notification-service";
import { AuthenticatedRequest } from "../middleware/auth-middleware";
import { ApiResponse, AppError } from "../types/global-interface";
import logger from "../utils/logger";

export class NotificationController {
  private notificationService: NotificationService;

  constructor() {
    this.notificationService = NotificationService.getInstance();
  }

  public getNotifications = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError("Authentication required", 401, "NOT_AUTHENTICATED");
      }

      const unreadOnly = req.query.unreadOnly === "true";
      const limit = parseInt(req.query.limit as string) || 50;
      const skip = parseInt(req.query.skip as string) || 0;

      const result = await this.notificationService.getNotifications(
        req.user.id,
        { unreadOnly, limit, skip }
      );

      const response: ApiResponse = {
        success: true,
        data: result,
        message: "Notifications retrieved successfully",
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  public getUnreadCount = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError("Authentication required", 401, "NOT_AUTHENTICATED");
      }

      const count = await this.notificationService.getUnreadCount(req.user.id);

      const response: ApiResponse = {
        success: true,
        data: { count },
        message: "Unread count retrieved successfully",
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  public markAsRead = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { notificationId } = req.params;

      await this.notificationService.markAsRead(notificationId);

      const response: ApiResponse = {
        success: true,
        message: "Notification marked as read",
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  public markAllAsRead = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError("Authentication required", 401, "NOT_AUTHENTICATED");
      }

      const count = await this.notificationService.markAllAsRead(req.user.id);

      const response: ApiResponse = {
        success: true,
        data: { markedCount: count },
        message: `${count} notifications marked as read`,
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };
}