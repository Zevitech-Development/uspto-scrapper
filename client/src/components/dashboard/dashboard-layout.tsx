"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { DashboardLayoutProps } from "@/types/dashboard";
import { useAuth } from "@/hooks/useAuth";
import { Sidebar } from "./sidebar";
import { Header } from "./header";

export const DashboardLayout = ({ children, title }: DashboardLayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const router = useRouter();
  const { user, logout, isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (isMounted && !isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isMounted, isLoading, isAuthenticated, router]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setSidebarOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (!isMounted || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  const handleSidebarToggle = (): void => {
    setSidebarOpen(!sidebarOpen);
  };

  const handleLogout = async (): Promise<void> => {
    try {
      await logout();
      router.push("/login");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={handleSidebarToggle}
        userRole={user.role}
      />

      <div className="lg:pl-64">
        <Header
          user={user}
          onSidebarToggle={handleSidebarToggle}
          onLogout={handleLogout}
        />

        <main className="px-4 lg:px-8 py-6">
          {title && (
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
            </div>
          )}

          <div className=" max-w-full">{children}</div>
        </main>
      </div>
    </div>
  );
};

// export const DashboardLoading: React.FC = () => {
//   return (
//     <div className="min-h-screen bg-gray-50">
//       <div className="lg:pl-64">
//         <div className="bg-white border-b border-gray-200 px-6 py-4">
//           <div className="h-6 bg-gray-200 rounded animate-pulse w-48"></div>
//         </div>
//         <main className="px-8 py-6">
//           <div className="max-w-7xl mx-auto">
//             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
//               {[...Array(4)].map((_, i) => (
//                 <div key={i} className="bg-white p-6 rounded-lg border border-gray-200">
//                   <div className="h-4 bg-gray-200 rounded animate-pulse mb-4"></div>
//                   <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
//                 </div>
//               ))}
//             </div>
//             <div className="bg-white rounded-lg border border-gray-200 p-6">
//               <div className="h-64 bg-gray-200 rounded animate-pulse"></div>
//             </div>
//           </div>
//         </main>
//       </div>
//     </div>
//   );
// };
