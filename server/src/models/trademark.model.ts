import { IProcessingJob, ITrademark } from "../types/trademark-interface";
import mongoose, { Schema } from "mongoose";

const trademarkSchema = new Schema<ITrademark>(
  {
    serialNumber: { type: String, required: true, unique: true, index: true },
    ownerName: String,
    ownerPhone: String,
    markText: String,
    ownerEmail: String,
    attorneyName: String,
    abandonDate: String,
    abandonReason: String,
    filingDate: String,
    status: {
      type: String,
      enum: ["success", "error", "not_found"],
      required: true,
    },
    errorMessage: String,
    lastUpdated: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const processingJobSchema = new Schema<IProcessingJob>(
  {
    jobId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User", index: true },
    userStatus: {
      type: String,
      enum: ["unassigned", "assigned", "downloaded", "working", "finished"],
      default: "unassigned",
    },
    assignedAt: Date,
    downloadedAt: Date,
    workStartedAt: Date,
    finishedAt: Date,

    serialNumbers: [{ type: String, required: true }],
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      required: true,
    },
    totalRecords: { type: Number, required: true },
    processedRecords: { type: Number, default: 0 },
    fileName: String,
    createdAt: { type: Date, default: Date.now },
    completedAt: Date,
    errorMessage: String,
    filteringStats: {
      totalFetched: Number,
      selfFiled: Number,
      hadAttorney: Number,
    },
    results: [{
      serialNumber: String,
      ownerName: String,
      markText: String,
      ownerPhone: String,
      ownerEmail: String,
      attorneyName: String,
      abandonDate: String,
      abandonReason: String,
      filingDate: String,
      status: {
        type: String,
        enum: ["success", "error", "not_found"],
      },
      errorMessage: String,
    }],
  },
  { timestamps: true }
);

export const Trademark = mongoose.model<ITrademark>(
  "Trademark",
  trademarkSchema
);
export const ProcessingJobModel = mongoose.model<IProcessingJob>(
  "ProcessingJob",
  processingJobSchema
);
