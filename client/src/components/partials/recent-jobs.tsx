import ApiService, { ProcessingJob } from "@/lib/api";
import {
  formatDate,
  getStatusBadge,
  handleDownload,
} from "@/lib/common-functions";
import { Download, Eye, FileText } from "lucide-react";
import React, { useEffect, useState } from "react";

const RecentJobs = () => {
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const [completedJobs, processingJobs] = await Promise.all([
          ApiService.getJobsByStatus("completed"),
          ApiService.getJobsByStatus("processing"),
        ]);

        const allJobs = [
          ...(processingJobs.data?.jobs || []),
          ...(completedJobs.data?.jobs || []),
        ].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        setJobs(allJobs.slice(0, 5));
      } catch (error) {
        console.error("Failed to fetch jobs:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchJobs();
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            My Recent Jobs
          </h3>
        </div>
        <div className="p-6 space-y-4">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
            >
              <div className="flex-1">
                <div className="h-4 bg-gray-200 rounded animate-pulse mb-2"></div>
                <div className="h-3 bg-gray-200 rounded animate-pulse w-24"></div>
              </div>
              <div className="h-6 bg-gray-200 rounded animate-pulse w-16"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">My Recent Jobs</h3>
      </div>
      <div className="p-6">
        {jobs.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">
              No jobs yet. Upload a file to get started!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center space-x-3">
                    <p className="font-medium text-gray-900">
                      Job #{job.id.slice(0, 8)}
                    </p>
                    <span className={getStatusBadge(job.status)}>
                      {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {job.totalRecords} records • {formatDate(job.createdAt)}
                  </p>
                  {job.status === "processing" && (
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.round(
                            (job.processedRecords / job.totalRecords) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                    title="View Details"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  {job.status === "completed" && job.results?.length > 0 && (
                    <button
                      onClick={() => handleDownload(job.id)}
                      className="p-2 text-blue-600 hover:text-blue-700 rounded-full hover:bg-blue-50"
                      title="Download Results"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default RecentJobs;
