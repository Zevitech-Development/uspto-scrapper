"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import ApiService from "@/lib/api";
import { TrademarkData } from "@/lib/api";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  FileText,
  Calendar,
  User,
  Hash,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
} from "lucide-react";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

interface TrademarksState {
  trademarks: TrademarkData[];
  pagination: PaginationInfo;
  loading: boolean;
  error: string | null;
  searchTerm: string;
}

const TrademarksPage: React.FC = () => {
  const { user } = useAuth();
  const [state, setState] = useState<TrademarksState>({
    trademarks: [],
    pagination: { page: 1, limit: 20, total: 0, pages: 0 },
    loading: true,
    error: null,
    searchTerm: "",
  });

  const fetchTrademarks = useCallback(
    async (page: number = 1, search?: string) => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        const response = await ApiService.getTrademarks({
          page,
          limit: 20,
          search: search || undefined,
        });

        if (response.success && response.data) {
          setState((prev) => ({
            ...prev,
            trademarks: response.data!.trademarks,
            pagination: response.data!.pagination,
            loading: false,
          }));
        } else {
          setState((prev) => ({
            ...prev,
            error: response.message || "Failed to fetch trademarks",
            loading: false,
          }));
        }
      } catch (error) {
        setState((prev) => ({
          ...prev,
          error: "An error occurred while fetching trademarks",
          loading: false,
        }));
      }
    },
    []
  );

  useEffect(() => {
    fetchTrademarks(1, state.searchTerm);
  }, [fetchTrademarks]);

  const handleSearch = useCallback(
    (searchTerm: string) => {
      setState((prev) => ({ ...prev, searchTerm }));
      fetchTrademarks(1, searchTerm);
    },
    [fetchTrademarks]
  );

  const handlePageChange = useCallback(
    (page: number) => {
      fetchTrademarks(page, state.searchTerm);
    },
    [fetchTrademarks, state.searchTerm]
  );

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case "registered":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "pending":
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case "abandoned":
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const baseClasses = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium";
    switch (status?.toLowerCase()) {
      case "registered":
        return `${baseClasses} bg-green-100 text-green-800`;
      case "pending":
        return `${baseClasses} bg-yellow-100 text-yellow-800`;
      case "abandoned":
        return `${baseClasses} bg-red-100 text-red-800`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-800`;
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Trademark Database</h1>
            <p className="mt-1 text-sm text-gray-500">
              Browse and search through all trademark records
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Search by serial number, mark text, or owner name..."
              value={state.searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Results */}
        <div className="bg-white shadow rounded-lg">
          {/* Stats */}
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-700">
                {state.loading ? (
                  "Loading..."
                ) : (
                  `Showing ${state.trademarks.length} of ${state.pagination.total} trademarks`
                )}
              </p>
              {state.pagination.pages > 1 && (
                <p className="text-sm text-gray-500">
                  Page {state.pagination.page} of {state.pagination.pages}
                </p>
              )}
            </div>
          </div>

          {/* Loading State */}
          {state.loading && (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-sm text-gray-500">Loading trademarks...</p>
            </div>
          )}

          {/* Error State */}
          {state.error && (
            <div className="p-8 text-center">
              <AlertCircle className="mx-auto h-12 w-12 text-red-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">Error</h3>
              <p className="mt-1 text-sm text-gray-500">{state.error}</p>
              <button
                onClick={() => fetchTrademarks(state.pagination.page, state.searchTerm)}
                className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Trademarks List */}
          {!state.loading && !state.error && (
            <>
              {state.trademarks.length === 0 ? (
                <div className="p-8 text-center">
                  <FileText className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">No trademarks found</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {state.searchTerm
                      ? "Try adjusting your search terms"
                      : "No trademark data available"}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {state.trademarks.map((trademark, index) => (
                    <div key={`${trademark.serialNumber}-${index}`} className="p-6 hover:bg-gray-50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-3">
                            <div className="flex items-center space-x-2">
                              <Hash className="w-4 h-4 text-gray-400" />
                              <span className="text-sm font-medium text-gray-900">
                                {trademark.serialNumber}
                              </span>
                            </div>
                            <span className={getStatusBadge(trademark.status)}>
                              {getStatusIcon(trademark.status)}
                              <span className="ml-1">{trademark.status || "Unknown"}</span>
                            </span>
                          </div>
                          
                          {trademark.markText && (
                            <div className="mt-2">
                              <h3 className="text-lg font-semibold text-gray-900">
                                {trademark.markText}
                              </h3>
                            </div>
                          )}
                          
                          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                            {trademark.ownerName && (
                              <div className="flex items-center space-x-2">
                                <User className="w-4 h-4 text-gray-400" />
                                <span className="text-sm text-gray-600">{trademark.ownerName}</span>
                              </div>
                            )}
                            
                            {trademark.filingDate && (
                              <div className="flex items-center space-x-2">
                                <Calendar className="w-4 h-4 text-gray-400" />
                                <span className="text-sm text-gray-600">
                                  Filed: {formatDate(trademark.filingDate)}
                                </span>
                              </div>
                            )}
                          </div>
                          
                          {trademark.errorMessage && (
                            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
                              <p className="text-sm text-red-600">{trademark.errorMessage}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Pagination */}
              {state.pagination.pages > 1 && (
                <div className="px-6 py-4 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => handlePageChange(state.pagination.page - 1)}
                      disabled={state.pagination.page <= 1}
                      className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-4 h-4 mr-1" />
                      Previous
                    </button>
                    
                    <div className="flex items-center space-x-2">
                      {Array.from({ length: Math.min(5, state.pagination.pages) }, (_, i) => {
                        const pageNum = Math.max(
                          1,
                          Math.min(
                            state.pagination.page - 2 + i,
                            state.pagination.pages - 4 + i
                          )
                        );
                        return (
                          <button
                            key={pageNum}
                            onClick={() => handlePageChange(pageNum)}
                            className={`px-3 py-2 text-sm font-medium rounded-md ${
                              pageNum === state.pagination.page
                                ? "bg-blue-600 text-white"
                                : "text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>
                    
                    <button
                      onClick={() => handlePageChange(state.pagination.page + 1)}
                      disabled={state.pagination.page >= state.pagination.pages}
                      className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default TrademarksPage;