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
  User,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import ApiService, { ProcessingJob } from "@/lib/api";
import { cn } from "@/lib/utils";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";

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

  // OPTIMIZE: Reduce polling frequency and use smart intervals
  useEffect(() => {
    if (pollingJobs.size === 0) return;

    // Use different intervals based on job status
    const getPollingInterval = () => {
      const hasProcessingJobs = Array.from(pollingJobs).some((jobId) => {
        const job = state.jobs.find((j) => j.id === jobId);
        return job?.status === "processing";
      });

      // 30 seconds for processing jobs, 60 seconds for pending
      return hasProcessingJobs ? 30000 : 60000;
    };

    const interval = setInterval(async () => {
      // Process jobs in batches to reduce API calls
      const jobsToUpdate = Array.from(pollingJobs).slice(0, 5); // Max 5 at a time

      for (const jobId of jobsToUpdate) {
        try {
          const response = await ApiService.getJobStatus(jobId);
          if (response.success) {
            setState((prev) => ({
              ...prev,
              jobs: prev.jobs.map((job) =>
                job.id === jobId
                  ? {
                      ...job,
                      status: response.data?.status || job.status,
                      processedRecords:
                        response.data?.progress?.processed ||
                        job.processedRecords,
                      totalRecords:
                        response.data?.progress?.total || job.totalRecords,
                      results: response.data?.results || job.results,
                    }
                  : job
              ),
            }));

            // Stop polling if job is completed or failed
            if (
              response.data?.status === "completed" ||
              response.data?.status === "failed"
            ) {
              setPollingJobs((prev) => {
                const newSet = new Set(prev);
                newSet.delete(jobId);
                return newSet;
              });
            }
          }
        } catch (error) {
          console.error(`Failed to update job ${jobId}:`, error);
          // Remove problematic job from polling
          setPollingJobs((prev) => {
            const newSet = new Set(prev);
            newSet.delete(jobId);
            return newSet;
          });
        }
      }
    }, getPollingInterval());

    return () => clearInterval(interval);
  }, [pollingJobs, state.jobs]);

  const fetchJobs = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      let allJobs: ProcessingJob[] = [];

      if (state.selectedStatus === "all") {
        // Fetch all statuses
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

        // Start polling only for processing jobs (not pending) to reduce load
        const processingJobIds =
          processing.data?.jobs?.map((job) => job.id) || [];
        setPollingJobs(new Set(processingJobIds));
      } else {
        const response = await ApiService.getJobsByStatus(state.selectedStatus);
        allJobs = response.data?.jobs || [];

        // Start polling only when viewing processing jobs
        if (state.selectedStatus === "processing") {
          setPollingJobs(new Set(allJobs.map((job) => job.id)));
        } else {
          setPollingJobs(new Set());
        }
      }

      // Sort by creation date (newest first)
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
      const blob = await ApiService.downloadResults(jobId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `trademark_results_${jobId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Download failed:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Download failed";
      alert(`Download failed: ${errorMessage}`);
    }
  };

  const handleCancelJob = async (jobId: string) => {
    try {
      await ApiService.cancelJob(jobId);
      await fetchJobs(); // Refresh the list
    } catch (error) {
      console.error("Cancel failed:", error);
      alert("Failed to cancel job. Please try again.");
    }
  };

  const handleRetryJob = async (jobId: string) => {
    try {
      await ApiService.retryJob(jobId);
      await fetchJobs(); // Refresh the list
    } catch (error) {
      console.error("Retry failed:", error);
      alert("Failed to retry job. Please try again.");
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
      <div className="space-y-6">
        {/* Status Filter Tabs */}
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

        {/* Jobs List */}
        <div className="bg-white rounded-lg border border-gray-200">
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
            <div className="divide-y divide-gray-200">
              {state.jobs.map((job) => (
                <div
                  key={job.id}
                  className={cn(
                    "p-6 hover:bg-gray-50 transition-colors",
                    state.highlightedJobId === job.id &&
                      "bg-blue-50 border-l-4 border-blue-500"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-lg font-medium text-gray-900">
                          Job #{job.id.slice(0, 8)}
                        </h3>
                        {getStatusBadge(job.status)}
                        {state.highlightedJobId === job.id && (
                          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                            New
                          </span>
                        )}
                      </div>

                      <div className="flex items-center space-x-6 text-sm text-gray-500">
                        <div className="flex items-center space-x-1">
                          <FileText className="w-4 h-4" />
                          <span>{job.totalRecords} records</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Calendar className="w-4 h-4" />
                          <span>{formatDate(job.createdAt)}</span>
                        </div>
                        {job.completedAt && (
                          <div className="flex items-center space-x-1">
                            <CheckCircle className="w-4 h-4" />
                            <span>Completed {formatDate(job.completedAt)}</span>
                          </div>
                        )}
                      </div>

                      {/* Progress Bar for Processing Jobs */}
                      {(job.status === "processing" ||
                        job.status === "pending") && (
                        <div className="mt-3">
                          <div className="flex justify-between text-sm text-gray-600 mb-1">
                            <span>Progress</span>
                            <span>
                              {job.processedRecords}/{job.totalRecords}
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                              style={{
                                width: `${
                                  job.totalRecords > 0
                                    ? Math.round(
                                        (job.processedRecords /
                                          job.totalRecords) *
                                          100
                                      )
                                    : 0
                                }%`,
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Error Message */}
                      {job.status === "failed" && job.errorMessage && (
                        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                          {job.errorMessage}
                        </div>
                      )}
                    </div>

                    {job.status === "completed" &&
                      job.results &&
                      job.results.length > 0 && (
                        <div className="mt-4">
                          <div className="flex justify-between items-center mb-2">
                            <h4 className="font-medium text-gray-900">
                              Results ({job.results.length} records)
                            </h4>
                            <button
                              onClick={() => handleDownload(job.id)}
                              className="text-sm bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700"
                            >
                              Download Excel
                            </button>
                          </div>
                          <div className="overflow-x-auto border border-gray-200 rounded">
                            <table className="min-w-full text-sm">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-3 py-2 text-left">
                                    Serial Number
                                  </th>
                                  <th className="px-3 py-2 text-left">
                                    Owner Name
                                  </th>
                                  <th className="px-3 py-2 text-left">
                                    Mark Text
                                  </th>
                                  <th className="px-3 py-2 text-left">
                                    Status
                                  </th>
                                  <th className="px-3 py-2 text-left">
                                    Filing Date
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {job.results.slice(0, 10).map((result, idx) => (
                                  <tr key={idx}>
                                    <td className="px-3 py-2">
                                      {result.serialNumber}
                                    </td>
                                    <td className="px-3 py-2">
                                      {result.markText || "N/A"}
                                    </td>
                                    <td className="px-3 py-2">
                                      {result.ownerName || "N/A"}
                                    </td>
                                    <td className="px-3 py-2">
                                      <span
                                        className={`px-2 py-1 text-xs rounded-full ${
                                          result.status === "success"
                                            ? "bg-green-100 text-green-800"
                                            : result.status === "not_found"
                                            ? "bg-yellow-100 text-yellow-800"
                                            : "bg-red-100 text-red-800"
                                        }`}
                                      >
                                        {result.status}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2">
                                      {result.filingDate || "N/A"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {job.results.length > 10 && (
                              <div className="p-2 text-center text-gray-500 text-sm">
                                Showing 10 of {job.results.length} results.
                                Download for full data.
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                    {/* Action Buttons */}
                    <div className="flex items-center space-x-2 ml-4">
                      <button
                        className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

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
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
