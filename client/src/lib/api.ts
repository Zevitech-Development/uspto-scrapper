const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message: string;
  error?: string;
}

interface TrademarkData {
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

interface ProcessingJob {
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

interface JobStatusResponse {
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

class ApiService {
  private static getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem("auth_token");
    return {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    };
  }

  private static async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.message || `HTTP ${response.status}: ${response.statusText}`
      );
    }
    return response.json();
  }

  // Authentication endpoints
  static async login(credentials: { email: string; password: string }) {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
    });
    return this.handleResponse<
      ApiResponse<{
        user: {
          id: string;
          email: string;
          firstName: string;
          lastName: string;
          role: string;
          lastLogin?: string;
        };
        token: string;
        expiresIn: string;
      }>
    >(response);
  }

  static async validateToken() {
    const response = await fetch(`${API_BASE_URL}/auth/validate`, {
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<
      ApiResponse<{
        valid: boolean;
        user: {
          id: string;
          email: string;
          firstName: string;
          lastName: string;
          role: string;
        };
      }>
    >(response);
  }

  static async logout() {
    const response = await fetch(`${API_BASE_URL}/auth/logout`, {
      method: "POST",
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<ApiResponse>(response);
  }

  static async getUserProfile() {
    const response = await fetch(`${API_BASE_URL}/auth/profile`, {
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<ApiResponse>(response);
  }

  static async updateProfile(data: {
    firstName?: string;
    lastName?: string;
    email?: string;
  }) {
    const response = await fetch(`${API_BASE_URL}/auth/profile`, {
      method: "PUT",
      headers: this.getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return this.handleResponse<ApiResponse>(response);
  }

  static async changePassword(data: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) {
    const response = await fetch(`${API_BASE_URL}/auth/change-password`, {
      method: "POST",
      headers: this.getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return this.handleResponse<ApiResponse>(response);
  }

  // Admin user management endpoints
  static async getAllUsers(page: number = 1, limit: number = 20) {
    const response = await fetch(
      `${API_BASE_URL}/auth/admin/users?page=${page}&limit=${limit}`,
      {
        headers: this.getAuthHeaders(),
      }
    );
    return this.handleResponse<
      ApiResponse<{
        users: Array<{
          id: string;
          email: string;
          firstName: string;
          lastName: string;
          role: string;
          isActive: boolean;
          createdAt: string;
        }>;
        total: number;
        page: number;
        totalPages: number;
      }>
    >(response);
  }

  static async createUser(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: "admin" | "user";
  }) {
    const response = await fetch(`${API_BASE_URL}/auth/admin/users`, {
      method: "POST",
      headers: this.getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return this.handleResponse<ApiResponse>(response);
  }

  static async updateUserStatus(userId: string, isActive: boolean) {
    const response = await fetch(
      `${API_BASE_URL}/auth/admin/users/${userId}/status`,
      {
        method: "PUT",
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ isActive }),
      }
    );
    return this.handleResponse<ApiResponse>(response);
  }

  static async deleteUser(userId: string) {
    const response = await fetch(`${API_BASE_URL}/auth/admin/users/${userId}`, {
      method: "DELETE",
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<ApiResponse>(response);
  }

  static async getUserStats() {
    const response = await fetch(`${API_BASE_URL}/auth/admin/stats`, {
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<
      ApiResponse<{
        totalUsers: number;
        activeUsers: number;
        adminUsers: number;
        newUsersThisMonth: number;
        lastLoginActivity: string | null;
      }>
    >(response);
  }

  // Trademark processing endpoints
  static async uploadFile(file: File, columnName?: string) {
    const formData = new FormData();
    formData.append("file", file);
    if (columnName) {
      formData.append("columnName", columnName);
    }

    const token = localStorage.getItem("auth_token");
    const response = await fetch(`${API_BASE_URL}/upload`, {
      method: "POST",
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: formData,
    });
    return this.handleResponse<
      ApiResponse<{
        jobId: string;
        totalRecords: number;
        validSerialNumbers: number;
        invalidSerialNumbers: string[];
        fileName: string;
      }>
    >(response);
  }

  static async processSerialNumbers(serialNumbers: string[]) {
    const response = await fetch(`${API_BASE_URL}/process`, {
      method: "POST",
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ serialNumbers }),
    });
    return this.handleResponse<
      ApiResponse<{
        jobId: string;
        totalRecords: number;
      }>
    >(response);
  }

  static async getJobStatus(jobId: string) {
    const response = await fetch(`${API_BASE_URL}/jobs/${jobId}`, {
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<ApiResponse<JobStatusResponse>>(response);
  }

  static async getJobDetails(jobId: string) {
    const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/details`, {
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<ApiResponse>(response);
  }

  static async cancelJob(jobId: string) {
    const response = await fetch(`${API_BASE_URL}/jobs/${jobId}`, {
      method: "DELETE",
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<ApiResponse>(response);
  }

  static async retryJob(jobId: string) {
    const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/retry`, {
      method: "POST",
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<ApiResponse>(response);
  }

  static async downloadResults(jobId: string) {
    const token = localStorage.getItem("auth_token");
    const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/download`, {
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || "Download failed");
    }

    return response.blob();
  }

  static async getJobsByStatus(status: string) {
    const response = await fetch(`${API_BASE_URL}/jobs/status/${status}`, {
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<
      ApiResponse<{
        jobs: ProcessingJob[];
        count: number;
      }>
    >(response);
  }

  static async getQueueStats() {
    const response = await fetch(`${API_BASE_URL}/queue/stats`, {
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<
      ApiResponse<{
        queue: {
          waiting: number;
          active: number;
          completed: number;
          failed: number;
          delayed: number;
        };
        processing: {
          rateLimitPerMinute: number;
          estimatedTimeFor100Records: string;
          currentQueueLength: number;
        };
        timestamp: string;
      }>
    >(response);
  }

  static async getSingleTrademark(serialNumber: string) {
    const response = await fetch(`${API_BASE_URL}/trademark/${serialNumber}`, {
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<ApiResponse<TrademarkData>>(response);
  }

  static async getHealthStatus() {
    const response = await fetch(`${API_BASE_URL}/health`);
    return this.handleResponse<{
      status: string;
      timestamp: string;
      services: {
        queue: { status: string; details: any };
        uspto: { status: string; message: string };
      };
    }>(response);
  }
}

export default ApiService;
export type { TrademarkData, ProcessingJob, JobStatusResponse };
