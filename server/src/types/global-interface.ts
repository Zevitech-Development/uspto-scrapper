import Bull from "bull";
import { INotification } from "./notification-interface";

export interface TrademarkData {
  serialNumber: string;
  ownerName: string | null;
  markText: string | null;
  ownerPhone: string | null;
  ownerEmail: string | null;
  attorneyName: string | null;
  abandonDate: string | null;
  abandonReason: string | null;
  filingDate: string | null;
  status: "success" | "error" | "not_found" | "has_attorney";
  errorMessage?: string;
}

export interface AppRequest extends Request {
  requestId?: string;
  userId?: string;
}

export interface USPTOApiResponse {
  data: string;
  status: number;
  statusText: string;
}

export interface ParsedTrademarkXML {
  "ns2:TrademarkTransaction"?: {
    $?: any;
    "ns2:TrademarkTransactionBody"?: Array<{
      "ns2:TransactionContentBag"?: Array<{
        "ns2:TransactionData"?: Array<{
          "ns2:TrademarkBag"?: Array<{
            "ns2:Trademark"?: TrademarkInfo[];
          }>;
        }>;
      }>;
    }>;
  };
}

export interface TrademarkInfo {
  "ns1:ApplicationNumber"?: Array<{
    "ns1:ApplicationNumberText"?: [string];
  }>;
  "ns2:ApplicationDate"?: [string];
  "ns2:WordMarkSpecification"?: Array<{
    "ns2:MarkVerbalElementText"?: [string];
  }>;
  "ns2:DesignSearchCodeBag"?: Array<{
    "ns2:DesignSearchCode"?: Array<{
      "ns2:SearchCode"?: [string];
    }>;
  }>;
  "ns2:ApplicantBag"?: Array<{
    "ns2:Applicant"?: ApplicantInfo[];
  }>;
  "ns2:NationalCorrespondent"?: Array<{
    "ns1:Contact"?: [ContactInfo];
  }>;
  "ns2:RecordAttorney"?: Array<{
    "ns1:Contact"?: Array<{
      "ns1:Name"?: Array<{
        "ns1:PersonName"?: Array<{
          "ns1:PersonFullName"?: [string];
        }>;
      }>;
    }>;
  }>;
  "ns2:NationalTrademarkInformation"?: Array<{
    "ns2:ApplicationAbandonedDate"?: [string];
    "ns2:MarkCurrentStatusExternalDescriptionText"?: [string];
  }>;
  "ns2:MarkRepresentation"?: Array<{
    "ns2:MarkReproduction"?: Array<{
      "ns2:WordMarkSpecification"?: Array<{
        "ns2:MarkVerbalElementText"?: [string];
      }>;
    }>;
  }>;
}

export interface ApplicantInfo {
  $?: { "ns1:sequenceNumber": string };
  "ns1:Contact"?: Array<{
    "ns1:Name"?: Array<{
      "ns1:EntityName"?: [string];
      "ns1:PersonName"?: Array<{
        "ns1:PersonFullName"?: [string];
      }>;
    }>;
  }>;
}

export interface ContactInfo {
  "ns1:Name"?: Array<{
    "ns1:PersonName"?: Array<{
      "ns1:PersonFullName"?: [string];
    }>;
    "ns1:OrganizationName"?: Array<{
      "ns1:OrganizationStandardName"?: [string];
    }>;
  }>;
  "ns1:EmailAddressBag"?: Array<{
    "ns1:EmailAddressText"?: Array<
      | string
      | {
          _: string;
          $: { "ns1:emailAddressPurposeCategory": string };
        }
    >;
  }>;
  "ns1:PhoneNumberBag"?: Array<{
    "ns1:PhoneNumber"?: [string];
  }>;
}

export interface ProcessingJob {
  id: string;
  serialNumbers: string[];
  assignedTo?: string;
  userStatus?:
    | "unassigned"
    | "assigned"
    | "downloaded"
    | "working"
    | "finished";
  assignedAt?: Date;
  downloadedAt?: Date;
  workStartedAt?: Date;
  finishedAt?: Date;
  status: "pending" | "processing" | "completed" | "failed";
  results: TrademarkData[];
  totalRecords: number;
  processedRecords: number;
  createdAt: Date;
  completedAt?: Date;
  errorMessage?: string;
  filteringStats?: {
    totalFetched: number;
    selfFiled: number;
    hadAttorney: number;
  };
  archived?: boolean;
  archivedAt?: Date;
}

