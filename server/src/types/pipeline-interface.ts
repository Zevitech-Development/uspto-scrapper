import { Document } from "mongoose";

export interface IPipelineLead extends Document {
  leadId: string;

  // User submission data
  submittedBy: string;
  submittedByName: string;
  sourceJobId?: string;
  submittedDate: Date;

  // Lead contact info
  name: string;
  phone: string;
  email: string;

  // Trademark info
  trademarkDetails: string;
  abandonedSerialNo?: string;
  liveSerialNumber?: string;

  // Lead qualification
  status: "new" | "contacted" | "quoted" | "negotiating" | "won" | "lost";
  priority: "hot" | "warm" | "cold";
  leadScore: number;

  // Business tracking
  paymentPlanInterest: boolean;
  paymentPlanOffered?: string;
  quotedAmount?: number;

  // Team assignments
  assignedFront?: string;
  assignedAgent?: string;
  assignedSC?: string;
  assignedBrand?: string;

  // Upselling
  upseller?: string;
  upsellDetails?: string;
  upsellAmount?: number;

  // Follow-up tracking
  nextFollowUpDate?: Date;
  lastContactedDate?: Date;
  emailsSent: number;
  phoneCallsMade: number;

  // Conversion tracking
  convertedToSale: boolean;
  saleAmount?: number;
  conversionDate?: Date;

  // Notes
  comments: string;
  adminNotes?: string;

  // Activity log
  activities: Array<{
    date: Date;
    user: string;
    userName: string;
    action: string;
    notes: string;
  }>;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  archived: boolean;
}

export interface PipelineLeadCreateData {
  submittedBy: string;
  submittedByName: string;
  sourceJobId?: string;
  name: string;
  phone: string;
  email: string;
  trademarkDetails: string;
  abandonedSerialNo?: string;
  paymentPlanInterest: boolean;
  comments: string;
}

export interface PipelineLeadUpdateData {
  // Contact info
  name?: string;
  phone?: string;
  email?: string;

  // Trademark info
  trademarkDetails?: string;
  abandonedSerialNo?: string;
  liveSerialNumber?: string;

  // Lead qualification
  status?: IPipelineLead["status"];
  priority?: IPipelineLead["priority"];
  leadScore?: number;

  // Business tracking
  paymentPlanInterest?: boolean;
  paymentPlanOffered?: string;
  quotedAmount?: number;

  // Team assignments
  assignedFront?: string;
  assignedAgent?: string;
  assignedSC?: string;
  assignedBrand?: string;

  // Upselling
  upseller?: string;
  upsellDetails?: string;
  upsellAmount?: number;

  // Follow-up
  nextFollowUpDate?: Date;
  lastContactedDate?: Date;
  emailsSent?: number;
  phoneCallsMade?: number;

  // Conversion
  convertedToSale?: boolean;
  saleAmount?: number;
  conversionDate?: Date;

  // Notes
  comments?: string;
  adminNotes?: string;
}
