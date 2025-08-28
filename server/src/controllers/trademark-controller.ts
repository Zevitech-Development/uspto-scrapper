import { Request, Response, NextFunction } from "express";
import logger from "../utils/logger";
import Joi from "joi";
import { ExcelService } from "../services/excel-service";
import { JobQueueService } from "../services/job-queue";
import { USPTOService } from "../services/uspto-service";
import { ApiResponse, AppError } from "../types/global-interface";

export class TrademarkController {
  private excelService: ExcelService;
  private jobQueueService: JobQueueService;
  private usptoService: USPTOService;

  constructor() {
    this.excelService = ExcelService.getInstance();
    this.jobQueueService = JobQueueService.getInstance();
    this.usptoService = new USPTOService();
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
      const jobId = await this.jobQueueService.addTrademarkJob(parseResult.serialNumbers, (req as any).user.id);

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
      const jobId = await this.jobQueueService.addTrademarkJob(serialNumbers, (req as any).user.id);

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

  public retryJob = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { jobId } = req.params;

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

      if (!job.results || job.results.length === 0) {
        const response: ApiResponse = {
          success: false, 
          message: "No results available for download",
          error: "No results available",
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
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { status } = req.params;

      const validStatuses = ["pending", "processing", "completed", "failed"];
      if (!validStatuses.includes(status)) {
        throw new AppError(
          `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
          400,
          "INVALID_STATUS"
        );
      }

      const jobs = await this.jobQueueService.getJobsByStatus(status as any);

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
          })),
          count: jobs.length,
        },
        message: `Retrieved ${jobs.length} jobs with status '${status}'`,
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
}
