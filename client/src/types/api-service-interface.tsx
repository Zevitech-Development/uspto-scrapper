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

  assignedTo?: string;
  userStatus?:
    | "unassigned"
    | "assigned"
    | "downloaded"
    | "working"
    | "finished";
  assignedAt?: string;
  downloadedAt?: string;
  workStartedAt?: string;
  finishedAt?: string;
}

export interface Notification {
  _id: string;
  recipientId: string;
  senderId: string;
  jobId: string;
  type: "job_assigned" | "job_downloaded" | "job_working" | "job_finished";
  message: string;
  read: boolean;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: Notification[];
  total: number;
  unreadCount: number;
}

export interface JobAssignment {
  jobId: string;
  assignedTo: string;
  assignedUser: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  userStatus: string;
  totalRecords: number;
  processedRecords: number;
  status: string;
  assignedAt: string;
  downloadedAt?: string;
  workStartedAt?: string;
  finishedAt?: string;
  createdAt: string;
  completedAt?: string;
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
