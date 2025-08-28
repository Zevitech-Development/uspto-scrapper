"use client";

import React, { useState, useEffect } from "react";
import {
  Upload,
  FileText,
  CheckCircle,
  Clock,
  AlertCircle,
  Download,
  Eye,
  TrendingUp,
} from "lucide-react";
import ApiService, { ProcessingJob } from "@/lib/api";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: React.ComponentType<{ className?: string }>;
  loading?: boolean;
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  change,
  changeType,
  icon: Icon,
  loading,
}) => {
  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600 mb-1">{title}</p>
          {loading ? (
            <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
          ) : (
            <p className="text-2xl font-bold text-gray-900">{value}</p>
          )}
          {change && !loading && (
            <p
              className={cn(
                "text-sm font-medium mt-1",
                changeType === "positive" && "text-green-600",
                changeType === "negative" && "text-red-600",
                changeType === "neutral" && "text-gray-600"
              )}
            >
              {change}
            </p>
          )}
        </div>
        <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
          <Icon className="w-6 h-6 text-blue-600" />
        </div>
      </div>
    </div>
  );
};

const RecentJobs: React.FC = () => {
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const [completedJobs, processingJobs] = await Promise.all([
          ApiService.getJobsByStatus("completed"),
          ApiService.getJobsByStatus("processing"),
        ]);

        const allJobs = [
          ...(processingJobs.data?.jobs || []),
          ...(completedJobs.data?.jobs || []),
        ].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        setJobs(allJobs.slice(0, 5));
      } catch (error) {
        console.error("Failed to fetch jobs:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchJobs();
  }, []);

  const getStatusBadge = (status: string) => {
    const baseClasses = "px-2 py-1 text-xs font-medium rounded-full";
    switch (status) {
      case "completed":
        return `${baseClasses} bg-green-100 text-green-800`;
      case "processing":
        return `${baseClasses} bg-blue-100 text-blue-800`;
      case "failed":
        return `${baseClasses} bg-red-100 text-red-800`;
      case "pending":
        return `${baseClasses} bg-yellow-100 text-yellow-800`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-800`;
    }
  };

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
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
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            My Recent Jobs
          </h3>
        </div>
        <div className="p-6 space-y-4">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
            >
              <div className="flex-1">
                <div className="h-4 bg-gray-200 rounded animate-pulse mb-2"></div>
                <div className="h-3 bg-gray-200 rounded animate-pulse w-24"></div>
              </div>
              <div className="h-6 bg-gray-200 rounded animate-pulse w-16"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">My Recent Jobs</h3>
      </div>
      <div className="p-6">
        {jobs.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">
              No jobs yet. Upload a file to get started!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center space-x-3">
                    <p className="font-medium text-gray-900">
                      Job #{job.id.slice(0, 8)}
                    </p>
                    <span className={getStatusBadge(job.status)}>
                      {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {job.totalRecords} records • {formatDate(job.createdAt)}
                  </p>
                  {job.status === "processing" && (
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.round(
                            (job.processedRecords / job.totalRecords) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                    title="View Details"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  {job.status === "completed" && job.results?.length > 0 && (
                    <button
                      onClick={() => handleDownload(job.id)}
                      className="p-2 text-blue-600 hover:text-blue-700 rounded-full hover:bg-blue-50"
                      title="Download Results"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const QuickActions: React.FC = () => {
  const actions = [
    {
      title: "Upload Excel File",
      description: "Process trademark serial numbers",
      icon: Upload,
      href: "/dashboard/upload",
      color: "bg-blue-500 hover:bg-blue-600",
    },
    {
      title: "Check Job Status",
      description: "Monitor your processing jobs",
      icon: Clock,
      href: "/dashboard/jobs",
      color: "bg-green-500 hover:bg-green-600",
    },
    {
      title: "View History",
      description: "See all your processed files",
      icon: FileText,
      href: "/dashboard/jobs",
      color: "bg-purple-500 hover:bg-purple-600",
    },
  ];

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Quick Actions
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {actions.map((action, index) => {
          const Icon = action.icon;
          return (
            <button
              key={index}
              className="flex items-start space-x-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors group"
            >
              <div
                className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center text-white transition-colors",
                  action.color
                )}
              >
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 text-left">
                <h4 className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                  {action.title}
                </h4>
                <p className="text-sm text-gray-500 mt-1">
                  {action.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export const UserOverview: React.FC = () => {
  const [stats, setStats] = useState({
    totalJobs: 0,
    completedJobs: 0,
    processingJobs: 0,
    successRate: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserStats = async () => {
      try {
        const [completed, processing, failed] = await Promise.all([
          ApiService.getJobsByStatus("completed"),
          ApiService.getJobsByStatus("processing"),
          ApiService.getJobsByStatus("failed"),
        ]);

        const completedCount = completed.data?.count || 0;
        const processingCount = processing.data?.count || 0;
        const failedCount = failed.data?.count || 0;
        const totalJobs = completedCount + processingCount + failedCount;

        setStats({
          totalJobs,
          completedJobs: completedCount,
          processingJobs: processingCount,
          successRate:
            totalJobs > 0 ? Math.round((completedCount / totalJobs) * 100) : 0,
        });
      } catch (error) {
        console.error("Failed to fetch user stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserStats();
  }, []);

  return (
    <div className="space-y-6">
      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Total Jobs"
          value={stats.totalJobs}
          icon={FileText}
          loading={loading}
        />
        <MetricCard
          title="Completed"
          value={stats.completedJobs}
          icon={CheckCircle}
          loading={loading}
        />
        <MetricCard
          title="Processing"
          value={stats.processingJobs}
          icon={Clock}
          loading={loading}
        />
        <MetricCard
          title="Success Rate"
          value={`${stats.successRate}%`}
          icon={TrendingUp}
          loading={loading}
        />
      </div>

      {/* Quick Actions */}
      <QuickActions />

      {/* Recent Jobs */}
      <RecentJobs />

      {/* Usage Tips */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <div className="flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-medium text-blue-900 mb-1">Usage Tips</h4>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>
                • Upload Excel files with trademark serial numbers in any column
              </li>
              <li>
                • Processing time depends on file size (approximately 1 minute
                per 50 records)
              </li>
              <li>
                • You can download results as Excel files once processing is
                complete
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserOverview;
