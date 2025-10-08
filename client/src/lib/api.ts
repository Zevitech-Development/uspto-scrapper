import {
  ApiResponse,
  JobStatusResponse,
  NotificationsResponse,
  ProcessingJob,
  TrademarkData,
  Notification,
  JobAssignment,
} from "@/types/api-service-interface";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

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
          role: "admin" | "user";
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

  static async removeJob(jobId: string) {
    const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/remove`, {
      method: "DELETE",
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

  // ========== JOB ASSIGNMENT ENDPOINTS ==========

  static async assignJobToUser(jobId: string, userId: string) {
    const response = await fetch(`${API_BASE_URL}/admin/jobs/${jobId}/assign`, {
      method: "POST",
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ userId }),
    });
    return this.handleResponse<ApiResponse>(response);
  }

  static async getJobAssignments() {
    const response = await fetch(`${API_BASE_URL}/admin/jobs/assignments`, {
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<
      ApiResponse<{ assignments: any[]; count: number }>
    >(response);
  }

  static async getMyAssignedJobs() {
    const response = await fetch(`${API_BASE_URL}/user/jobs/assigned`, {
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<
      ApiResponse<{ jobs: ProcessingJob[]; count: number }>
    >(response);
  }

  static async updateJobUserStatus(
    jobId: string,
    status: "downloaded" | "working" | "finished"
  ) {
    const response = await fetch(`${API_BASE_URL}/user/jobs/${jobId}/status`, {
      method: "PATCH",
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ status }),
    });
    return this.handleResponse<ApiResponse>(response);
  }

  // ========== NOTIFICATION ENDPOINTS ==========

  static async getNotifications(
    unreadOnly: boolean = false,
    limit: number = 50,
    skip: number = 0
  ) {
    const response = await fetch(
      `${API_BASE_URL}/notifications?unreadOnly=${unreadOnly}&limit=${limit}&skip=${skip}`,
      {
        headers: this.getAuthHeaders(),
      }
    );
    return this.handleResponse<ApiResponse<NotificationsResponse>>(response);
  }

  static async getUnreadNotificationCount() {
    const response = await fetch(`${API_BASE_URL}/notifications/unread-count`, {
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<ApiResponse<{ count: number }>>(response);
  }

  static async markNotificationAsRead(notificationId: string) {
    const response = await fetch(
      `${API_BASE_URL}/notifications/${notificationId}/read`,
      {
        method: "PATCH",
        headers: this.getAuthHeaders(),
      }
    );
    return this.handleResponse<ApiResponse>(response);
  }

  static async markAllNotificationsAsRead() {
    const response = await fetch(
      `${API_BASE_URL}/notifications/mark-all-read`,
      {
        method: "PATCH",
        headers: this.getAuthHeaders(),
      }
    );
    return this.handleResponse<ApiResponse<{ markedCount: number }>>(response);
  }

  // ========== USER TIMELINE ENDPOINTS ==========

  static async getUserTimeline(userId: string) {
    const response = await fetch(
      `${API_BASE_URL}/admin/user-timeline/${userId}`,
      {
        headers: this.getAuthHeaders(),
      }
    );
    return this.handleResponse<
      ApiResponse<{
        user: {
          id: string;
          name: string;
          email: string;
        };
        timeline: Array<{
          jobId: string;
          totalRecords: number;
          assignedAt: string;
          downloadedAt?: string;
          workStartedAt?: string;
          finishedAt?: string;
          status: string;
          downloadTime?: number;
          workDuration?: number;
          totalTime?: number;
        }>;
        stats: {
          totalJobs: number;
          completedJobs: number;
          inProgressJobs: number;
          avgCompletionTime: number;
          fastestJob: number;
        };
      }>
    >(response);
  }

  // ========== ARCHIVE ENDPOINTS ==========

  static async archiveJob(jobId: string) {
    const response = await fetch(
      `${API_BASE_URL}/admin/jobs/${jobId}/archive`,
      {
        method: "POST",
        headers: this.getAuthHeaders(),
      }
    );
    return this.handleResponse<ApiResponse>(response);
  }

  static async unarchiveJob(jobId: string) {
    const response = await fetch(
      `${API_BASE_URL}/admin/jobs/${jobId}/unarchive`,
      {
        method: "POST",
        headers: this.getAuthHeaders(),
      }
    );
    return this.handleResponse<ApiResponse>(response);
  }

  static async getArchivedJobs(): Promise<
    ApiResponse<{
      jobs: ProcessingJob[];
      count: number;
    }>
  > {
    const response = await fetch(`${API_BASE_URL}/admin/jobs/archived`, {
      headers: this.getAuthHeaders(),
    });

    return this.handleResponse<
      ApiResponse<{
        jobs: ProcessingJob[];
        count: number;
      }>
    >(response);
  }

  // ========== PIPELINE ENDPOINTS ==========

  static async createPipelineLead(data: {
    name: string;
    phone: string;
    email: string;
    trademarkDetails: string;
    abandonedSerialNo?: string;
    paymentPlanInterest: boolean;
    comments: string;
    sourceJobId?: string;
  }) {
    const response = await fetch(`${API_BASE_URL}/pipeline/leads`, {
      method: "POST",
      headers: this.getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return this.handleResponse<ApiResponse>(response);
  }

  static async getMyPipelineLeads(): Promise<
    ApiResponse<{
      leads: any[];
      total: number;
    }>
  > {
    const response = await fetch(`${API_BASE_URL}/pipeline/leads/my`, {
      headers: this.getAuthHeaders(),
    });

    return this.handleResponse<
      ApiResponse<{
        leads: any[];
        total: number;
      }>
    >(response);
  }

  static async getMyPipelineStats(): Promise<
    ApiResponse<{
      totalSubmitted: number;
      converted: number;
      conversionRate: number;
      totalRevenue: number;
    }>
  > {
    const response = await fetch(`${API_BASE_URL}/pipeline/stats/my`, {
      headers: this.getAuthHeaders(),
    });

    return this.handleResponse<
      ApiResponse<{
        totalSubmitted: number;
        converted: number;
        conversionRate: number;
        totalRevenue: number;
      }>
    >(response);
  }

  static async getTrademarkBySerial(serialNumber: string) {
    const response = await fetch(
      `${API_BASE_URL}/pipeline/trademark/${serialNumber}`,
      {
        headers: this.getAuthHeaders(),
      }
    );
    return this.handleResponse<ApiResponse>(response);
  }

  // Admin endpoints
  static async getAllPipelineLeads(params?: {
    status?: string;
    priority?: string;
    archived?: boolean;
  }): Promise<
    ApiResponse<{
      leads: any[];
      total: number;
    }>
  > {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.append("status", params.status);
    if (params?.priority) queryParams.append("priority", params.priority);
    if (params?.archived !== undefined)
      queryParams.append("archived", params.archived.toString());

    const response = await fetch(
      `${API_BASE_URL}/pipeline/admin/leads?${queryParams}`,
      {
        headers: this.getAuthHeaders(),
      }
    );

    return this.handleResponse<
      ApiResponse<{
        leads: any[];
        total: number;
      }>
    >(response);
  }

  static async updatePipelineLead(leadId: string, data: any) {
    const response = await fetch(
      `${API_BASE_URL}/pipeline/admin/leads/${leadId}`,
      {
        method: "PUT",
        headers: this.getAuthHeaders(),
        body: JSON.stringify(data),
      }
    );
    return this.handleResponse<ApiResponse>(response);
  }

  static async deletePipelineLead(leadId: string) {
    const response = await fetch(
      `${API_BASE_URL}/pipeline/admin/leads/${leadId}`,
      {
        method: "DELETE",
        headers: this.getAuthHeaders(),
      }
    );
    return this.handleResponse<ApiResponse>(response);
  }

  static async archivePipelineLead(leadId: string) {
    const response = await fetch(
      `${API_BASE_URL}/pipeline/admin/leads/${leadId}/archive`,
      {
        method: "POST",
        headers: this.getAuthHeaders(),
      }
    );
    return this.handleResponse<ApiResponse>(response);
  }

  static async getPipelineStats(): Promise<
    ApiResponse<{
      total: number;
      byStatus: Record<string, number>;
      byPriority: Record<string, number>;
      conversionRate: number;
      totalRevenue: number;
    }>
  > {
    const response = await fetch(`${API_BASE_URL}/pipeline/admin/stats`, {
      headers: this.getAuthHeaders(),
    });

    return this.handleResponse<
      ApiResponse<{
        total: number;
        byStatus: Record<string, number>;
        byPriority: Record<string, number>;
        conversionRate: number;
        totalRevenue: number;
      }>
    >(response);
  }
}

export default ApiService;

export type {
  TrademarkData,
  ProcessingJob,
  JobStatusResponse,
  Notification,
  NotificationsResponse,
  JobAssignment,
};
