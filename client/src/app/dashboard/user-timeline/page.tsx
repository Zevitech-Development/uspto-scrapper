"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import ApiService from "@/lib/api";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { User } from "@/types/api-service-interface";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Clock,
  TrendingUp,
  Trophy,
  Loader2,
  Calendar,
  Download,
  Play,
  CheckCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import toast, { Toaster } from "react-hot-toast";

interface TimelineJob {
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
}

interface TimelineData {
  user: {
    id: string;
    name: string;
    email: string;
  };
  timeline: TimelineJob[];
  stats: {
    totalJobs: number;
    completedJobs: number;
    inProgressJobs: number;
    avgCompletionTime: number;
    fastestJob: number;
  };
}

export default function UserTimelinePage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [timelineData, setTimelineData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await ApiService.getAllUsers(1, 100);
      if (response.success && response.data) {
        const activeUsers = response.data.users.filter(
          (u: User) => u.role === "user" && u.isActive
        );
        setUsers(activeUsers);
      }
    } catch (error) {
      toast.error("Failed to fetch users");
    }
  };

  const fetchTimeline = async (userId: string) => {
    if (!userId) return;

    setLoading(true);
    try {
      const response = await ApiService.getUserTimeline(userId);
      if (response.success) {
        setTimelineData(response.data || null);
      }
    } catch (error) {
      toast.error("Failed to fetch timeline");
    } finally {
      setLoading(false);
    }
  };

  const handleUserSelect = (userId: string) => {
    setSelectedUserId(userId);
    fetchTimeline(userId);
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return "-";
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(dateString));
  };

  // Prepare chart data
  const statusDistribution = timelineData
    ? [
        {
          name: "Downloaded",
          value: timelineData.timeline.filter((j) => j.status === "downloaded")
            .length,
          color: "#3B82F6",
        },
        {
          name: "Working",
          value: timelineData.timeline.filter((j) => j.status === "working")
            .length,
          color: "#F59E0B",
        },
        {
          name: "Finished",
          value: timelineData.timeline.filter((j) => j.status === "finished")
            .length,
          color: "#10B981",
        },
      ]
    : [];

  const completionTimeData = timelineData
    ? timelineData.timeline
        .filter((j) => j.totalTime)
        .slice(0, 10)
        .map((j) => ({
          job: `#${j.jobId.slice(0, 6)}`,
          time: Math.round((j.totalTime || 0) / (1000 * 60)), // Convert to minutes
        }))
    : [];

  if (!user || user.role !== "admin") {
    return null;
  }

  return (
    <DashboardLayout title="User Timeline & Analytics">
      <Toaster position="top-right" />

      <div className="space-y-6">
        {/* User Selector */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select User
          </label>
          <select
            value={selectedUserId}
            onChange={(e) => handleUserSelect(e.target.value)}
            className="w-full md:w-96 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Choose a user...</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.firstName} {u.lastName} ({u.email})
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-gray-500">Loading timeline...</p>
          </div>
        ) : timelineData ? (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Total Jobs</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {timelineData.stats.totalJobs}
                    </p>
                  </div>
                  <Calendar className="w-10 h-10 text-blue-600" />
                </div>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Completed</p>
                    <p className="text-2xl font-bold text-green-600">
                      {timelineData.stats.completedJobs}
                    </p>
                  </div>
                  <CheckCircle className="w-10 h-10 text-green-600" />
                </div>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Avg Time</p>
                    <p className="text-2xl font-bold text-orange-600">
                      {formatDuration(timelineData.stats.avgCompletionTime)}
                    </p>
                  </div>
                  <Clock className="w-10 h-10 text-orange-600" />
                </div>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Fastest Job</p>
                    <p className="text-2xl font-bold text-purple-600">
                      {formatDuration(timelineData.stats.fastestJob)}
                    </p>
                  </div>
                  <Trophy className="w-10 h-10 text-purple-600" />
                </div>
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Completion Time Bar Chart */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Completion Time per Job (minutes)
                </h3>
                {completionTimeData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={completionTimeData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="job" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="time" fill="#3B82F6" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-gray-500 text-center py-12">
                    No completed jobs yet
                  </p>
                )}
              </div>

              {/* Status Distribution Pie Chart */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Job Status Distribution
                </h3>
                {statusDistribution.some((s) => s.value > 0) ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={statusDistribution.filter((s) => s.value > 0)}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={(entry) => `${entry.name}: ${entry.value}`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {statusDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-gray-500 text-center py-12">
                    No jobs assigned yet
                  </p>
                )}
              </div>
            </div>

            {/* Timeline Table */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  Job Timeline
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Job ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Records
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Assigned
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Downloaded
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Started Work
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Finished
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Total Time
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {timelineData.timeline.map((job) => (
                      <tr key={job.jobId} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          #{job.jobId.slice(0, 8)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {job.totalRecords}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(job.assignedAt)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {job.downloadedAt
                            ? formatDate(job.downloadedAt)
                            : "-"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {job.workStartedAt
                            ? formatDate(job.workStartedAt)
                            : "-"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {job.finishedAt ? formatDate(job.finishedAt) : "-"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {formatDuration(job.totalTime || 0)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={cn(
                              "px-2 py-1 rounded-full text-xs font-medium",
                              job.status === "assigned" &&
                                "bg-yellow-100 text-yellow-800",
                              job.status === "downloaded" &&
                                "bg-blue-100 text-blue-800",
                              job.status === "working" &&
                                "bg-orange-100 text-orange-800",
                              job.status === "finished" &&
                                "bg-green-100 text-green-800"
                            )}
                          >
                            {job.status?.charAt(0).toUpperCase() +
                              job.status?.slice(1)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <TrendingUp className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">
              Select a user to view their timeline
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
