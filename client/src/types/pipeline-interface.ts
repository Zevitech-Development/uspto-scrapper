export interface PipelineLead {
  _id: string;
  leadId: string;

  // User submission data
  submittedBy: string;
  submittedByName: string;
  sourceJobId?: string;
  submittedDate: string;

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
  nextFollowUpDate?: string;
  lastContactedDate?: string;
  emailsSent: number;
  phoneCallsMade: number;

  // Conversion tracking
  convertedToSale: boolean;
  saleAmount?: number;
  conversionDate?: string;

  // Notes
  comments: string;
  adminNotes?: string;

  // Activity log
  activities: Array<{
    date: string;
    user: string;
    userName: string;
    action: string;
    notes: string;
  }>;

  // Metadata
  createdAt: string;
  updatedAt: string;
  archived: boolean;
}

export interface PipelineLeadCreateData {
  name: string;
  phone: string;
  email: string;
  trademarkDetails: string;
  abandonedSerialNo?: string;
  paymentPlanInterest: boolean;
  comments: string;
  sourceJobId?: string;
}

export interface PipelineStats {
  total: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  conversionRate: number;
  totalRevenue: number;
}

export interface UserPipelineStats {
  totalSubmitted: number;
  converted: number;
  conversionRate: number;
  totalRevenue: number;
}

export interface TrademarkAutoFillData {
  serialNumber: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  trademarkDetails: string | null;
  filingDate: string | null;
  abandonDate: string | null;
  abandonReason: string | null;
}
