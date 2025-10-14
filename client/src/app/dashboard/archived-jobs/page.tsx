"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Download,
  RotateCcw,
  Trash2,
  Archive,
  AlertCircle,
  Loader2,
  FileText,
  Clock,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import ApiService, { ProcessingJob } from "@/lib/api";
import { cn } from "@/lib/utils";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { User } from "@/types/api-service-interface";
import toast, { Toaster } from "react-hot-toast";

interface ArchivedJobsState {
  jobs: ProcessingJob[];
  loading: boolean;
  error: string | null;
}

export default function ArchivedJobsPage() {
  const { user } = useAuth();

  const [state, setState] = useState<ArchivedJobsState>({
    jobs: [],
    loading: true,
    error: null,
  });

  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    fetchArchivedJobs();
    fetchUsers();
  }, []);

  const fetchArchivedJobs = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const response = await ApiService.getArchivedJobs();
      const archivedJobs = response.data?.jobs || [];

      archivedJobs.sort(
        (a, b) =>
          new Date(b.archivedAt || b.createdAt).getTime() -
          new Date(a.archivedAt || a.createdAt).getTime()
      );

      setState({
        jobs: archivedJobs,
        loading: false,
        error: null,
      });
    } catch (error) {
      setState({
        jobs: [],
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch archived jobs",
      });
    }
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

  const getUserName = (userId: string): string => {
    const user = users.find((u) => u.id === userId);
    if (user) {
      return `${user.firstName} ${user.lastName}`;
    }
    return "Unknown User";
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

  const handleRestore = async (jobId: string) => {
    if (
      !confirm("Restore this job? It will appear back in the All Jobs list.")
    ) {
      return;
    }

    try {
      const response = await ApiService.unarchiveJob(jobId);

      if (response.success) {
        // Remove from archived list
        setState((prev) => ({
          ...prev,
          jobs: prev.jobs.filter((job) => job.id !== jobId),
        }));

        toast.success("Job restored successfully!");
      }
    } catch (error) {
      console.error("Restore failed:", error);
      toast.error("Failed to restore job. Please try again.");
    }
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

      toast.success("File downloaded successfully!");
    } catch (error) {
      console.error("Download failed:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Download failed";
      toast.error(`Download failed: ${errorMessage}`);
    }
  };

  const handlePermanentDelete = async (jobId: string) => {
    if (
      !confirm(
        "⚠️ PERMANENTLY DELETE this job? This action CANNOT be undone. All data will be lost forever."
      )
    ) {
      return;
    }

    // Double confirmation for safety
    if (
      !confirm(
        "Are you ABSOLUTELY SURE? This will permanently delete all job data, results, and filtering statistics."
      )
    ) {
      return;
    }

    try {
      const response = await ApiService.removeJob(jobId);

      if (response.success) {
        setState((prev) => ({
          ...prev,
          jobs: prev.jobs.filter((job) => job.id !== jobId),
        }));

        toast.success("Job permanently deleted.");
      }
    } catch (error) {
      console.error("Delete failed:", error);
      toast.error("Failed to delete job. Please try again.");
    }
  };

  if (!user || user.role !== "admin") {
    return (
      <DashboardLayout title="Archived Jobs">
        <div className="p-8 text-center">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <p className="text-red-600">Admin access required</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Archived Jobs">
      <Toaster position="top-right" />
      <div className="space-y-6">
        {/* Stats Card */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Archived Jobs</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {state.jobs.length}
              </p>
            </div>
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center">
              <Archive className="w-8 h-8 text-purple-600" />
            </div>
          </div>
        </div>

        {/* Archived Jobs Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {state.loading ? (
            <div className="p-8 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-purple-600 mx-auto mb-4" />
              <p className="text-gray-500">Loading archived jobs...</p>
            </div>
          ) : state.error ? (
            <div className="p-8 text-center">
              <AlertCircle className="w-8 h-8 text-red-600 mx-auto mb-4" />
              <p className="text-red-600 mb-4">{state.error}</p>
              <button
                onClick={fetchArchivedJobs}
                className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
              >
                Retry
              </button>
            </div>
          ) : state.jobs.length === 0 ? (
            <div className="p-8 text-center">
              <Archive className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 mb-2">No archived jobs</p>
              <p className="text-sm text-gray-400">
                Archived jobs will appear here when you archive them from the
                All Jobs page.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Job ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Archived Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Completed Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Records
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Filtering
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
                      className="hover:bg-gray-50 transition-colors"
                    >
                      {/* Job ID */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        #{job.id.slice(0, 8)}
                      </td>

                      {/* Archived Date */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex items-center space-x-2">
                          <Clock className="w-4 h-4 text-purple-500" />
                          <span>
                            {job.archivedAt
                              ? formatDate(job.archivedAt)
                              : formatDate(job.createdAt)}
                          </span>
                        </div>
                      </td>

                      {/* Completed Date */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {job.completedAt ? formatDate(job.completedAt) : "-"}
                      </td>

                      {/* Records Count */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {job.totalRecords}
                      </td>

                      {/* Filtering Stats */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {job.filteringStats ? (
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                              <span className="text-green-600 font-medium">
                                {job.filteringStats.selfFiled}
                              </span>
                              <span className="text-gray-400">self-filed</span>
                            </div>
                            {job.filteringStats.hadAttorney > 0 && (
                              <div className="flex items-center space-x-2">
                                <span className="text-orange-600 font-medium">
                                  {job.filteringStats.hadAttorney}
                                </span>
                                <span className="text-gray-400">filtered</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>

                      {/* Assigned To */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {job.assignedTo ? (
                          <span className="text-blue-600 font-medium">
                            {getUserName(job.assignedTo)}
                          </span>
                        ) : (
                          <span className="text-gray-400">Unassigned</span>
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
                          {/* Restore Button */}
                          <button
                            onClick={() => handleRestore(job.id)}
                            className="p-2 text-blue-600 hover:text-blue-700 rounded-full hover:bg-blue-50"
                            title="Restore to All Jobs"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>

                          {/* Download Button */}
                          <button
                            onClick={() => handleDownload(job.id)}
                            className="p-2 text-green-600 hover:text-green-700 rounded-full hover:bg-green-50"
                            title="Download Results"
                          >
                            <Download className="w-4 h-4" />
                          </button>

                          {/* Permanent Delete Button */}
                          <button
                            onClick={() => handlePermanentDelete(job.id)}
                            className="p-2 text-red-600 hover:text-red-700 rounded-full hover:bg-red-50"
                            title="Permanently Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
