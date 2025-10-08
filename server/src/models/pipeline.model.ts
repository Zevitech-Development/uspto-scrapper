import mongoose, { Schema } from "mongoose";
import { IPipelineLead } from "../types/pipeline-interface";

const pipelineLeadSchema = new Schema<IPipelineLead>(
  {
    leadId: { type: String, required: true, unique: true, index: true },

    // User submission data
    submittedBy: { type: String, required: true, index: true },
    submittedByName: { type: String, required: true },
    sourceJobId: { type: String, index: true },
    submittedDate: { type: Date, default: Date.now },

    // Lead contact info
    name: { type: String, required: true, index: true },
    phone: { type: String, required: true },
    email: { type: String, required: true, index: true },

    // Trademark info
    trademarkDetails: { type: String, required: true },
    abandonedSerialNo: { type: String, index: true },
    liveSerialNumber: String,

    // Lead qualification
    status: {
      type: String,
      enum: ["new", "contacted", "quoted", "negotiating", "won", "lost"],
      default: "new",
      index: true,
    },
    priority: {
      type: String,
      enum: ["hot", "warm", "cold"],
      default: "warm",
      index: true,
    },
    leadScore: { type: Number, default: 5, min: 1, max: 10 },

    // Business tracking
    paymentPlanInterest: { type: Boolean, required: true },
    paymentPlanOffered: String,
    quotedAmount: Number,

    // Team assignments
    assignedFront: String,
    assignedAgent: String,
    assignedSC: String,
    assignedBrand: String,

    // Upselling
    upseller: String,
    upsellDetails: String,
    upsellAmount: Number,

    // Follow-up tracking
    nextFollowUpDate: Date,
    lastContactedDate: Date,
    emailsSent: { type: Number, default: 0 },
    phoneCallsMade: { type: Number, default: 0 },

    // Conversion tracking
    convertedToSale: { type: Boolean, default: false },
    saleAmount: Number,
    conversionDate: Date,

    // Notes
    comments: { type: String, required: true },
    adminNotes: String,

    // Activity log
    activities: [
      {
        date: { type: Date, default: Date.now },
        user: { type: String, required: true },
        userName: { type: String, required: true },
        action: { type: String, required: true },
        notes: String,
      },
    ],

    // Metadata
    archived: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

// Compound indexes for efficient queries
pipelineLeadSchema.index({ status: 1, archived: 1 });
pipelineLeadSchema.index({ submittedBy: 1, createdAt: -1 });
pipelineLeadSchema.index({ email: 1, phone: 1 });

export const PipelineLead = mongoose.model<IPipelineLead>(
  "PipelineLead",
  pipelineLeadSchema
);
