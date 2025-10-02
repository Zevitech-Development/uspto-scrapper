import { Document } from "mongoose";

export interface INotification extends Document {
  recipientId: string;
  senderId: string;
  jobId: string;
  type: "job_assigned" | "job_downloaded" | "job_working" | "job_finished";
  message: string;
  read: boolean;
  createdAt: Date;
}

export interface NotificationCreateData {
  recipientId: string;
  senderId: string;
  jobId: string;
  type: INotification["type"];
  message: string;
}
