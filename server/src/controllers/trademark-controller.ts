import { Request, Response, NextFunction } from "express";
import logger from "../utils/logger";
import Joi from "joi";
import { ExcelService } from "../services/excel-service";
import { JobQueueService } from "../services/job-queue";
import { USPTOService } from "../services/uspto-service";
import { ApiResponse, AppError } from "../types/global-interface";
import { NotificationService } from "../services/notification-service";
import { AuthenticatedRequest } from "../middleware/auth-middleware";
import { User } from "../models/user.model";

export class TrademarkController {
  private excelService: ExcelService;
  private jobQueueService: JobQueueService;
  private usptoService: USPTOService;
  private notificationService: NotificationService;

  constructor() {
    this.excelService = ExcelService.getInstance();
    this.jobQueueService = JobQueueService.getInstance();
    this.usptoService = new USPTOService();
    this.notificationService = NotificationService.getInstance();
  }

  public uploadAndProcess = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const file = req.file;
      const { columnName } = req.body;

      if (!file) {
        throw new AppError("No file uploaded", 400, "FILE_MISSING");
      }

      // Validate file
      this.excelService.validateUploadedFile(file);

      logger.info("Processing Excel upload", {
        action: "excel_upload",
        fileName: file.originalname,
        fileSize: file.size,
        columnName,
      });

      // Parse Excel file
      const parseResult = await this.excelService.parseExcelFile(
        file,
        columnName
      );

      // Check if we have valid serial numbers
      if (parseResult.serialNumbers.length === 0) {
        const response: ApiResponse = {
          success: false,
          message: "No valid serial numbers found in the Excel file",
          error: "No valid serial numbers found",
        };
        res.status(400).json(response);
        return;
      }

      // Add job to queue
      const jobId = await this.jobQueueService.addTrademarkJob(
        parseResult.serialNumbers,
        (req as any).user.id
      );

      const response: ApiResponse = {
        success: true,
        data: {
          jobId,
          totalRecords: parseResult.serialNumbers.length,
          validSerialNumbers: parseResult.validSerialNumbers,
          invalidSerialNumbers: parseResult.invalidSerialNumbers,
          fileName: parseResult.fileName,
        },
        message: `Processing started for ${parseResult.serialNumbers.length} trademark serial numbers`,
      };

