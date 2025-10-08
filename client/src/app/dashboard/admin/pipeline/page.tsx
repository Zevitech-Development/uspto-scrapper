"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Target,
  TrendingUp,
  DollarSign,
  Users,
  Loader2,
  AlertCircle,
  CheckCircle,
  Edit2,
  Save,
  X,
  Trash2,
  Archive,
  Phone,
  Mail,
  Calendar,
  Award,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import ApiService from "@/lib/api";
import { cn } from "@/lib/utils";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import toast, { Toaster } from "react-hot-toast";
import { User } from "@/types/api-service-interface";

interface PipelineLead {
  _id: string;
  leadId: string;
  submittedBy: string;
  submittedByName: string;
  sourceJobId?: string;
  submittedDate: string;
  name: string;
  phone: string;
  email: string;
  trademarkDetails: string;
  abandonedSerialNo?: string;
  liveSerialNumber?: string;
  status: "new" | "contacted" | "quoted" | "negotiating" | "won" | "lost";
  priority: "hot" | "warm" | "cold";
  leadScore: number;
  paymentPlanInterest: boolean;
  paymentPlanOffered?: string;
  quotedAmount?: number;
  assignedFront?: string;
  assignedAgent?: string;
  assignedSC?: string;
  assignedBrand?: string;
  upseller?: string;
  upsellDetails?: string;
  upsellAmount?: number;
  nextFollowUpDate?: string;
  lastContactedDate?: string;
  emailsSent: number;
  phoneCallsMade: number;
  convertedToSale: boolean;
  saleAmount?: number;
  conversionDate?: string;
  comments: string;
  adminNotes?: string;
  activities: Array<{
    date: string;
    user: string;
    userName: string;
    action: string;
    notes: string;
  }>;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
}

interface PipelineStats {
  total: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  conversionRate: number;
  totalRevenue: number;
}