export interface ProcessTrademarkRequest {
  serialNumbers: string[];
}

export interface ProcessTrademarkResponse {
  jobId: string;
  message: string;
  totalRecords: number;
}

export interface JobStatusResponse {
  jobId: string;
  status: ProcessingJob["status"];
  progress: {
    total: number;
    processed: number;
    percentage: number;
  };
  results?: TrademarkData[];
  errorMessage?: string;
}

export interface ExcelUploadRequest {
  file: File;
  serialNumberColumn?: string;
}

export interface AppConfig {
  port: number;
  mongoUri: string;
  redisUri: string;
  usptoApiKey: string;
  usptoApiBaseUrl: string;
  corsOrigins: string[];
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  usptoRateLimitPerMinute: number;
  jwtSecret: string;
  jwtExpiresIn: string;
}

export class AppError extends Error {
  constructor(
    public override message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = "AppError";

    // Only call if available (Node.js / V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message: string;
  error?: string;
}

export type LogLevel = "error" | "warn" | "info" | "debug";

export interface LogContext {
  jobId?: string | number;
  serialNumber?: string;
  userId?: string;
  action?: string;
  activeCount?: number;
  error?: string;
  url?: string;
  email?: string;
  role?: string;
  method?: string;
  status?: string | number;
  dataLength?: number;
  statusText?: string;
  timeout?: number;
  position?: number;
  errorCount?: number;
  notFoundCount?: number;
  fileName?: string;
  fileSize?: number;
  columnName?: string;
  availableColumns?: any[];
  columnIndex?: number;
  recordCount?: number;
  originalFileName?: string;
  attempts?: number;
  maxAttempts?: number;
  stalledCount?: number;
  originalJobId?: string;
  newJobId?: string;
  cleanedCount?: number;
  olderThanHours?: number;
  count?: number;
  delayed?: number;
  path?: string;
  ip?: string;
  userAgent?: string;
  statusCode?: number;
  contentLength?: string | number;
  hasApiKey?: boolean;
  keyLength?: number;
  requestId?: string;
  promise?: string;
  port?: number;
  environment?: string;
  pid?: number;
  host?: string;
  database?: string;
  isActive?: boolean;
  // Extra fields for logging
  success?: boolean;
  waitingJobs?: {
    id: Bull.JobId;
    jobId: string;
    createdAt: string;
  }[];
  newStatus?: ProcessingJob["status"];
  assignedToString?: string;
  userIdString?: string;
  assignedTo?: string;
  assignedBy?: string;
  notificationId?: string;
  type?: INotification["type"];
  recipientId?: string;
  daysOld?: number;
  activeJobs?: {
    id: Bull.JobId;
    jobId: string;
    processedOn: string | null;
  }[];
  queueExists?: boolean;
  isProcessorSetup?: boolean;
  isPaused?: boolean;
  jobCount?: number;
  waiting?: number;
  active?: number;
  completed?: number;
  failed?: number;
  processorSetup?: boolean;
  bullJobId?: string;
  state?: string;
  upserted?: number;
  adminUserId?: string;
  resultsCount?: number;
  mongoStatus?: string;
  matched?: number;
  modified?: number;
  redis?: boolean;
  paused?: boolean;
  returned?: number;
  cutoffTime?: string;
  stats?: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  };
  health?: {
    isHealthy: boolean;
    redis: { connected: boolean; error?: string };
    queue: { isPaused: boolean; error?: string };
    processors: { active: boolean; error?: string };
    stats: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
    };
  };
  selfFiled?: number;
  waitingCount?: number;
  hadAttorney?: number;
  newUserId?: string;
  newUserEmail?: string;
  targetUserId?: string;
  deletedUserId?: string;
  updatedFields?: string[];
  responseTime?: number;
  processed?: number;
  total?: number;
  filteredCount?: number;
  selfFiledOnly?: number;
  totalFetched?: number;
  selfFiledRecords?: number;
  percentage?: number;
  totalRecords?: number;
  successCount?: number;
  failureCount?: number;
  duration?: number;
  successRate?: number;
  endpoint?: string;
  remainingTime?: number;
  filename?: string;
  serialNumbers?: number;
  hasOwnerName?: boolean;
  hasAttorney?: boolean;
  isAbandoned?: boolean;
  userName?: string;
  notificationType?: INotification["type"];
}
