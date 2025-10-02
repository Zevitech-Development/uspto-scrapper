"use client";

import React, { useState, useEffect } from "react";
import { FileText, CheckCircle, Clock, TrendingUp } from "lucide-react";
import ApiService from "@/lib/api";
import MetricCard from "@/components/partials/metric-card";
import QuickActions from "@/components/partials/quick-actions";
import RecentJobs from "@/components/partials/recent-jobs";
import UserTips from "@/components/partials/user-tips";

export const UserOverview = () => {
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

      {/* <QuickActions /> */}

      {/* <RecentJobs /> */}

      {/* <UserTips /> */}
    </div>
  );
};

export default UserOverview;
