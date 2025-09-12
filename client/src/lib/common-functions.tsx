import ApiService from "./api";

export const getStatusBadge = (status: string) => {
  const baseClasses = "px-2 py-1 text-xs font-medium rounded-full";
  switch (status) {
    case "completed":
      return `${baseClasses} bg-green-100 text-green-800`;
    case "processing":
      return `${baseClasses} bg-blue-100 text-blue-800`;
    case "failed":
      return `${baseClasses} bg-red-100 text-red-800`;
    case "pending":
      return `${baseClasses} bg-yellow-100 text-yellow-800`;
    default:
      return `${baseClasses} bg-gray-100 text-gray-800`;
  }
};

export const getStatusText = (status: string) => {
  if (status === "healthy" || status === "ok") return "Operational";
  if (status === "unhealthy" || status === "error") return "Error";
  return "Warning";
};

export const getStatusColor = (status: string) => {
  if (status === "healthy" || status === "ok") return "bg-green-500";
  if (status === "unhealthy" || status === "error") return "bg-red-500";
  return "bg-yellow-500";
};

export const formatDate = (dateString: string) => {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(dateString));
};

export const handleDownload = async (jobId: string) => {
  try {
    const blob = await ApiService.downloadResults(jobId);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trademark_results_${jobId}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (error) {
    console.error("Download failed:", error);
  }
};

export const getInitials = (firstName: string, lastName: string): string => {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
};

export const formatLastLogin = (lastLogin?: Date): string => {
  if (!lastLogin) return "Never";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(lastLogin));
};