export default function AdminPipelinePage() {
  const { user } = useAuth();

  const [leads, setLeads] = useState<PipelineLead[]>([]);
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedPriority, setSelectedPriority] = useState<string>("all");
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<any>({});
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    fetchLeads();
    fetchStats();
    fetchUsers();
  }, [selectedStatus, selectedPriority]);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (selectedStatus !== "all") params.status = selectedStatus;
      if (selectedPriority !== "all") params.priority = selectedPriority;

      const response = await ApiService.getAllPipelineLeads(params);
      if (response.success && response.data) {
        setLeads(response.data.leads);
      }
    } catch (error) {
      console.error("Failed to fetch leads:", error);
      toast.error("Failed to load pipeline leads");
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await ApiService.getPipelineStats();
      if (response.success && response.data) {
        setStats(response.data);
      }
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await ApiService.getAllUsers(1, 100);
      if (response.success && response.data) {
        setUsers(response.data.users);
      }
    } catch (error) {
      console.error("Failed to fetch users:", error);
    }
  };

  const startEditing = (lead: PipelineLead) => {
    setEditingLeadId(lead.leadId);
    setEditFormData({
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      trademarkDetails: lead.trademarkDetails,
      abandonedSerialNo: lead.abandonedSerialNo || "",
      liveSerialNumber: lead.liveSerialNumber || "",
      status: lead.status,
      priority: lead.priority,
      leadScore: lead.leadScore,
      paymentPlanInterest: lead.paymentPlanInterest,
      paymentPlanOffered: lead.paymentPlanOffered || "",
      quotedAmount: lead.quotedAmount || "",
      assignedFront: lead.assignedFront || "",
      assignedAgent: lead.assignedAgent || "",
      assignedSC: lead.assignedSC || "",
      assignedBrand: lead.assignedBrand || "",
      upseller: lead.upseller || "",
      upsellDetails: lead.upsellDetails || "",
      upsellAmount: lead.upsellAmount || "",
      convertedToSale: lead.convertedToSale,
      saleAmount: lead.saleAmount || "",
      adminNotes: lead.adminNotes || "",
    });
  };

  const cancelEditing = () => {
    setEditingLeadId(null);
    setEditFormData({});
  };

  const saveChanges = async (leadId: string) => {
    try {
      const response = await ApiService.updatePipelineLead(
        leadId,
        editFormData
      );

      if (response.success) {
        toast.success("Lead updated successfully!");
        setEditingLeadId(null);
        fetchLeads();
        fetchStats();
      }
    } catch (error) {
      console.error("Update failed:", error);
      toast.error("Failed to update lead");
    }
  };

  const handleDelete = async (leadId: string) => {
    if (!confirm("Permanently delete this lead? This cannot be undone.")) {
      return;
    }

    try {
      const response = await ApiService.deletePipelineLead(leadId);
      if (response.success) {
        toast.success("Lead deleted successfully");
        fetchLeads();
        fetchStats();
      }
    } catch (error) {
      console.error("Delete failed:", error);
      toast.error("Failed to delete lead");
    }
  };

  const handleArchive = async (leadId: string) => {
    if (!confirm("Archive this lead?")) {
      return;
    }

    try {
      const response = await ApiService.archivePipelineLead(leadId);
      if (response.success) {
        toast.success("Lead archived successfully");
        fetchLeads();
        fetchStats();
      }
    } catch (error) {
      console.error("Archive failed:", error);
      toast.error("Failed to archive lead");
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      new: "bg-blue-100 text-blue-800",
      contacted: "bg-yellow-100 text-yellow-800",
      quoted: "bg-purple-100 text-purple-800",
      negotiating: "bg-orange-100 text-orange-800",
      won: "bg-green-100 text-green-800",
      lost: "bg-red-100 text-red-800",
    };

    return (
      <span
        className={cn(
          "px-2 py-1 rounded-full text-xs font-medium",
          styles[status as keyof typeof styles]
        )}
      >
        {status.toUpperCase()}
      </span>
    );
  };

  const getPriorityBadge = (priority: string) => {
    const styles = {
      hot: "bg-red-100 text-red-800 border-red-300",
      warm: "bg-orange-100 text-orange-800 border-orange-300",
      cold: "bg-blue-100 text-blue-800 border-blue-300",
    };

    return (
      <span
        className={cn(
          "px-2 py-1 rounded-full text-xs font-medium border",
          styles[priority as keyof typeof styles]
        )}
      >
        {priority.toUpperCase()}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(dateString));
  };

  const getUserName = (userId: string): string => {
    const foundUser = users.find((u) => u.id === userId);
    if (foundUser) {
      return `${foundUser.firstName} ${foundUser.lastName}`;
    }
    return "Unassigned";
  };

  if (!user || user.role !== "admin") {
    return (
      <DashboardLayout title="Pipeline Management">
        <div className="p-8 text-center">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <p className="text-red-600">Admin access required</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Pipeline Management">
      <Toaster position="top-right" />

      <div className="space-y-6">
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Leads</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">
                    {stats.total}
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
                  <p className="text-sm text-gray-500">Conversion Rate</p>
                  <p className="text-3xl font-bold text-green-900 mt-1">
                    {stats.conversionRate.toFixed(1)}%
                  </p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Revenue</p>
                  <p className="text-3xl font-bold text-purple-900 mt-1">
                    ${stats.totalRevenue.toLocaleString()}
                  </p>
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                  <DollarSign className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Won Deals</p>
                  <p className="text-3xl font-bold text-orange-900 mt-1">
                    {stats.byStatus.won || 0}
                  </p>
                </div>
                <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                  <Award className="w-6 h-6 text-orange-600" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div>
              <label className="text-sm font-medium text-gray-700 mr-2">
                Status:
              </label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All</option>
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="quoted">Quoted</option>
                <option value="negotiating">Negotiating</option>
                <option value="won">Won</option>
                <option value="lost">Lost</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mr-2">
                Priority:
              </label>
              <select
                value={selectedPriority}
                onChange={(e) => setSelectedPriority(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All</option>
                <option value="hot">Hot</option>
                <option value="warm">Warm</option>
                <option value="cold">Cold</option>
              </select>
            </div>

            <div className="ml-auto">
              <button
                onClick={() => {
                  setSelectedStatus("all");
                  setSelectedPriority("all");
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        {/* Leads Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
              <p className="text-gray-500">Loading pipeline leads...</p>
            </div>
          ) : leads.length === 0 ? (
            <div className="p-8 text-center">
              <Target className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 mb-2">No leads found</p>
              <p className="text-sm text-gray-400">
                Leads will appear here when users submit them
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Contact
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Trademark
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Priority
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Submitted By
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Payment
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {leads.map((lead) => (
                    <tr
                      key={lead._id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      {/* Date */}
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(lead.submittedDate)}
                      </td>

                      {/* Name */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        {editingLeadId === lead.leadId ? (
                          <input
                            type="text"
                            value={editFormData.name}
                            onChange={(e) =>
                              setEditFormData({
                                ...editFormData,
                                name: e.target.value,
                              })
                            }
                            className="px-2 py-1 border border-blue-300 rounded text-sm w-full"
                          />
                        ) : (
                          <div>
                            <p className="font-medium text-gray-900">
                              {lead.name}
                            </p>
                            {lead.abandonedSerialNo && (
                              <p className="text-xs text-gray-500">
                                Serial: {lead.abandonedSerialNo}
                              </p>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Contact */}
                      <td className="px-4 py-4 whitespace-nowrap text-sm">
                        {editingLeadId === lead.leadId ? (
                          <div className="space-y-1">
                            <input
                              type="email"
                              value={editFormData.email}
                              onChange={(e) =>
                                setEditFormData({
                                  ...editFormData,
                                  email: e.target.value,
                                })
                              }
                              className="px-2 py-1 border border-blue-300 rounded text-xs w-full"
                            />
                            <input
                              type="tel"
                              value={editFormData.phone}
                              onChange={(e) =>
                                setEditFormData({
                                  ...editFormData,
                                  phone: e.target.value,
                                })
                              }
                              className="px-2 py-1 border border-blue-300 rounded text-xs w-full"
                            />
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex items-center text-gray-600">
                              <Mail className="w-3 h-3 mr-1" />
                              <a
                                href={`mailto:${lead.email}`}
                                className="text-blue-600 hover:underline"
                              >
                                {lead.email}
                              </a>
                            </div>
                            <div className="flex items-center text-gray-600">
                              <Phone className="w-3 h-3 mr-1" />
                              <a
                                href={`tel:${lead.phone}`}
                                className="text-blue-600 hover:underline"
                              >
                                {lead.phone}
                              </a>
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Trademark */}
                      <td className="px-4 py-4 text-sm text-gray-900 max-w-xs">
                        {editingLeadId === lead.leadId ? (
                          <input
                            type="text"
                            value={editFormData.trademarkDetails}
                            onChange={(e) =>
                              setEditFormData({
                                ...editFormData,
                                trademarkDetails: e.target.value,
                              })
                            }
                            className="px-2 py-1 border border-blue-300 rounded text-sm w-full"
                          />
                        ) : (
                          <div
                            className="truncate"
                            title={lead.trademarkDetails}
                          >
                            {lead.trademarkDetails}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        {editingLeadId === lead.leadId ? (
                          <select
                            value={editFormData.status}
                            onChange={(e) =>
                              setEditFormData({
                                ...editFormData,
                                status: e.target.value,
                              })
                            }
                            className="px-2 py-1 border border-blue-300 rounded text-xs"
                          >
                            <option value="new">New</option>
                            <option value="contacted">Contacted</option>
                            <option value="quoted">Quoted</option>
                            <option value="negotiating">Negotiating</option>
                            <option value="won">Won</option>
                            <option value="lost">Lost</option>
                          </select>
                        ) : (
                          getStatusBadge(lead.status)
                        )}
                      </td>

                      {/* Priority */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        {editingLeadId === lead.leadId ? (
                          <select
                            value={editFormData.priority}
                            onChange={(e) =>
                              setEditFormData({
                                ...editFormData,
                                priority: e.target.value,
                              })
                            }
                            className="px-2 py-1 border border-blue-300 rounded text-xs"
                          >
                            <option value="hot">Hot</option>
                            <option value="warm">Warm</option>
                            <option value="cold">Cold</option>
                          </select>
                        ) : (
                          getPriorityBadge(lead.priority)
                        )}
                      </td>

                      {/* Submitted By */}
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                        {lead.submittedByName}
                      </td>

                      {/* Payment */}
                      <td className="px-4 py-4 whitespace-nowrap text-sm">
                        {lead.paymentPlanInterest ? (
                          <span className="text-green-600 font-medium">
                            ✓ Yes
                          </span>
                        ) : (
                          <span className="text-gray-400">No</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-4 whitespace-nowrap text-sm">
                        {editingLeadId === lead.leadId ? (
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => saveChanges(lead.leadId)}
                              className="p-1 text-green-600 hover:bg-green-50 rounded"
                              title="Save"
                            >
                              <Save className="w-4 h-4" />
                            </button>
                            <button
                              onClick={cancelEditing}
                              className="p-1 text-red-600 hover:bg-red-50 rounded"
                              title="Cancel"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => startEditing(lead)}
                              className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                              title="Edit"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleArchive(lead.leadId)}
                              className="p-1 text-purple-600 hover:bg-purple-50 rounded"
                              title="Archive"
                            >
                              <Archive className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(lead.leadId)}
                              className="p-1 text-red-600 hover:bg-red-50 rounded"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
