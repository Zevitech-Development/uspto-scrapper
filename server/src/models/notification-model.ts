import mongoose, { Schema } from "mongoose";
import { INotification } from "../types/notification-interface";

const notificationSchema = new Schema<INotification>(
  {
    recipientId: {
      type: String,
      required: true,
      index: true,
    },
    senderId: {
      type: String,
      required: true,
    },
    jobId: {
      type: String,
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["job_assigned", "job_downloaded", "job_working", "job_finished"],
      required: true,
      index: true,
    },
    message: {
      type: String,
      required: true,
    },
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false,
  }
);

// Compound indexes for efficient queries
notificationSchema.index({ recipientId: 1, read: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, type: 1, createdAt: -1 });
notificationSchema.index({ jobId: 1, type: 1 });

export const Notification = mongoose.model<INotification>(
  "Notification",
  notificationSchema
);
