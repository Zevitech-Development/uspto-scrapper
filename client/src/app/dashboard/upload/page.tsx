"use client";

import React, { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  FileText,
  AlertCircle,
  CheckCircle,
  X,
  Plus,
  Loader2,
} from "lucide-react";
import ApiService from "@/lib/api";
import { cn } from "@/lib/utils";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import toast, { Toaster } from "react-hot-toast";

interface UploadState {
  file: File | null;
  columnName: string;
  isUploading: boolean;
  error: string | null;
  success: string | null;
  dragActive: boolean;
}

interface SerialNumbersInput {
  serialNumbers: string[];
  isProcessing: boolean;
  error: string | null;
}

export default function UploadPage() {
  const router = useRouter();
  const [uploadState, setUploadState] = useState<UploadState>({
    file: null,
    columnName: "",
    isUploading: false,
    error: null,
    success: null,
    dragActive: false,
  });

  const [serialInput, setSerialInput] = useState<SerialNumbersInput>({
    serialNumbers: [],
    isProcessing: false,
    error: null,
  });

  const [manualInput, setManualInput] = useState("");

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setUploadState((prev) => ({ ...prev, dragActive: true }));
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setUploadState((prev) => ({ ...prev, dragActive: false }));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setUploadState((prev) => ({ ...prev, dragActive: false }));

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, []);

  const handleFileSelect = (file: File) => {
    const allowedTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
    ];

    if (!allowedTypes.includes(file.type)) {
      setUploadState((prev) => ({
        ...prev,
        error: "Please upload an Excel file (.xlsx, .xls) or CSV file",
        file: null,
      }));
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setUploadState((prev) => ({
        ...prev,
        error: "File size must be less than 10MB",
        file: null,
      }));
      return;
    }

    setUploadState((prev) => ({
      ...prev,
      file,
      error: null,
      success: null,
    }));
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleFileUpload = async () => {
    if (!uploadState.file) return;

    setUploadState((prev) => ({ ...prev, isUploading: true, error: null }));

    try {
      const response = await ApiService.uploadFile(
        uploadState.file,
        uploadState.columnName || undefined
      );

      if (response.success) {
        const jobId = response.data?.jobId;

        setUploadState((prev) => ({
          ...prev,
          success: `Upload successful! Processing ${response.data?.totalRecords} records.`,
          error: null,
        }));

        // ✅ WAIT FOR JOB TO BE INDEXED, THEN REDIRECT
        setTimeout(async () => {
          if (!jobId) return;
          try {
            await ApiService.getJobStatus(jobId);
            router.push(`/dashboard/jobs?highlight=${jobId}`);
          } catch (error) {
            // If job not found yet, wait a bit more
            setTimeout(() => {
              router.push(`/dashboard/jobs?highlight=${jobId}`);
            }, 1500);
          }
        }, 1000);
      }
    } catch (error) {
      setUploadState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Upload failed",
        success: null,
      }));
    } finally {
      setUploadState((prev) => ({ ...prev, isUploading: false }));
    }
  };

  const handleSerialNumbersSubmit = async () => {
    const serialNumbers = manualInput
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (serialNumbers.length === 0) {
      setSerialInput((prev) => ({
        ...prev,
        error: "Please enter at least one serial number",
      }));
      return;
    }

    setSerialInput((prev) => ({ ...prev, isProcessing: true, error: null }));

    try {
      const response = await ApiService.processSerialNumbers(serialNumbers);

      if (response.success) {
        const jobId = response.data?.jobId;
        if (!jobId) return;
        setTimeout(async () => {
          try {
            await ApiService.getJobStatus(jobId);
            router.push(`/dashboard/jobs?highlight=${jobId}`);
          } catch (error) {
            setTimeout(() => {
              router.push(`/dashboard/jobs?highlight=${jobId}`);
            }, 1500);
          }
        }, 1000);
      }
    } catch (error) {
      setSerialInput((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Processing failed",
        isProcessing: false,
      }));
    }
  };

  const removeFile = () => {
    setUploadState((prev) => ({
      ...prev,
      file: null,
      error: null,
      success: null,
    }));
  };

  return (
    <DashboardLayout title="Upload & Process">
      <Toaster position="top-right" />
      <div className="space-y-8">
        {/* File Upload Section */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Upload Excel File
          </h2>

          {/* Drag & Drop Area */}
          <div
            className={cn(
              "relative border-2 border-dashed rounded-lg p-8 text-center transition-colors",
              uploadState.dragActive
                ? "border-blue-400 bg-blue-50"
                : "border-gray-300 hover:border-gray-400"
            )}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <input
              type="file"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileInputChange}
              disabled={uploadState.isUploading}
            />

            {uploadState.file ? (
              <div className="space-y-4">
                <div className="flex items-center justify-center space-x-2">
                  <FileText className="w-8 h-8 text-blue-600" />
                  <span className="text-lg font-medium text-gray-900">
                    {uploadState.file.name}
                  </span>
                  <button
                    onClick={removeFile}
                    className="p-1 text-red-600 hover:text-red-700"
                    disabled={uploadState.isUploading}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-sm text-gray-500">
                  Size: {(uploadState.file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <Upload className="w-12 h-12 text-gray-400 mx-auto" />
                <div>
                  <p className="text-lg font-medium text-gray-900">
                    Drop your Excel file here, or click to browse
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    Supports .xlsx, .xls, and .csv files up to 10MB
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Column Name Input */}
          {uploadState.file && (
            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Column Name (Optional)
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., Serial Number, Application Number"
                value={uploadState.columnName}
                onChange={(e) =>
                  setUploadState((prev) => ({
                    ...prev,
                    columnName: e.target.value,
                  }))
                }
                disabled={uploadState.isUploading}
              />
              <p className="text-xs text-gray-500 mt-1">
                Leave empty for automatic column detection
              </p>
            </div>
          )}

          {/* Upload Button */}
          {uploadState.file && (
            <div className="mt-6">
              <button
                onClick={handleFileUpload}
                disabled={uploadState.isUploading}
                className={cn(
                  "w-full py-3 px-4 rounded-md font-medium text-white transition-colors",
                  uploadState.isUploading
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                )}
              >
                {uploadState.isUploading ? (
                  <div className="flex items-center justify-center space-x-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Uploading...</span>
                  </div>
                ) : (
                  "Start Processing"
                )}
              </button>
            </div>
          )}

          {/* Messages */}
          {uploadState.error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-red-700 text-sm">{uploadState.error}</p>
            </div>
          )}

          {uploadState.success && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md flex items-center space-x-2">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
              <p className="text-green-700 text-sm">{uploadState.success}</p>
            </div>
          )}
        </div>

        {/* Manual Input Section */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Or Enter Serial Numbers Manually
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Serial Numbers (one per line)
              </label>
              <textarea
                className="w-full h-32 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                placeholder="99344668&#10;88000001&#10;88000002"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                disabled={serialInput.isProcessing}
              />
            </div>

            <button
              onClick={handleSerialNumbersSubmit}
              disabled={serialInput.isProcessing || !manualInput.trim()}
              className={cn(
                "w-full py-3 px-4 rounded-md font-medium text-white transition-colors",
                serialInput.isProcessing || !manualInput.trim()
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
              )}
            >
              {serialInput.isProcessing ? (
                <div className="flex items-center justify-center space-x-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing...</span>
                </div>
              ) : (
                "Process Serial Numbers"
              )}
            </button>

            {serialInput.error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-center space-x-2">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <p className="text-red-700 text-sm">{serialInput.error}</p>
              </div>
            )}
          </div>
        </div>

        {/* Usage Guidelines */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-3">
            Usage Guidelines
          </h3>
          <ul className="text-sm text-blue-700 space-y-2">
            <li className="flex items-start space-x-2">
              <span className="text-blue-600 mt-0.5">•</span>
              <span>
                Excel files should contain trademark serial numbers in any
                column
              </span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-blue-600 mt-0.5">•</span>
              <span>
                Processing time is approximately 1 minute per 50 serial numbers
              </span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-blue-600 mt-0.5">•</span>
              <span>
                You&apos;ll receive real-time progress updates during processing
              </span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-blue-600 mt-0.5">•</span>
              <span>
                Results can be downloaded as Excel files once processing is
                complete
              </span>
            </li>
          </ul>
        </div>
      </div>
    </DashboardLayout>
  );
}
