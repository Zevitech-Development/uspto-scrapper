"use client";

import React, { useState, useEffect } from "react";
import { Plus, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ApiService from "@/lib/api";
import { User, UserStats, CreateUserData } from "@/types/api-service-interface";
import { UserTable } from "@/components/dashboard/users/UserTable";
import { CreateUserForm } from "@/components/dashboard/users/CreateUserForm";
import { UserStatsCards } from "@/components/dashboard/users/UserStatsCards";
import { useToast } from "@/hooks/use-toast";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";

interface UsersPageState {
  users: User[];
  loading: boolean;
  error: string | null;
  searchTerm: string;
  currentPage: number;
  totalPages: number;
  totalUsers: number;
  showCreateForm: boolean;
  userStats: UserStats | null;
  refreshing: boolean;
}

export default function UsersPage() {
  const { toast } = useToast();
  const [state, setState] = useState<UsersPageState>({
    users: [],
    loading: true,
    error: null,
    searchTerm: "",
    currentPage: 1,
    totalPages: 1,
    totalUsers: 0,
    showCreateForm: false,
    userStats: null,
    refreshing: false,
  });

  // Fetch users with pagination
  const fetchUsers = async (page: number = 1, limit: number = 20) => {
    try {
      setState((prev) => ({
        ...prev,
        loading: page === 1,
        refreshing: page !== 1,
      }));

      const response = await ApiService.getAllUsers(page, limit);

      if (response.success && response.data) {
        setState((prev) => ({
          ...prev,
          users: response.data!.users,
          currentPage: response.data!.page,
          totalPages: response.data!.totalPages,
          totalUsers: response.data!.total,
          loading: false,
          refreshing: false,
          error: null,
        }));
      }
    } catch (error) {
      console.error("Failed to fetch users:", error);
      setState((prev) => ({
        ...prev,
        loading: false,
        refreshing: false,
        error: error instanceof Error ? error.message : "Failed to fetch users",
      }));
      toast({
        title: "Error",
        description: "Failed to fetch users. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Fetch user statistics
  const fetchUserStats = async () => {
    try {
      const response = await ApiService.getUserStats();
      if (response.success && response.data) {
        setState((prev) => ({
          ...prev,
          userStats: response.data!,
        }));
      }
    } catch (error) {
      console.error("Failed to fetch user stats:", error);
    }
  };

  // Handle user creation
  const handleCreateUser = async (userData: CreateUserData) => {
    try {
      const response = await ApiService.createUser(userData);

      if (response.success) {
        toast({
          title: "Success",
          description: "User created successfully",
        });

        setState((prev) => ({ ...prev, showCreateForm: false }));

        // Refresh users list and stats
        await Promise.all([fetchUsers(state.currentPage), fetchUserStats()]);
      }
    } catch (error) {
      console.error("Failed to create user:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to create user",
        variant: "destructive",
      });
      throw error;
    }
  };

  // Handle user status update
  const handleUpdateUserStatus = async (userId: string, isActive: boolean) => {
    try {
      const response = await ApiService.updateUserStatus(userId, isActive);

      if (response.success) {
        toast({
          title: "Success",
          description: `User ${
            isActive ? "activated" : "deactivated"
          } successfully`,
        });

        // Update user in the local state
        setState((prev) => ({
          ...prev,
          users: prev.users.map((user) =>
            user.id === userId ? { ...user, isActive } : user
          ),
        }));

        // Refresh stats
        await fetchUserStats();
      }
    } catch (error) {
      console.error("Failed to update user status:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to update user status",
        variant: "destructive",
      });
    }
  };

  // Handle user deletion
  const handleDeleteUser = async (userId: string) => {
    try {
      const response = await ApiService.deleteUser(userId);

      if (response.success) {
        toast({
          title: "Success",
          description: "User deleted successfully",
        });

        // Remove user from local state
        setState((prev) => ({
          ...prev,
          users: prev.users.filter((user) => user.id !== userId),
          totalUsers: prev.totalUsers - 1,
        }));

        // If current page becomes empty and it's not the first page, go to previous page
        if (state.users.length === 1 && state.currentPage > 1) {
          await fetchUsers(state.currentPage - 1);
        } else {
          await fetchUsers(state.currentPage);
        }

        // Refresh stats
        await fetchUserStats();
      }
    } catch (error) {
      console.error("Failed to delete user:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to delete user",
        variant: "destructive",
      });
    }
  };

  // Handle page change
  const handlePageChange = (page: number) => {
    fetchUsers(page);
  };

  // Filter users based on search term
  const filteredUsers = state.users.filter(
    (user) =>
      user.email.toLowerCase().includes(state.searchTerm.toLowerCase()) ||
      user.firstName.toLowerCase().includes(state.searchTerm.toLowerCase()) ||
      user.lastName.toLowerCase().includes(state.searchTerm.toLowerCase())
  );

  // Initial data fetch
  useEffect(() => {
    Promise.all([fetchUsers(), fetchUserStats()]);
  }, []);

  if (state.loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading users...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (state.error) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="text-red-500 mb-4">
              <Users className="h-12 w-12 mx-auto mb-2" />
              <p className="text-lg font-semibold">Error Loading Users</p>
              <p className="text-sm text-gray-600">{state.error}</p>
            </div>
            <Button onClick={() => fetchUsers()} variant="outline">
              Try Again
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              User Management
            </h1>
            <p className="text-gray-600 mt-1">
              Manage system users and their permissions
            </p>
          </div>
          <Button
            onClick={() =>
              setState((prev) => ({ ...prev, showCreateForm: true }))
            }
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add User
          </Button>
        </div>

        {/* User Statistics */}
        {state.userStats && <UserStatsCards stats={state.userStats} />}

        {/* Search and Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Users ({state.totalUsers})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search users by name or email..."
                  value={state.searchTerm}
                  onChange={(e) =>
                    setState((prev) => ({
                      ...prev,
                      searchTerm: e.target.value,
                    }))
                  }
                  className="pl-10"
                />
              </div>
              <Button
                onClick={() => fetchUsers(state.currentPage)}
                variant="outline"
                disabled={state.refreshing}
              >
                {state.refreshing ? "Refreshing..." : "Refresh"}
              </Button>
            </div>

            {/* Users Table */}
            <UserTable
              users={filteredUsers}
              currentPage={state.currentPage}
              totalPages={state.totalPages}
              onPageChange={handlePageChange}
              onUpdateUserStatus={handleUpdateUserStatus}
              onDeleteUser={handleDeleteUser}
              loading={state.refreshing}
            />
          </CardContent>
        </Card>

        {/* Create User Form Modal */}
        {state.showCreateForm && (
          <CreateUserForm
            onSubmit={handleCreateUser}
            onCancel={() =>
              setState((prev) => ({ ...prev, showCreateForm: false }))
            }
          />
        )}
      </div>
    </DashboardLayout>
  );
}
