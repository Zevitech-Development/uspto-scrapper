"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserCheck, Shield, Calendar, Activity } from "lucide-react";
import { UserStats } from "@/types/api-service-interface";
import { formatDistanceToNow } from "date-fns";

interface UserStatsCardsProps {
  stats: UserStats;
}

export const UserStatsCards: React.FC<UserStatsCardsProps> = ({ stats }) => {
  const formatLastActivity = (lastActivity: string | null) => {
    if (!lastActivity) return "No recent activity";
    try {
      return formatDistanceToNow(new Date(lastActivity), { addSuffix: true });
    } catch {
      return "Unknown";
    }
  };

  const statsCards = [
    {
      title: "Total Users",
      value: stats.totalUsers,
      icon: Users,
      description: "All registered users",
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      title: "Active Users",
      value: stats.activeUsers,
      icon: UserCheck,
      description: "Currently active users",
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
    {
      title: "Admin Users",
      value: stats.adminUsers,
      icon: Shield,
      description: "Users with admin privileges",
      color: "text-purple-600",
      bgColor: "bg-purple-50",
    },
    {
      title: "New This Month",
      value: stats.newUsersThisMonth,
      icon: Calendar,
      description: "Users registered this month",
      color: "text-orange-600",
      bgColor: "bg-orange-50",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Stats Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statsCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card key={index}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  {stat.title}
                </CardTitle>
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-gray-500 mt-1">{stat.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Last Activity Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-gray-600">
            Last Login Activity
          </CardTitle>
          <div className="p-2 rounded-lg bg-gray-50">
            <Activity className="h-4 w-4 text-gray-600" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-lg font-semibold">
            {formatLastActivity(stats.lastLoginActivity)}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Most recent user login activity
          </p>
        </CardContent>
      </Card>
    </div>
  );
};