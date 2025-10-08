"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Upload,
  Clock,
  TrendingUp,
  Users,
  Settings,
  LogOut,
  Building2,
  X,
  Archive,
  Target,
} from "lucide-react";
import { MenuItem, SidebarProps } from "@/types/dashboard";

// Function to generate menu items
const getMenuItems = (userRole: "admin" | "user"): MenuItem[] => {
  const commonItems = [
    {
      id: "overview",
      label: "Overview",
      icon: BarChart3,
      href: "/dashboard",
    },
    {
      id: "jobs",
      label: userRole === "admin" ? "All Jobs" : "My Jobs",
      icon: Clock,
      href: "/dashboard/jobs",
    },
  ];

  if (userRole === "admin") {
    return [
      ...commonItems,
      {
        id: "upload",
        label: "Upload & Process",
        icon: Upload,
        href: "/dashboard/upload",
      },
      {
        id: "archived",
        label: "Archived Jobs",
        icon: Archive,
        href: "/dashboard/archived-jobs",
      },
      {
        id: "pipeline", // ✅ Admin Pipeline (CRM Dashboard)
        label: "Pipeline",
        icon: Target,
        href: "/dashboard/admin/pipeline",
      },
      {
        id: "analytics",
        label: "Analytics",
        icon: TrendingUp,
        href: "/dashboard/user-timeline",
      },
      {
        id: "users",
        label: "User Management",
        icon: Users,
        href: "/dashboard/users",
      },
    ];
  }

  // User menu items
  return [
    ...commonItems,
    {
      id: "pipeline", // ✅ User Pipeline (Add Lead Form)
      label: "Pipeline",
      icon: Target,
      href: "/dashboard/pipeline",
    },
  ];
};

export const Sidebar = ({ isOpen, onToggle, userRole }: SidebarProps) => {
  const pathname = usePathname();

  // Get the menu items for this role
  const menuItems = getMenuItems(userRole);

  const isActive = (href: string): boolean => {
    if (href === "/dashboard") {
      return pathname === "/dashboard";
    }
    return pathname.startsWith(href);
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onToggle}
        />
      )}

      <div
        className={cn(
          "fixed left-0 top-0 h-full bg-white border-r border-gray-200 z-50 transition-transform duration-300 ease-in-out",
          "w-64 flex flex-col",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">ZeviTech</h1>
              <p className="text-xs text-gray-500">Dashboard</p>
            </div>
          </div>

          <button
            onClick={onToggle}
            className="lg:hidden p-2 rounded-md hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={() => {
                  if (window.innerWidth < 1024) {
                    onToggle();
                  }
                }}
                className={cn(
                  "flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200",
                  active
                    ? "bg-blue-50 text-blue-700 border-r-2 border-blue-700"
                    : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                )}
              >
                <Icon
                  className={cn(
                    "w-5 h-5",
                    active ? "text-blue-700" : "text-gray-500"
                  )}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-gray-200">
          <div className="flex items-center space-x-3 px-3 py-2">
            <div
              className={cn(
                "w-2 h-2 rounded-full",
                userRole === "admin" ? "bg-purple-500" : "bg-green-500"
              )}
            />
            <span className="text-sm text-gray-600 capitalize">
              {userRole} Access
            </span>
          </div>
        </div>
      </div>
    </>
  );
};
