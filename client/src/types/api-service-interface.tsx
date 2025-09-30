export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message: string;
  error?: string;
}

export interface TrademarkData {
  serialNumber: string;
  markText: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
  ownerEmail: string | null;
  attorneyName: string | null;
  abandonDate: string | null;
  abandonReason: string | null;
  filingDate: string | null;
  status: "success" | "error" | "not_found";
  errorMessage?: string;
}

export interface ProcessingJob {
  id: string;
  serialNumbers: string[];
  status: "pending" | "processing" | "completed" | "failed";
  results: TrademarkData[];
  totalRecords: number;
  processedRecords: number;
  createdAt: string;
  completedAt?: string;
  errorMessage?: string;
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
  createdAt: string;
  completedAt?: string;
}

// User Management Types
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "admin" | "user";
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
}

export interface CreateUserData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: "admin" | "user";
}

export interface UsersResponse {
  users: User[];
  total: number;
  page: number;
  totalPages: number;
}

export interface UserStats {
  totalUsers: number;
  activeUsers: number;
  adminUsers: number;
  newUsersThisMonth: number;
  lastLoginActivity: string | null;
}