"use client";

import React, { useState, useEffect } from "react";
import { Users, Activity, CheckCircle, Clock } from "lucide-react";
import ApiService from "@/lib/api";
import MetricCard from "../partials/metric-card";
import { AdminStats, QueueStats } from "@/types/dashboard";
import RecentUsers from "../partials/recent-users";
import Systemhealth from "../partials/system-health";

export const AdminOverview: React.FC = () => {
  const [userStats, setUserStats] = useState<AdminStats | null>(null);
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [userStatsResponse, queueStatsResponse] = await Promise.all([
          ApiService.getUserStats(),
          ApiService.getQueueStats(),
        ]);

        if (userStatsResponse.success) {
          setUserStats(userStatsResponse.data || null);
        }

        if (queueStatsResponse.success) {
          setQueueStats(queueStatsResponse.data || null);
        }
      } catch (error) {
        console.error("Failed to fetch admin data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Total Users"
          value={userStats?.totalUsers || 0}
          change={`+${userStats?.newUsersThisMonth || 0} this month`}
          changeType="positive"
          icon={Users}
          loading={loading}
        />
        <MetricCard
          title="Active Users"
          value={userStats?.activeUsers || 0}
          icon={Activity}
          loading={loading}
        />
        <MetricCard
          title="Queue Jobs"
          value={
            queueStats
              ? queueStats.queue.waiting +
                queueStats.queue.active +
                queueStats.queue.delayed
              : 0
          }
          icon={Clock}
          loading={loading}
        />
        <MetricCard
          title="Completed Jobs"
          value={queueStats?.queue.completed || 0}
          icon={CheckCircle}
          loading={loading}
        />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentUsers />
        <Systemhealth />
      </div>
    </div>
  );
};

export default AdminOverview;
