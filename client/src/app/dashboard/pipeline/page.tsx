"use client";

import React, { useState, useEffect } from "react";
import {
  Search,
  Loader2,
  CheckCircle,
  AlertCircle,
  Target,
  TrendingUp,
  DollarSign,
  Award,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import ApiService from "@/lib/api";
import { cn } from "@/lib/utils";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import toast, { Toaster } from "react-hot-toast";

interface FormData {
  name: string;
  phone: string;
  email: string;
  trademarkDetails: string;
  abandonedSerialNo: string;
  paymentPlanInterest: boolean;
  comments: string;
  sourceJobId?: string;
}

interface TrademarkData {
  serialNumber: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  trademarkDetails: string | null;
  filingDate: string | null;
  abandonDate: string | null;
  abandonReason: string | null;
}

export default function PipelinePage() {
  const { user } = useAuth();

  const [serialNumber, setSerialNumber] = useState("");
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dataFetched, setDataFetched] = useState(false);

  const [formData, setFormData] = useState<FormData>({
    name: "",
    phone: "",
    email: "",
    trademarkDetails: "",
    abandonedSerialNo: "",
    paymentPlanInterest: false,
    comments: "",
  });

  const [stats, setStats] = useState({
    totalSubmitted: 0,
    converted: 0,
    conversionRate: 0,
    totalRevenue: 0,
  });

  const [myLeads, setMyLeads] = useState<any[]>([]);
  const [showMyLeads, setShowMyLeads] = useState(false);

  useEffect(() => {
    fetchMyStats();
  }, []);

  const fetchMyStats = async () => {
    try {
      const response = await ApiService.getMyPipelineStats();
      if (response.success && response.data) {
        setStats(response.data);
      }
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    }
  };

  const fetchMyLeads = async () => {
    try {
      const response = await ApiService.getMyPipelineLeads();
      if (response.success && response.data) {
        setMyLeads(response.data.leads);
        setShowMyLeads(true);
      }
    } catch (error) {
      console.error("Failed to fetch leads:", error);
      toast.error("Failed to load your leads");
    }
  };

  const handleSerialSearch = async () => {
    if (!serialNumber.trim()) {
      toast.error("Please enter a serial number");
      return;
    }

    setSearching(true);
    setDataFetched(false);

    try {
      const response = await ApiService.getTrademarkBySerial(
        serialNumber.trim()
      );

      if (response.success && response.data) {
        const data: TrademarkData = response.data;

        // Auto-fill form
        setFormData({
          name: data.name || "",
          phone: data.phone || "",
          email: data.email || "",
          trademarkDetails: data.trademarkDetails || "",
          abandonedSerialNo: serialNumber.trim(),
          paymentPlanInterest: false,
          comments: "",
        });

        setDataFetched(true);
        toast.success("Trademark data loaded successfully!");
      } else {
        toast.error("Trademark not found. You can enter details manually.");
        setFormData((prev) => ({
          ...prev,
          abandonedSerialNo: serialNumber.trim(),
        }));
      }
    } catch (error) {
      console.error("Search failed:", error);
      toast.error("Trademark not found. You can enter details manually.");
      setFormData((prev) => ({
        ...prev,
        abandonedSerialNo: serialNumber.trim(),
      }));
    } finally {
      setSearching(false);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;

    if (type === "checkbox") {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData((prev) => ({ ...prev, [name]: checked }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!formData.phone.trim()) {
      toast.error("Phone is required");
      return;
    }
    if (!formData.email.trim()) {
      toast.error("Email is required");
      return;
    }
    if (!formData.trademarkDetails.trim()) {
      toast.error("Trademark details are required");
      return;
    }
    if (!formData.comments.trim() || formData.comments.trim().length < 10) {
      toast.error("Comments must be at least 10 characters");
      return;
    }

    setSubmitting(true);

    try {
      const response = await ApiService.createPipelineLead({
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim(),
        trademarkDetails: formData.trademarkDetails.trim(),
        abandonedSerialNo: formData.abandonedSerialNo.trim() || undefined,
        paymentPlanInterest: formData.paymentPlanInterest,
        comments: formData.comments.trim(),
      });

      if (response.success) {
        toast.success(
          "Lead added to pipeline successfully! Admin has been notified."
        );

        // Reset form
        setFormData({
          name: "",
          phone: "",
          email: "",
          trademarkDetails: "",
          abandonedSerialNo: "",
          paymentPlanInterest: false,
          comments: "",
        });
        setSerialNumber("");
        setDataFetched(false);

        // Refresh stats
        fetchMyStats();
      }
    } catch (error: any) {
      console.error("Submission failed:", error);
      const errorMessage =
        error?.response?.data?.message ||
        error?.message ||
        "Failed to add lead to pipeline";
      toast.error(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setFormData({
      name: "",
      phone: "",
      email: "",
      trademarkDetails: "",
      abandonedSerialNo: "",
      paymentPlanInterest: false,
      comments: "",
    });
    setSerialNumber("");
    setDataFetched(false);
  };

  if (!user) {
    return null;
  }

  return (
    <DashboardLayout title="Pipeline">
      <Toaster position="top-right" />
      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Submitted</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {stats.totalSubmitted}
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <Target className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Converted</p>
                <p className="text-2xl font-bold text-green-900 mt-1">
                  {stats.converted}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Conversion Rate</p>
                <p className="text-2xl font-bold text-purple-900 mt-1">
                  {stats.conversionRate.toFixed(1)}%
                </p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Revenue</p>
                <p className="text-2xl font-bold text-orange-900 mt-1">
                  ${stats.totalRevenue.toLocaleString()}
                </p>
              </div>
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Info Banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <Target className="w-5 h-5 text-blue-600 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-900">
                Add Leads to Pipeline
              </h3>
              <p className="text-sm text-blue-700 mt-1">
                Found a promising lead? Add it to the pipeline and the admin
                team will be notified instantly. You can search by serial number
                for quick auto-fill or enter details manually.
              </p>
            </div>
          </div>
        </div>

        {/* Main Form Card */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-6">
            🎯 Add New Lead to Pipeline
          </h2>

          {/* Serial Number Search */}
          <div className="mb-8">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quick Add by Serial Number
            </label>
            <div className="flex space-x-3">
              <input
                type="text"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSerialSearch()}
                placeholder="Enter Serial Number (e.g., 87654321)"
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={searching}
              />
              <button
                onClick={handleSerialSearch}
                disabled={searching || !serialNumber.trim()}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {searching ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Searching...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5" />
                    <span>Fetch Data</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Enter a serial number to auto-fill lead details from the database
            </p>
          </div>

          {/* Divider */}
          <div className="flex items-center my-8">
            <div className="flex-1 border-t border-gray-300"></div>
            <span className="px-4 text-sm text-gray-500 font-medium">
              OR ENTER MANUALLY
            </span>
            <div className="flex-1 border-t border-gray-300"></div>
          </div>

          {/* Main Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Lead Information Section */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                📋 Lead Information
                {dataFetched && (
                  <span className="ml-3 text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                    ✓ Auto-filled
                  </span>
                )}
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="John Smith"
                    className={cn(
                      "w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500",
                      dataFetched && formData.name
                        ? "border-green-300 bg-green-50"
                        : "border-gray-300"
                    )}
                    required
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="john.smith@example.com"
                    className={cn(
                      "w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500",
                      dataFetched && formData.email
                        ? "border-green-300 bg-green-50"
                        : "border-gray-300"
                    )}
                    required
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    placeholder="+1 (555) 123-4567"
                    className={cn(
                      "w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500",
                      dataFetched && formData.phone
                        ? "border-green-300 bg-green-50"
                        : "border-gray-300"
                    )}
                    required
                  />
                </div>

                {/* Abandoned Serial No */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Abandoned Serial Number
                  </label>
                  <input
                    type="text"
                    name="abandonedSerialNo"
                    value={formData.abandonedSerialNo}
                    onChange={handleInputChange}
                    placeholder="87654321"
                    className={cn(
                      "w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500",
                      dataFetched && formData.abandonedSerialNo
                        ? "border-green-300 bg-green-50"
                        : "border-gray-300"
                    )}
                  />
                </div>
              </div>

              {/* Trademark Details */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Trademark Details <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="trademarkDetails"
                  value={formData.trademarkDetails}
                  onChange={handleInputChange}
                  placeholder="e.g., TECHBRAND for software services"
                  className={cn(
                    "w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500",
                    dataFetched && formData.trademarkDetails
                      ? "border-green-300 bg-green-50"
                      : "border-gray-300"
                  )}
                  required
                />
              </div>

              {/* Payment Plan Interest */}
              <div className="mt-4">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    name="paymentPlanInterest"
                    checked={formData.paymentPlanInterest}
                    onChange={handleInputChange}
                    className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Interested in Payment Plan
                  </span>
                </label>
              </div>
            </div>

            {/* Comments Section */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                💬 Your Comments/Notes
              </h3>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Comments <span className="text-red-500">*</span>
                <span className="text-gray-500 font-normal ml-2">
                  (Minimum 10 characters)
                </span>
              </label>
              <textarea
                name="comments"
                value={formData.comments}
                onChange={handleInputChange}
                placeholder="Add context about this lead: How did you find them? What did they say? What's their situation? Any important details..."
                rows={5}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                minLength={10}
              />
              <p className="text-xs text-gray-500 mt-1">
                {formData.comments.length} characters
                {formData.comments.length < 10 &&
                  ` (${10 - formData.comments.length} more needed)`}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end space-x-4 pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={handleReset}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Reset Form
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <Target className="w-5 h-5" />
                    <span>Submit to Pipeline</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* View My Leads Button */}
        <div className="text-center">
          <button
            onClick={fetchMyLeads}
            className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 inline-flex items-center space-x-2"
          >
            <Award className="w-5 h-5" />
            <span>View My Submitted Leads</span>
          </button>
        </div>

        {/* My Leads List */}
        {showMyLeads && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              My Submitted Leads ({myLeads.length})
            </h3>
            {myLeads.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                You haven&apos;t submitted any leads yet.
              </p>
            ) : (
              <div className="space-y-3">
                {myLeads.map((lead) => (
                  <div
                    key={lead._id}
                    className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold text-gray-900">
                          {lead.name}
                        </h4>
                        <p className="text-sm text-gray-600 mt-1">
                          {lead.trademarkDetails}
                        </p>
                        <p className="text-xs text-gray-500 mt-2">
                          Submitted:{" "}
                          {new Date(lead.submittedDate).toLocaleDateString()}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "px-3 py-1 rounded-full text-xs font-medium",
                          lead.status === "new" && "bg-blue-100 text-blue-800",
                          lead.status === "contacted" &&
                            "bg-yellow-100 text-yellow-800",
                          lead.status === "won" &&
                            "bg-green-100 text-green-800",
                          lead.status === "lost" && "bg-red-100 text-red-800"
                        )}
                      >
                        {lead.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