      res.status(202).json(response);
    } catch (error) {
      next(error);
    }
  };

  public processSerialNumbers = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // Validate request body
      const schema = Joi.object({
        serialNumbers: Joi.array()
          .items(Joi.string().trim().min(6).max(12))
          .min(1)
          .max(1000)
          .required()
          .messages({
            "array.min": "At least one serial number is required",
            "array.max": "Maximum 1000 serial numbers allowed per request",
          }),
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        throw new AppError(error.details[0].message, 400, "VALIDATION_ERROR");
      }

      const { serialNumbers } = value;

      logger.info("Processing serial numbers directly", {
        action: "direct_processing",
        count: serialNumbers.length,
      });

      // Add job to queue
      const jobId = await this.jobQueueService.addTrademarkJob(
        serialNumbers,
        (req as any).user.id
      );

      const response: ApiResponse = {
        success: true,
        data: {
          jobId,
          totalRecords: serialNumbers.length,
        },
        message: `Processing started for ${serialNumbers.length} trademark serial numbers`,
      };

      res.status(202).json(response);
    } catch (error) {
      next(error);
    }
  };

  public getJobStatus = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { jobId } = req.params;
      const user = (req as any).user; // Get authenticated user

      if (!jobId) {
        throw new AppError("Job ID is required", 400, "JOB_ID_MISSING");
      }

      const job = await this.jobQueueService.getJobStatus(jobId);

      if (!job) {
        const response: ApiResponse = {
          success: false,
          message: "Job not found",
          error: "Job not found",
        };
        res.status(404).json(response);
        return;
      }

      // Role-based access control: users can only access their assigned jobs
      if (user.role === "user" && job.assignedTo !== user.id) {
        const response: ApiResponse = {
          success: false,
          message: "Access denied. You can only view jobs assigned to you.",
          error: "INSUFFICIENT_PERMISSIONS",
        };
        res.status(403).json(response);
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: {
          jobId: job.id,
          status: job.status,
          progress: {
            total: job.totalRecords,
            processed: job.processedRecords,
            percentage: Math.round(
              (job.processedRecords / job.totalRecords) * 100
            ),
          },
          results: job.results,
          createdAt: job.createdAt,
          completedAt: job.completedAt,
          errorMessage: job.errorMessage,
        },
        message: "Job status retrieved successfully",
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  public getDetailedJobInfo = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { jobId } = req.params;

      const detailedInfo = await this.jobQueueService.getDetailedJobInfo(jobId);

      if (!detailedInfo.job) {
        const response: ApiResponse = {
          success: false,
          message: "Job not found",
          error: "Job not found",
        };
        res.status(404).json(response);
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: detailedInfo,
        message: "Detailed job information retrieved successfully",
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  public cancelJob = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { jobId } = req.params;
      const user = (req as any).user; // Get authenticated user

      // Check if job exists and user has access
      const job = await this.jobQueueService.getJobStatus(jobId);
      if (!job) {
        const response: ApiResponse = {
          success: false,
          message: "Job not found",
          error: "Job not found",
        };
        res.status(404).json(response);
        return;
      }

      // Role-based access control: users can only cancel their assigned jobs
      if (user.role === "user" && job.assignedTo !== user.id) {
        const response: ApiResponse = {
          success: false,
          message: "Access denied. You can only cancel jobs assigned to you.",
          error: "INSUFFICIENT_PERMISSIONS",
        };
        res.status(403).json(response);
        return;
      }

      const cancelled = await this.jobQueueService.cancelJob(jobId);

      const response: ApiResponse = {
        success: cancelled,
        message: cancelled
          ? "Job cancelled successfully"
          : "Job could not be cancelled",
        error: cancelled ? undefined : "Job not found or already completed",
      };

      res.status(cancelled ? 200 : 400).json(response);
    } catch (error) {
      next(error);
    }
  };

  public removeJob = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { jobId } = req.params;
      const user = (req as any).user; // Get authenticated user

      // Check if job exists and user has access
      const job = await this.jobQueueService.getJobStatus(jobId);
      if (!job) {
        const response: ApiResponse = {
          success: false,
          message: "Job not found",
          error: "Job not found",
        };
        res.status(404).json(response);
        return;
      }

      // Role-based access control: users can only remove their assigned jobs
      if (user.role === "user" && job.assignedTo !== user.id) {
        const response: ApiResponse = {
          success: false,
          message: "Access denied. You can only remove jobs assigned to you.",
          error: "INSUFFICIENT_PERMISSIONS",
        };
        res.status(403).json(response);
        return;
      }

      const removed = await this.jobQueueService.removeJob(jobId);

      const response: ApiResponse = {
        success: removed,
        message: removed
          ? "Job removed successfully"
          : "Job could not be removed",
        error: removed ? undefined : "Job not found or cannot be removed",
      };

      res.status(removed ? 200 : 400).json(response);
    } catch (error) {
      next(error);
    }
  };

  public retryJob = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { jobId } = req.params;
      const user = (req as any).user; // Get authenticated user

      // Check if job exists and user has access
      const job = await this.jobQueueService.getJobStatus(jobId);
      if (!job) {
        const response: ApiResponse = {
          success: false,
          message: "Job not found",
          error: "Job not found",
        };
        res.status(404).json(response);
        return;
      }

      // Role-based access control: users can only retry their assigned jobs
      if (user.role === "user" && job.assignedTo !== user.id) {
        const response: ApiResponse = {
          success: false,
          message: "Access denied. You can only retry jobs assigned to you.",
          error: "INSUFFICIENT_PERMISSIONS",
        };
        res.status(403).json(response);
        return;
      }

      const retried = await this.jobQueueService.retryJob(jobId);

      const response: ApiResponse = {
        success: retried,
        message: retried
          ? "Job retry initiated successfully"
          : "Job could not be retried",
        error: retried ? undefined : "Job not found or not in failed state",
      };

      res.status(retried ? 200 : 400).json(response);
    } catch (error) {
      next(error);
    }
  };

  public downloadResults = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { jobId } = req.params;
      const user = (req as any).user; // Get authenticated user

      const job = await this.jobQueueService.getJobStatus(jobId);

      logger.info("Download request for job", {
        jobId,
        status: job?.status,
        userId: user?.id,
      });

      if (!job) {
        const response: ApiResponse = {
          success: false,
          message: "Job not found",
          error: "Job not found",
        };
        res.status(404).json(response);
        return;
      }

      const assignedToString = job.assignedTo?.toString();
      const userIdString = user.id.toString();

      // CHECK: User can only download if job is assigned to them OR they are admin
      if (user.role !== "admin" && assignedToString !== userIdString) {
        logger.warn("Access denied for download", {
          jobId,
          userId: user.id,
          assignedTo: job.assignedTo,
          assignedToString,
          userIdString,
        });

        const response: ApiResponse = {
          success: false,
          message: "You do not have access to this job",
          error: "Access denied",
        };
        res.status(403).json(response);
        return;
      }

      if (job.status !== "completed") {
        const response: ApiResponse = {
          success: false,
          message: "Job is not completed yet",
          error: "Job not ready for download",
        };
        res.status(400).json(response);
        return;
      }

      if (!job.results || job.results.length === 0) {
        const response: ApiResponse = {
          success: false,
          message: "No results available for download",
          error: "No results available",
        };
        res.status(400).json(response);
        return;
      }

      // If user (not admin) downloads, trigger notification
      if (user.role !== "admin" && job.assignedTo === user.id) {
        await this.jobQueueService.notifyDownload(jobId, user.id);
      }

      // Generate Excel file
      const { buffer, fileName } = this.excelService.generateResultsExcel(
        job.results,
        `job_${jobId}`
      );

      res.set({
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": buffer.length.toString(),
      });

      res.send(buffer);
    } catch (error) {
      next(error);
    }
  };

  public getQueueStats = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const stats = await this.jobQueueService.getQueueStats();
      const processingInfo = this.jobQueueService.getProcessingInfo();

      const response: ApiResponse = {
        success: true,
        data: {
          queue: stats,
          processing: processingInfo,
          timestamp: new Date().toISOString(),
        },
        message: "Queue statistics retrieved successfully",
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  public getJobsByStatus = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { status } = req.params;

      if (!req.user) {
        throw new AppError("Authentication required", 401, "NOT_AUTHENTICATED");
      }

      const validStatuses = ["pending", "processing", "completed", "failed"];
      if (!validStatuses.includes(status)) {
        throw new AppError(
          `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
          400,
          "INVALID_STATUS"
        );
      }

      let jobs;

      // Role-based access control
      if (req.user.role === "admin") {
        // Admins can see all jobs
        jobs = await this.jobQueueService.getJobsByStatus(status as any);
      } else {
        // Regular users can only see jobs assigned to them
        jobs = await this.jobQueueService.getJobsByStatusForUser(
          status as any,
          req.user.id
        );
      }

      const response: ApiResponse = {
        success: true,
        data: {
          jobs: jobs.map((job) => ({
            id: job.id,
            status: job.status,
            totalRecords: job.totalRecords,
            processedRecords: job.processedRecords,
            createdAt: job.createdAt,
            completedAt: job.completedAt,
            errorMessage: job.errorMessage,
            results: job.results,

            assignedTo: job.assignedTo,
            userStatus: job.userStatus,
            assignedAt: job.assignedAt,
            downloadedAt: job.downloadedAt,
            workStartedAt: job.workStartedAt,
            finishedAt: job.finishedAt,
          })),
          count: jobs.length,
        },
        message: `Retrieved ${jobs.length} jobs with status '${status}' for ${req.user.role}`,
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  public healthCheck = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const queueHealth = await this.jobQueueService.healthCheck();
      const usptoHealth = await this.usptoService.healthCheck();

      const overallStatus =
        queueHealth.status === "healthy" && usptoHealth.status === "ok"
          ? "healthy"
          : "unhealthy";

      const response = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        services: {
          queue: queueHealth,
          uspto: usptoHealth,
        },
      };

      res.status(overallStatus === "healthy" ? 200 : 503).json(response);
    } catch (error) {
      next(error);
    }
  };

  public getSingleTrademark = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { serialNumber } = req.params;

      if (!serialNumber) {
        throw new AppError(
          "Serial number is required",
          400,
          "SERIAL_NUMBER_MISSING"
        );
      }

      logger.info("Fetching single trademark", {
        action: "single_trademark",
        serialNumber,
      });

      const result = await this.usptoService.fetchTrademarkData(serialNumber);

      const response: ApiResponse = {
        success: true,
        data: result,
        message: "Trademark data retrieved successfully",
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  public assignJobToUser = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { jobId } = req.params;
      const { userId } = req.body;

      if (!req.user) {
        throw new AppError("Authentication required", 401, "NOT_AUTHENTICATED");
      }

      if (!userId) {
        throw new AppError("User ID is required", 400, "USER_ID_MISSING");
      }

      logger.info("Assigning job to user", {
        action: "assign_job",
        jobId,
        assignedTo: userId,
        assignedBy: req.user.id,
      });

      // Assign job (will implement in job-queue service)
      const assignedJob = await this.jobQueueService.assignJobToUser(
        jobId,
        userId,
        req.user.id
      );

      if (!assignedJob) {
        throw new AppError("Failed to assign job", 500, "ASSIGNMENT_FAILED");
      }

      const response: ApiResponse = {
        success: true,
        data: assignedJob,
        message: "Job assigned successfully",
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  public getJobAssignments = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const assignments = await this.jobQueueService.getJobAssignments();

      const response: ApiResponse = {
        success: true,
        data: { assignments, count: assignments.length },
        message: "Job assignments retrieved successfully",
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  public getMyAssignedJobs = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError("Authentication required", 401, "NOT_AUTHENTICATED");
      }

      const jobs = await this.jobQueueService.getJobsAssignedToUser(
        req.user.id
      );

      const response: ApiResponse = {
        success: true,
        data: { jobs, count: jobs.length },
        message: "Assigned jobs retrieved successfully",
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  public updateJobUserStatus = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { jobId } = req.params;
      const { status } = req.body;

      if (!req.user) {
        throw new AppError("Authentication required", 401, "NOT_AUTHENTICATED");
      }

      const validStatuses = ["downloaded", "working", "finished"];
      if (!validStatuses.includes(status)) {
        throw new AppError(
          `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
          400,
          "INVALID_STATUS"
        );
      }

      logger.info("Updating job user status", {
        action: "update_job_status",
        jobId,
        userId: req.user.id,
        newStatus: status,
      });

      const updatedJob = await this.jobQueueService.updateJobUserStatus(
        jobId,
        req.user.id,
        status
      );

      if (!updatedJob) {
        throw new AppError("Failed to update job status", 500, "UPDATE_FAILED");
      }

      const response: ApiResponse = {
        success: true,
        data: updatedJob,
        message: `Job marked as ${status}`,
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  public getUserTimeline = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { userId } = req.params;

      if (!userId) {
        throw new AppError("User ID is required", 400, "USER_ID_MISSING");
      }

      const user = await User.findById(userId);
      if (!user) {
        throw new AppError("User not found", 404, "USER_NOT_FOUND");
      }

      const jobs = await this.jobQueueService.getJobsAssignedToUser(userId);

      // Calculate timeline data
      const timeline = jobs.map((job) => {
        let downloadTime = null;
        let workDuration = null;
        let totalTime = null;

        if (job.downloadedAt && job.assignedAt) {
          downloadTime =
            new Date(job.downloadedAt).getTime() -
            new Date(job.assignedAt).getTime();
        }

        if (job.workStartedAt && job.downloadedAt) {
          const startDelay =
            new Date(job.workStartedAt).getTime() -
            new Date(job.downloadedAt).getTime();
        }

        if (job.finishedAt && job.workStartedAt) {
          workDuration =
            new Date(job.finishedAt).getTime() -
            new Date(job.workStartedAt).getTime();
        }

        if (job.finishedAt && job.assignedAt) {
          totalTime =
            new Date(job.finishedAt).getTime() -
            new Date(job.assignedAt).getTime();
        }

        return {
          jobId: job.id,
          totalRecords: job.totalRecords,
          assignedAt: job.assignedAt,
          downloadedAt: job.downloadedAt,
          workStartedAt: job.workStartedAt,
          finishedAt: job.finishedAt,
          status: job.userStatus,
          downloadTime, // milliseconds
          workDuration, // milliseconds
          totalTime, // milliseconds
        };
      });

      // Calculate summary stats
      const completedJobs = timeline.filter((j) => j.status === "finished");
      const avgCompletionTime =
        completedJobs.length > 0
          ? completedJobs.reduce((sum, j) => sum + (j.totalTime || 0), 0) /
            completedJobs.length
          : 0;

      const fastestJob =
        completedJobs.length > 0
          ? Math.min(...completedJobs.map((j) => j.totalTime || Infinity))
          : 0;

      const response: ApiResponse = {
        success: true,
        data: {
          user: {
            id: user._id.toString(),
            name: user.getFullName(),
            email: user.email,
          },
          timeline,
          stats: {
            totalJobs: jobs.length,
            completedJobs: completedJobs.length,
            inProgressJobs: timeline.filter((j) => j.status === "working")
              .length,
            avgCompletionTime, // milliseconds
            fastestJob, // milliseconds
          },
        },
        message: "User timeline retrieved successfully",
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };
}
