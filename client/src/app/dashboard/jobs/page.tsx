"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  Clock,
  CheckCircle,
  AlertCircle,
  Download,
  Eye,
  RotateCcw,
  X,
  Play,
  FileText,
  Calendar,
  Loader2,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import ApiService, { ProcessingJob } from "@/lib/api";
import { cn } from "@/lib/utils";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { User } from "@/types/api-service-interface";
import toast, { Toaster } from "react-hot-toast";

interface JobsState {
  jobs: ProcessingJob[];
  loading: boolean;
  error: string | null;
  selectedStatus: "all" | "pending" | "processing" | "completed" | "failed";
  highlightedJobId?: string;
}

export default function JobsPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const highlightedJobId = searchParams?.get("highlight");

  const [state, setState] = useState<JobsState>({
    jobs: [],
    loading: true,
    error: null,
    selectedStatus: "all",
    highlightedJobId: highlightedJobId || undefined,
  });

  const [pollingJobs, setPollingJobs] = useState<Set<string>>(new Set());

  const [users, setUsers] = useState<User[]>([]);
  const [assigningJobId, setAssigningJobId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  useEffect(() => {
    if (pollingJobs.size === 0) return;

    let pollCount = 0;
    let isCancelled = false;
    let timeoutId: NodeJS.Timeout | null = null;

    const poll = async () => {
      if (isCancelled) return;

      pollCount++;

      const baseInterval =
        pollCount < 10
          ? 3000
          : pollCount < 20
          ? 5000
          : pollCount < 40
          ? 15000
          : 60000;

      const jobsToUpdate = Array.from(pollingJobs).slice(0, 5);

      if (jobsToUpdate.length === 0) {
        timeoutId = setTimeout(poll, baseInterval);
        return;
      }

      try {
        const statuses = await Promise.all(
          jobsToUpdate.map((jobId) =>
            ApiService.getJobStatus(jobId).catch((err) => {
              console.error(`Failed to poll job ${jobId}:`, err);
              return null;
            })
          )
        );

        const validStatuses = statuses.filter((status) => status !== null);

        if (validStatuses.length > 0) {
          setState((prev) => {
            const updatedJobs = prev.jobs.map((job) => {
              const statusUpdate = validStatuses.find(
                (status) => status?.data?.jobId === job.id
              );

              if (statusUpdate?.data) {
                const jobData = statusUpdate.data;

                const updatedJob: ProcessingJob = {
                  ...job,
                  id: jobData.jobId,
                  status: jobData.status,
                  totalRecords: jobData.progress.total,
                  processedRecords: jobData.progress.processed,
                  percentage: jobData.progress.percentage,
                  results: jobData.results || job.results,
                  createdAt: jobData.createdAt,
                  completedAt: jobData.completedAt,
                  errorMessage: jobData.errorMessage,
                  filteringStats: jobData.filteringStats || job.filteringStats,
                };

                if (job.status !== updatedJob.status) {
                  console.log(
                    `Job ${job.id} status changed: ${job.status} → ${updatedJob.status}`
                  );
                }

                // Log percentage changes specifically
                if (job.percentage !== updatedJob.percentage) {
                  console.log(
                    `📊 Job ${job.id} percentage changed: ${job.percentage}% → ${updatedJob.percentage}%`
                  );
                }

                return updatedJob;
              }
              return job;
            });

            return {
              ...prev,
              jobs: updatedJobs,
            };
          });
        }
      } catch (error) {
        console.error("Batch polling failed:", error);
      }

      if (!isCancelled) {
        timeoutId = setTimeout(poll, baseInterval);
      }
    };

    poll();

    return () => {
      isCancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };
  }, [pollingJobs]);

  useEffect(() => {
    const activeJobs = state.jobs
      .filter((job) => job.status === "pending" || job.status === "processing")
      .map((job) => job.id);

    const currentPollingIds = Array.from(pollingJobs).sort().join(",");
    const newPollingIds = activeJobs.sort().join(",");

    if (currentPollingIds !== newPollingIds) {
      if (activeJobs.length > 0) {
        console.log(
          `Updating polling set: ${activeJobs.length} active jobs`,
          activeJobs
        );
        setPollingJobs(new Set(activeJobs));
      } else if (pollingJobs.size > 0) {
        console.log("Clearing polling set: no active jobs");
        setPollingJobs(new Set());
      }
    }
  }, [state.jobs, pollingJobs]);

  const fetchJobs = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      let allJobs: ProcessingJob[] = [];

      // Backend now handles role-based filtering automatically
      if (state.selectedStatus === "all") {
        // For "all" status, fetch all statuses and combine
        const [completed, processing, failed, pending] = await Promise.all([
          ApiService.getJobsByStatus("completed"),
          ApiService.getJobsByStatus("processing"),
          ApiService.getJobsByStatus("failed"),
          ApiService.getJobsByStatus("pending"),
        ]);

        allJobs = [
          ...(pending.data?.jobs || []),
          ...(processing.data?.jobs || []),
          ...(completed.data?.jobs || []),
          ...(failed.data?.jobs || []),
        ];

        const activeJobIds = [
          ...(pending.data?.jobs?.map((job) => job.id) || []),
          ...(processing.data?.jobs?.map((job) => job.id) || []),
        ];
        setPollingJobs(new Set(activeJobIds));
      } else {
        // For specific status, fetch jobs with that status
        const response = await ApiService.getJobsByStatus(state.selectedStatus);
        allJobs = response.data?.jobs || [];

        if (
          state.selectedStatus === "processing" ||
          state.selectedStatus === "pending"
        ) {
          setPollingJobs(new Set(allJobs.map((job) => job.id)));
        } else {
          setPollingJobs(new Set());
        }
      }

      allJobs.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      setState((prev) => ({
        ...prev,
        jobs: allJobs,
        loading: false,
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Failed to fetch jobs",
        loading: false,
      }));
    }
  }, [state.selectedStatus]);

  useEffect(() => {
    fetchJobs();
  }, [state.selectedStatus, fetchJobs]);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await ApiService.getAllUsers(1, 100);
      if (response.success && response.data) {
        setUsers(
          response.data.users.filter(
            (u: User) => u.role === "user" && u.isActive
          )
        );
      }
    } catch (error) {
      console.error("Failed to fetch users:", error);
    }
  };

  const handleAssignClick = async (jobId: string) => {
    setAssigningJobId(jobId);
    await fetchUsers();
  };

  const getUserName = (userId: string): string => {
    const user = users.find((u) => u.id === userId);
    if (user) {
      return `${user.firstName} ${user.lastName}`;
    }
    return "Unknown User";
  };

  const handleAssignJob = async () => {
    if (!assigningJobId || !selectedUserId) {
      toast.error("Please select a user");
      return;
    }

    try {
      const response = await ApiService.assignJobToUser(
        assigningJobId,
        selectedUserId
      );

      if (response.success) {
        const selectedUser = users.find((u) => u.id === selectedUserId);

        // Update state immediately
        setState((prev) => ({
          ...prev,
          jobs: prev.jobs.map((job) =>
            job.id === assigningJobId
              ? {
                  ...job,
                  assignedTo: selectedUserId,
                  userStatus: "assigned" as const,
                  assignedAt: new Date().toISOString(),
                }
              : job
          ),
        }));

        // Show success toast
        toast.success(
          `Job assigned to ${selectedUser?.firstName} ${selectedUser?.lastName}!`,
          { duration: 4000 }
        );

        // Close the assignment UI
        setAssigningJobId(null);
        setSelectedUserId("");
      }
    } catch (error) {
      console.error("Assignment failed:", error);
      toast.error("Failed to assign job. Please try again.");
    }
  };

  const getStatusBadge = (status: string) => {
    const baseClasses =
      "px-3 py-1 text-xs font-medium rounded-full flex items-center space-x-1";
    switch (status) {
      case "completed":
        return (
          <span className={`${baseClasses} bg-green-100 text-green-800`}>
            <CheckCircle className="w-3 h-3" />
            <span>Completed</span>
          </span>
        );
      case "processing":
        return (
          <span className={`${baseClasses} bg-blue-100 text-blue-800`}>
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Processing</span>
          </span>
        );
      case "failed":
        return (
          <span className={`${baseClasses} bg-red-100 text-red-800`}>
            <AlertCircle className="w-3 h-3" />
            <span>Failed</span>
          </span>
        );
      case "pending":
        return (
          <span className={`${baseClasses} bg-yellow-100 text-yellow-800`}>
            <Clock className="w-3 h-3" />
            <span>Pending</span>
          </span>
        );
      default:
        return (
          <span className={`${baseClasses} bg-gray-100 text-gray-800`}>
            <span>{status}</span>
          </span>
        );
    }
  };

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(dateString));
  };

  const handleDownload = async (jobId: string) => {
    try {
      const currentJob = state.jobs.find((j) => j.id === jobId);

      // For users, call the status update API which will:
      // 1. Update status to "downloaded"
      // 2. Create notification for admin
      // 3. Trigger the download
      if (user?.role === "user" && currentJob?.assignedTo === user.id) {
        // Only update if not already downloaded
        if (
          currentJob.userStatus !== "downloaded" &&
          currentJob.userStatus !== "working" &&
          currentJob.userStatus !== "finished"
        ) {
          await ApiService.updateJobUserStatus(jobId, "downloaded");

          // Update local state
          setState((prev) => ({
            ...prev,
            jobs: prev.jobs.map((job) =>
              job.id === jobId
                ? { ...job, userStatus: "downloaded" as const }
                : job
            ),
          }));
        }
      }

      // Download the file
      const blob = await ApiService.downloadResults(jobId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `trademark_results_${jobId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success("File downloaded successfully!");
    } catch (error) {
      console.error("Download failed:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Download failed";
      toast.error(`Download failed: ${errorMessage}`);
    }
  };

  const handleCancelJob = async (jobId: string) => {
    try {
      await ApiService.cancelJob(jobId);
      await fetchJobs();
    } catch (error) {
      console.error("Cancel failed:", error);
      toast.error("Failed to cancel job. Please try again.");
    }
  };

  const handleRetryJob = async (jobId: string) => {
    try {
      await ApiService.retryJob(jobId);
      await fetchJobs();
    } catch (error) {
      console.error("Retry failed:", error);
      toast.error("Failed to retry job. Please try again.");
    }
  };

  const handleRemoveJob = async (jobId: string) => {
    if (
      !confirm(
        "Are you sure you want to remove this job? This action cannot be undone."
      )
    ) {
      return;
    }

    try {
      const response = await ApiService.removeJob(jobId);

      if (response.success) {
        // Remove job from local state immediately
        setState((prev) => ({
          ...prev,
          jobs: prev.jobs.filter((job) => job.id !== jobId),
        }));

        toast.success("Job removed successfully!");
      }
    } catch (error) {
      console.error("Remove failed:", error);
      toast.error("Failed to remove job. Please try again.");
    }
  };

  const handleUpdateStatus = async (
    jobId: string,
    status: "working" | "finished"
  ) => {
    try {
      const response = await ApiService.updateJobUserStatus(jobId, status);

      if (response.success) {
        setState((prev) => ({
          ...prev,
          jobs: prev.jobs.map((job) =>
            job.id === jobId ? { ...job, userStatus: status } : job
          ),
        }));

        toast.success(`Job marked as ${status}!`);
        await fetchJobs();
      }
    } catch (error) {
      console.error("Failed to update status:", error);
      toast.error("Failed to update status. Please try again.");
    }
  };

  const statusFilters = [
    { key: "all", label: "All Jobs", count: state.jobs.length },
    {
      key: "pending",
      label: "Pending",
      count: state.jobs.filter((j) => j.status === "pending").length,
    },
    {
      key: "processing",
      label: "Processing",
      count: state.jobs.filter((j) => j.status === "processing").length,
    },
    {
      key: "completed",
      label: "Completed",
      count: state.jobs.filter((j) => j.status === "completed").length,
    },
    {
      key: "failed",
      label: "Failed",
      count: state.jobs.filter((j) => j.status === "failed").length,
    },
  ];

  if (!user) {
    return null;
  }

  return (
    <DashboardLayout title={user.role === "admin" ? "All Jobs" : "My Jobs"}>
      <Toaster position="top-right" />
      <div className="space-y-6">
        <div className="bg-white rounded-lg border border-gray-200 p-1">
          <div className="flex flex-wrap gap-1">
            {statusFilters.map((filter) => (
              <button
                key={filter.key}
                onClick={() =>
                  setState((prev) => ({
                    ...prev,
                    selectedStatus: filter.key as any,
                  }))
                }
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-md transition-colors",
                  state.selectedStatus === filter.key
                    ? "bg-blue-100 text-blue-700"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                )}
              >
                {filter.label}
                {filter.count > 0 && (
                  <span className="ml-2 bg-gray-200 text-gray-600 text-xs px-2 py-0.5 rounded-full">
                    {filter.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {state.loading ? (
            <div className="p-8 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
              <p className="text-gray-500">Loading jobs...</p>
            </div>
          ) : state.error ? (
            <div className="p-8 text-center">
              <AlertCircle className="w-8 h-8 text-red-600 mx-auto mb-4" />
              <p className="text-red-600 mb-4">{state.error}</p>
              <button
                onClick={fetchJobs}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Retry
              </button>
            </div>
          ) : state.jobs.length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 mb-2">No jobs found</p>
              <p className="text-sm text-gray-400">
                Upload a file to get started!
              </p>
            </div>
          ) : (
            <>
              {user.role === "admin" ? (
                // ADMIN TABLE VIEW
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Job ID
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Created Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Records
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Filtering
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Completed Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Assigned To
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          User Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {state.jobs.map((job) => (
                        <tr
                          key={job.id}
                          className={cn(
                            "hover:bg-gray-50 transition-colors",
                            state.highlightedJobId === job.id && "bg-blue-50"
                          )}
                        >
                          {/* Job ID */}
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            #{job.id.slice(0, 8)}
                          </td>

                          {/* Created Date */}
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatDate(job.createdAt)}
                          </td>

                          {/* Records Count with Progress */}
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">
                                  {job.processedRecords || 0} /{" "}
                                  {job.totalRecords}
                                </span>
                                {(job.status === "processing" ||
                                  job.status === "pending") &&
                                  job.percentage !== undefined && (
                                    <span className="text-xs text-blue-600 font-medium">
                                      {job.percentage}%
                                    </span>
                                  )}
                              </div>
                              {(job.status === "processing" ||
                                job.status === "pending") &&
                                job.percentage !== undefined && (
                                  <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div
                                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                      style={{ width: `${job.percentage}%` }}
                                    ></div>
                                  </div>
                                )}
                              {job.status === "completed" && (
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                  <div className="bg-green-600 h-2 rounded-full w-full"></div>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {job.status === "completed" && job.results ? (
                              <div className="space-y-1">
                                <div className="flex items-center space-x-2">
                                  <span className="text-green-600 font-medium">
                                    {job.results.length}
                                  </span>
                                  <span className="text-gray-400">
                                    downloadable
                                  </span>
                                </div>
                                {job.filteringStats && job.filteringStats.hadAttorney > 0 && (
                                  <div className="flex items-center space-x-2">
                                    <span className="text-orange-600 font-medium">
                                      {job.filteringStats.hadAttorney}
                                    </span>
                                    <span className="text-gray-400">
                                      filtered
                                    </span>
                                  </div>
                                )}
                              </div>
                            ) : job.filteringStats ? (
                              <div className="space-y-1">
                                <div className="flex items-center space-x-2">
                                  <span className="text-blue-600 font-medium">
                                    {job.filteringStats.selfFiled}
                                  </span>
                                  <span className="text-gray-400">
                                    processing
                                  </span>
                                </div>
                                {job.filteringStats.hadAttorney > 0 && (
                                  <div className="flex items-center space-x-2">
                                    <span className="text-orange-600 font-medium">
                                      {job.filteringStats.hadAttorney}
                                    </span>
                                    <span className="text-gray-400">
                                      filtered
                                    </span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>

                          {/* Completed Date */}
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {job.completedAt
                              ? formatDate(job.completedAt)
                              : "-"}
                          </td>

                          {/* Status Badge */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            {getStatusBadge(job.status)}
                          </td>

                          {/* Assigned To Dropdown */}
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {job.status === "completed" ? (
                              assigningJobId === job.id ? (
                                <div className="flex items-center space-x-2">
                                  <select
                                    value={selectedUserId}
                                    onChange={(e) =>
                                      setSelectedUserId(e.target.value)
                                    }
                                    className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  >
                                    <option value="">Select user...</option>
                                    {users.map((u) => (
                                      <option key={u.id} value={u.id}>
                                        {u.firstName} {u.lastName}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    onClick={handleAssignJob}
                                    disabled={!selectedUserId}
                                    className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:bg-gray-400"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => {
                                      setAssigningJobId(null);
                                      setSelectedUserId("");
                                    }}
                                    className="px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : job.assignedTo ? (
                                <button
                                  onClick={() => handleAssignClick(job.id)}
                                  className="text-blue-600 hover:text-blue-800 font-medium"
                                >
                                  {getUserName(job.assignedTo)}
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleAssignClick(job.id)}
                                  className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                                >
                                  Assign
                                </button>
                              )
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>

                          {/* User Status */}
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {job.userStatus ? (
                              <span
                                className={cn(
                                  "px-2 py-1 rounded-full text-xs font-medium",
                                  job.userStatus === "assigned" &&
                                    "bg-yellow-100 text-yellow-800",
                                  job.userStatus === "downloaded" &&
                                    "bg-blue-100 text-blue-800",
                                  job.userStatus === "working" &&
                                    "bg-orange-100 text-orange-800",
                                  job.userStatus === "finished" &&
                                    "bg-green-100 text-green-800"
                                )}
                              >
                                {job.userStatus.charAt(0).toUpperCase() +
                                  job.userStatus.slice(1)}
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <div className="flex items-center space-x-2">
                              {job.status === "completed" && (
                                <>
                                  <button
                                    onClick={() => handleDownload(job.id)}
                                    className="p-2 text-green-600 hover:text-green-700 rounded-full hover:bg-green-50"
                                    title="Download Results"
                                  >
                                    <Download className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleRemoveJob(job.id)}
                                    className="p-2 text-red-600 hover:text-red-700 rounded-full hover:bg-red-50"
                                    title="Remove Job"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                              {job.status === "failed" && (
                                <button
                                  onClick={() => handleRetryJob(job.id)}
                                  className="p-2 text-blue-600 hover:text-blue-700 rounded-full hover:bg-blue-50"
                                  title="Retry Job"
                                >
                                  <RotateCcw className="w-4 h-4" />
                                </button>
                              )}
                              {(job.status === "pending" ||
                                job.status === "processing") && (
                                <button
                                  onClick={() => handleCancelJob(job.id)}
                                  className="p-2 text-red-600 hover:text-red-700 rounded-full hover:bg-red-50"
                                  title="Cancel Job"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                // USER TABLE VIEW
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Job ID
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Created Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Assigned At
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Records
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {state.jobs.map((job) => (
                        <tr
                          key={job.id}
                          className="hover:bg-gray-50 transition-colors"
                        >
                          {/* Job ID */}
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            #{job.id.slice(0, 8)}
                          </td>

                          {/* Created Date */}
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatDate(job.createdAt)}
                          </td>

                          {/* Assigned At */}
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {job.assignedAt ? formatDate(job.assignedAt) : "-"}
                          </td>

                          {/* Records with Progress */}
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">
                                  {job.processedRecords || 0} /{" "}
                                  {job.totalRecords}
                                </span>
                                {(job.status === "processing" ||
                                  job.status === "pending") &&
                                  job.percentage !== undefined && (
                                    <span className="text-xs text-blue-600 font-medium">
                                      {job.percentage}%
                                    </span>
                                  )}
                              </div>
                              {(job.status === "processing" ||
                                job.status === "pending") &&
                                job.percentage !== undefined && (
                                  <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div
                                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                      style={{ width: `${job.percentage}%` }}
                                    ></div>
                                  </div>
                                )}
                              {job.status === "completed" && (
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                  <div className="bg-green-600 h-2 rounded-full w-full"></div>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {job.status === "completed" && job.results ? (
                              <div className="text-xs">
                                <div className="text-green-600 font-medium">
                                  {job.results.length} downloadable
                                </div>
                                {job.filteringStats && job.filteringStats.hadAttorney > 0 && (
                                  <div className="text-gray-500">
                                    {job.filteringStats.hadAttorney} filtered
                                  </div>
                                )}
                              </div>
                            ) : job.filteringStats ? (
                              <div className="text-xs">
                                <div className="text-blue-600 font-medium">
                                  {job.filteringStats.selfFiled} processing
                                </div>
                                {job.filteringStats.hadAttorney > 0 && (
                                  <div className="text-gray-500">
                                    {job.filteringStats.hadAttorney} filtered
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            {getStatusBadge(job.status)}
                          </td>
                          {/* Actions - Three Buttons */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            {job.status === "completed" ? (
                              <div className="flex items-center space-x-2">
                                {/* Download Button - Only disable after downloaded */}
                                <button
                                  onClick={() => handleDownload(job.id)}
                                  disabled={
                                    job.userStatus === "downloaded" ||
                                    job.userStatus === "working" ||
                                    job.userStatus === "finished"
                                  }
                                  className={cn(
                                    "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                                    job.userStatus === "downloaded" ||
                                      job.userStatus === "working" ||
                                      job.userStatus === "finished"
                                      ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                                      : "bg-blue-600 text-white hover:bg-blue-700"
                                  )}
                                >
                                  {job.userStatus === "downloaded" ||
                                  job.userStatus === "working" ||
                                  job.userStatus === "finished"
                                    ? "✓ Downloaded"
                                    : "Download"}
                                </button>

                                {/* Start Work Button - Enable only after downloaded */}
                                <button
                                  onClick={() =>
                                    handleUpdateStatus(job.id, "working")
                                  }
                                  disabled={job.userStatus !== "downloaded"}
                                  className={cn(
                                    "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                                    job.userStatus === "downloaded"
                                      ? "bg-orange-600 text-white hover:bg-orange-700"
                                      : "bg-gray-200 text-gray-500 cursor-not-allowed"
                                  )}
                                >
                                  {job.userStatus === "working" ||
                                  job.userStatus === "finished"
                                    ? "✓ Started"
                                    : "Start Work"}
                                </button>

                                {/* Finish Button - Enable only when working */}
                                <button
                                  onClick={() =>
                                    handleUpdateStatus(job.id, "finished")
                                  }
                                  disabled={job.userStatus !== "working"}
                                  className={cn(
                                    "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                                    job.userStatus === "working"
                                      ? "bg-green-600 text-white hover:bg-green-700"
                                      : "bg-gray-200 text-gray-500 cursor-not-allowed"
                                  )}
                                >
                                  {job.userStatus === "finished"
                                    ? "✓ Finished"
                                    : "Finish"}
                                </button>
                              </div>
                            ) : (
                              <span className="text-sm text-gray-400">
                                Pending completion
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
