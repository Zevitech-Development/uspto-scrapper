import { Clock, FileText, Upload } from "lucide-react";

export const actions = [
  {
    title: "Upload Excel File",
    description: "Process trademark serial numbers",
    icon: Upload,
    href: "/dashboard/upload",
    color: "bg-blue-500 hover:bg-blue-600",
  },
  {
    title: "Check Job Status",
    description: "Monitor your processing jobs",
    icon: Clock,
    href: "/dashboard/jobs",
    color: "bg-green-500 hover:bg-green-600",
  },
  {
    title: "View History",
    description: "See all your processed files",
    icon: FileText,
    href: "/dashboard/jobs",
    color: "bg-purple-500 hover:bg-purple-600",
  },
];

