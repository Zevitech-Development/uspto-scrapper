import { Document } from "mongoose";
import { TrademarkData } from "./global-interface";

export interface ITrademark extends Document {
  serialNumber: string;
  ownerName: string | null;
  markText: string | null;
  ownerPhone: string | null;
  ownerEmail: string | null;
  attorneyName: string | null;
  abandonDate: string | null;
  abandonReason: string | null;
  filingDate: string | null;
  status: 'success' | 'error' | 'not_found';
  errorMessage?: string;
  lastUpdated: Date;
}

export interface IProcessingJob extends Document {
  jobId: string;
  userId: string;
  assignedTo?: string;
  userStatus?: 'unassigned' | 'assigned' | 'downloaded' | 'working' | 'finished';
  assignedAt?: Date;
  downloadedAt?: Date;
  workStartedAt?: Date;
  finishedAt?: Date;
  serialNumbers: string[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  totalRecords: number;
  processedRecords: number;
  fileName?: string;
  createdAt: Date;
  completedAt?: Date;
  errorMessage?: string;
  filteringStats: {
      totalFetched: Number,
      selfFiled: Number,
      hadAttorney: Number,
    },
  results?: TrademarkData[],
}