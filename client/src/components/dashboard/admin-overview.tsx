'use client';

import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Activity, 
  FileText, 
  CheckCircle, 
  TrendingUp, 
  AlertCircle,
  Clock,
  Database,
  Settings,
  Plus,
  Eye
} from 'lucide-react';
import ApiService from '@/lib/api';
import { cn } from '@/lib/utils';

interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  adminUsers: number;
  newUsersThisMonth: number;
  lastLoginActivity: string | null;
}

interface QueueStats {
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
}

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon: React.ComponentType<{ className?: string }>;
  loading?: boolean;
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  change,
  changeType,
  icon: Icon,
  loading
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
            <p className={cn(
              "text-sm font-medium mt-1",
              changeType === 'positive' && "text-green-600",
              changeType === 'negative' && "text-red-600",
              changeType === 'neutral' && "text-gray-600"
            )}>
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

const RecentUsers: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await ApiService.getAllUsers(1, 5);
        if (response.success) {
          setUsers(response.data?.users || []);
        }
      } catch (error) {
        console.error('Failed to fetch users:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Users</h3>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gray-200 rounded-full animate-pulse"></div>
              <div className="flex-1">
                <div className="h-4 bg-gray-200 rounded animate-pulse mb-1"></div>
                <div className="h-3 bg-gray-200 rounded animate-pulse w-24"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Recent Users</h3>
        <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
          View all →
        </button>
      </div>
      <div className="space-y-3">
        {users.slice(0, 5).map((user) => (
          <div key={user.id} className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
              {user.firstName.charAt(0)}{user.lastName.charAt(0)}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-xs text-gray-500">{user.email}</p>
            </div>
            <span className={cn(
              "px-2 py-1 text-xs font-medium rounded-full",
              user.role === 'admin' 
                ? "bg-purple-100 text-purple-800"
                : "bg-blue-100 text-blue-800"
            )}>
              {user.role}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const SystemHealth: React.FC = () => {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const response = await ApiService.getHealthStatus();
        setHealth(response);
      } catch (error) {
        console.error('Failed to fetch health status:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchHealth();
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">System Health</h3>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="h-4 bg-gray-200 rounded animate-pulse w-24"></div>
              <div className="h-4 bg-gray-200 rounded animate-pulse w-16"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    if (status === 'healthy' || status === 'ok') return 'bg-green-500';
    if (status === 'unhealthy' || status === 'error') return 'bg-red-500';
    return 'bg-yellow-500';
  };

  const getStatusText = (status: string) => {
    if (status === 'healthy' || status === 'ok') return 'Operational';
    if (status === 'unhealthy' || status === 'error') return 'Error';
    return 'Warning';
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">System Health</h3>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Overall Status</span>
          <span className="flex items-center text-sm">
            <div className={cn("w-2 h-2 rounded-full mr-2", getStatusColor(health?.status || 'unknown'))}></div>
            {getStatusText(health?.status || 'unknown')}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">USPTO API</span>
          <span className="flex items-center text-sm">
            <div className={cn("w-2 h-2 rounded-full mr-2", getStatusColor(health?.services?.uspto?.status || 'unknown'))}></div>
            {getStatusText(health?.services?.uspto?.status || 'unknown')}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Queue System</span>
          <span className="flex items-center text-sm">
            <div className={cn("w-2 h-2 rounded-full mr-2", getStatusColor(health?.services?.queue?.status || 'unknown'))}></div>
            {getStatusText(health?.services?.queue?.status || 'unknown')}
          </span>
        </div>
      </div>
    </div>
  );
};

export const AdminOverview: React.FC = () => {
  const [userStats, setUserStats] = useState<AdminStats | null>(null);
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [userStatsResponse, queueStatsResponse] = await Promise.all([
          ApiService.getUserStats(),
          ApiService.getQueueStats()
        ]);

        if (userStatsResponse.success) {
          setUserStats(userStatsResponse.data || null);
        }

        if (queueStatsResponse.success) {
          setQueueStats(queueStatsResponse.data || null);
        }
      } catch (error) {
        console.error('Failed to fetch admin data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <div className="space-y-6">
      {/* Metrics Cards */}
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
          value={queueStats ? (
            queueStats.queue.waiting + 
            queueStats.queue.active + 
            queueStats.queue.delayed
          ) : 0}
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

      {/* Quick Actions */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <Plus className="w-5 h-5 text-blue-600 mr-3" />
            <div className="text-left">
              <p className="font-medium text-gray-900">Add User</p>
              <p className="text-sm text-gray-500">Create new user account</p>
            </div>
          </button>
          <button className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <Eye className="w-5 h-5 text-green-600 mr-3" />
            <div className="text-left">
              <p className="font-medium text-gray-900">View Jobs</p>
              <p className="text-sm text-gray-500">Monitor processing queue</p>
            </div>
          </button>
          <button className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <Settings className="w-5 h-5 text-purple-600 mr-3" />
            <div className="text-left">
              <p className="font-medium text-gray-900">System Settings</p>
              <p className="text-sm text-gray-500">Configure system parameters</p>
            </div>
          </button>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentUsers />
        <SystemHealth />
      </div>
    </div>
  );
};

export default AdminOverview;