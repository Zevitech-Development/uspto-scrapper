"use client";

import React, { useState, useEffect, useCallback } from "react";
import ApiService from "@/lib/api";
import { TrademarkData } from "@/lib/api";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Hash,
  User,
  Calendar,
  FileText,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  Download,
  Search,
} from "lucide-react";

interface TrademarkSidebarProps {
  jobId: string | null;
  isOpen: boolean;
  onClose: () => void;
  jobInfo?: {
    jobId: string;
    status: string;
    totalRecords: number;
    processedRecords: number;
    createdAt: string;
    completedAt?: string;
  };
}

interface SidebarState {
  trademarks: TrademarkData[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  loading: boolean;
  error: string | null;
  searchTerm: string;
}

const TrademarkSidebar: React.FC<TrademarkSidebarProps> = ({
  jobId,
  isOpen,
  onClose,
  jobInfo,
}) => {
  const [state, setState] = useState<SidebarState>({
    trademarks: [],
    pagination: { page: 1, limit: 10, total: 0, pages: 0 },
    loading: false,
    error: null,
    searchTerm: "",
  });

  const fetchTrademarks = useCallback(
    async (page: number = 1) => {
      if (!jobId) return;
      
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        const response = await ApiService.getTrademarksByJobId(jobId, {
          page,
          limit: 10,
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
            error: response.message || "Failed to fetch trademark data",
            loading: false,
          }));
        }
      } catch (error) {
        setState((prev) => ({
          ...prev,
          error: "An error occurred while fetching trademark data",
          loading: false,
        }));
      }
    },
    [jobId]
  );

  useEffect(() => {
    if (isOpen && jobId) {
      fetchTrademarks(1);
    }
  }, [isOpen, jobId, fetchTrademarks]);

  const handlePageChange = useCallback(
    (page: number) => {
      fetchTrademarks(page);
    },
    [fetchTrademarks]
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
    const baseClasses = "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium";
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

  const handleDownload = async () => {
    if (!jobId) return;
    
    try {
      const response = await ApiService.downloadResults(jobId);
      if (response) {
        const url = window.URL.createObjectURL(response);
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = url;
        a.download = `trademark-results-${jobId}.xlsx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />
      
      {/* Sidebar */}
      <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900">Trademark Data</h2>
            <p className="text-sm text-gray-500">Job ID: {jobId}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-md transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Job Info */}
        {jobInfo && (
          <div className="p-4 bg-gray-50 border-b border-gray-200">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Status:</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  jobInfo.status === "completed"
                    ? "bg-green-100 text-green-800"
                    : jobInfo.status === "failed"
                    ? "bg-red-100 text-red-800"
                    : jobInfo.status === "processing"
                    ? "bg-blue-100 text-blue-800"
                    : "bg-gray-100 text-gray-800"
                }`}>
                  {jobInfo.status}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Progress:</span>
                <span className="text-sm text-gray-600">
                  {jobInfo.processedRecords} / {jobInfo.totalRecords}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Created:</span>
                <span className="text-sm text-gray-600">
                  {formatDate(jobInfo.createdAt)}
                </span>
              </div>
              {jobInfo.completedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Completed:</span>
                  <span className="text-sm text-gray-600">
                    {formatDate(jobInfo.completedAt)}
                  </span>
                </div>
              )}
            </div>
            
            {jobInfo.status === "completed" && (
              <button
                onClick={handleDownload}
                className="mt-3 w-full inline-flex items-center justify-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <Download className="w-4 h-4 mr-2" />
                Download Excel
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Stats */}
          <div className="p-4 border-b border-gray-200">
            <p className="text-sm text-gray-700">
              {state.loading ? (
                "Loading..."
              ) : (
                `${state.trademarks.length} of ${state.pagination.total} records`
              )}
            </p>
          </div>

          {/* Loading State */}
          {state.loading && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="mt-2 text-sm text-gray-500">Loading trademark data...</p>
              </div>
            </div>
          )}

          {/* Error State */}
          {state.error && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center p-4">
                <AlertCircle className="mx-auto h-12 w-12 text-red-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">Error</h3>
                <p className="mt-1 text-sm text-gray-500">{state.error}</p>
                <button
                  onClick={() => fetchTrademarks(state.pagination.page)}
                  className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}

          {/* Trademark List */}
          {!state.loading && !state.error && (
            <>
              <div className="flex-1 overflow-y-auto">
                {state.trademarks.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center p-4">
                      <FileText className="mx-auto h-12 w-12 text-gray-400" />
                      <h3 className="mt-2 text-sm font-medium text-gray-900">No data found</h3>
                      <p className="mt-1 text-sm text-gray-500">
                        No trademark data available for this job
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {state.trademarks.map((trademark, index) => (
                      <div key={`${trademark.serialNumber}-${index}`} className="p-4">
                        <div className="space-y-3">
                          {/* Serial Number and Status */}
                          <div className="flex items-center justify-between">
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
                          
                          {/* Mark Text */}
                          {trademark.markText && (
                            <div>
                              <h4 className="text-sm font-semibold text-gray-900">
                                {trademark.markText}
                              </h4>
                            </div>
                          )}
                          
                          {/* Owner */}
                          {trademark.ownerName && (
                            <div className="flex items-center space-x-2">
                              <User className="w-4 h-4 text-gray-400" />
                              <span className="text-xs text-gray-600">{trademark.ownerName}</span>
                            </div>
                          )}
                          
                          {/* Filing Date */}
                          {trademark.filingDate && (
                            <div className="flex items-center space-x-2">
                              <Calendar className="w-4 h-4 text-gray-400" />
                              <span className="text-xs text-gray-600">
                                Filed: {formatDate(trademark.filingDate)}
                              </span>
                            </div>
                          )}
                          
                          {/* Error Message */}
                          {trademark.errorMessage && (
                            <div className="p-2 bg-red-50 border border-red-200 rounded">
                              <p className="text-xs text-red-600">{trademark.errorMessage}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Pagination */}
              {state.pagination.pages > 1 && (
                <div className="p-4 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => handlePageChange(state.pagination.page - 1)}
                      disabled={state.pagination.page <= 1}
                      className="inline-flex items-center px-3 py-1 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    
                    <span className="text-sm text-gray-700">
                      {state.pagination.page} / {state.pagination.pages}
                    </span>
                    
                    <button
                      onClick={() => handlePageChange(state.pagination.page + 1)}
                      disabled={state.pagination.page >= state.pagination.pages}
                      className="inline-flex items-center px-3 py-1 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default TrademarkSidebar;