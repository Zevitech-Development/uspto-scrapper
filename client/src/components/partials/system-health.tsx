import ApiService from "@/lib/api";
import { getStatusColor, getStatusText } from "@/lib/common-functions";
import { cn } from "@/lib/utils";
import React, { useEffect, useState } from "react";

const Systemhealth = () => {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const response = await ApiService.getHealthStatus();
        setHealth(response);
      } catch (error) {
        console.error("Failed to fetch health status:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchHealth();
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          System Health
        </h3>
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
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        System Health
      </h3>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Overall Status</span>
          <span className="flex items-center text-sm">
            <div
              className={cn(
                "w-2 h-2 rounded-full mr-2",
                getStatusColor(health?.status || "unknown")
              )}
            ></div>
            {getStatusText(health?.status || "unknown")}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">USPTO API</span>
          <span className="flex items-center text-sm">
            <div
              className={cn(
                "w-2 h-2 rounded-full mr-2",
                getStatusColor(health?.services?.uspto?.status || "unknown")
              )}
            ></div>
            {getStatusText(health?.services?.uspto?.status || "unknown")}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Queue System</span>
          <span className="flex items-center text-sm">
            <div
              className={cn(
                "w-2 h-2 rounded-full mr-2",
                getStatusColor(health?.services?.queue?.status || "unknown")
              )}
            ></div>
            {getStatusText(health?.services?.queue?.status || "unknown")}
          </span>
        </div>
      </div>
    </div>
  );
};

export default Systemhealth;
