import {
  INotification,
  NotificationCreateData,
} from "../types/notification-interface";
import { AppError } from "../types/global-interface";
import logger from "../utils/logger";
import { Notification } from "../models/notification-model";

export class NotificationService {
  private static instance: NotificationService;

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  public async createNotification(
    data: NotificationCreateData
  ): Promise<INotification> {
    try {
      const notification = await Notification.create({
        recipientId: data.recipientId,
        senderId: data.senderId,
        jobId: data.jobId,
        type: data.type,
        message: data.message,
        read: false,
        createdAt: new Date(),
      });

      logger.info("Notification created", {
        action: "notification_created",
        notificationId: (notification._id as string).toString(),
        type: data.type,
        recipientId: data.recipientId,
        jobId: data.jobId,
      });

      return notification;
    } catch (error) {
      logger.error("Failed to create notification", error as Error, {
        type: data.type,
        recipientId: data.recipientId,
      });
      throw new AppError(
        "Failed to create notification",
        500,
        "NOTIFICATION_CREATE_ERROR"
      );
    }
  }

  public async getNotifications(
    recipientId: string,
    options: {
      unreadOnly?: boolean;
      limit?: number;
      skip?: number;
    } = {}
  ): Promise<{
    notifications: INotification[];
    total: number;
    unreadCount: number;
  }> {
    try {
      const { unreadOnly = false, limit = 50, skip = 0 } = options;

      const query: any = { recipientId };
      if (unreadOnly) {
        query.read = false;
      }

      const [notifications, total, unreadCount] = await Promise.all([
        Notification.find(query)
          .sort({ createdAt: -1 })
          .limit(limit)
          .skip(skip)
          .lean(),
        Notification.countDocuments(query),
        Notification.countDocuments({ recipientId, read: false }),
      ]);

      return {
        notifications: notifications as INotification[],
        total,
        unreadCount,
      };
    } catch (error) {
      logger.error("Failed to get notifications", error as Error, {
        recipientId,
      });
      throw new AppError(
        "Failed to retrieve notifications",
        500,
        "NOTIFICATION_FETCH_ERROR"
      );
    }
  }

  public async markAsRead(notificationIds: string | string[]): Promise<number> {
    try {
      const ids = Array.isArray(notificationIds)
        ? notificationIds
        : [notificationIds];

      const result = await Notification.updateMany(
        { _id: { $in: ids } },
        { $set: { read: true } }
      );

      logger.info("Notifications marked as read", {
        action: "notifications_marked_read",
        count: result.modifiedCount,
      });

      return result.modifiedCount;
    } catch (error) {
      logger.error("Failed to mark notifications as read", error as Error);
      throw new AppError(
        "Failed to mark notifications as read",
        500,
        "NOTIFICATION_UPDATE_ERROR"
      );
    }
  }

  public async markAllAsRead(recipientId: string): Promise<number> {
    try {
      const result = await Notification.updateMany(
        { recipientId, read: false },
        { $set: { read: true } }
      );

      logger.info("All notifications marked as read", {
        action: "all_notifications_marked_read",
        recipientId,
        count: result.modifiedCount,
      });

      return result.modifiedCount;
    } catch (error) {
      logger.error("Failed to mark all notifications as read", error as Error, {
        recipientId,
      });
      throw new AppError(
        "Failed to mark all notifications as read",
        500,
        "NOTIFICATION_UPDATE_ERROR"
      );
    }
  }

  public async getUnreadCount(recipientId: string): Promise<number> {
    try {
      return await Notification.countDocuments({
        recipientId,
        read: false,
      });
    } catch (error) {
      logger.error("Failed to get unread count", error as Error, {
        recipientId,
      });
      return 0; // Return 0 on error instead of throwing
    }
  }

  public async deleteOldNotifications(daysOld: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await Notification.deleteMany({
        read: true,
        createdAt: { $lt: cutoffDate },
      });

      logger.info("Old notifications deleted", {
        action: "notifications_cleanup",
        count: result.deletedCount,
        daysOld,
      });

      return result.deletedCount;
    } catch (error) {
      logger.error("Failed to delete old notifications", error as Error);
      throw new AppError(
        "Failed to delete old notifications",
        500,
        "NOTIFICATION_DELETE_ERROR"
      );
    }
  }

  public async getJobNotifications(jobId: string): Promise<INotification[]> {
    try {
      return (await Notification.find({ jobId })
        .sort({ createdAt: -1 })
        .lean()) as INotification[];
    } catch (error) {
      logger.error("Failed to get job notifications", error as Error, {
        jobId,
      });
      throw new AppError(
        "Failed to retrieve job notifications",
        500,
        "NOTIFICATION_FETCH_ERROR"
      );
    }
  }
}
