import Bull from "bull";
import Redis from "ioredis";
import { v4 as uuidv4 } from "uuid";
import { USPTOService } from "./uspto-service";
import { ProcessingJob, TrademarkData } from "../types/global-interface";
import config from "../config/config";
import logger from "../utils/logger";
import { ProcessingJobModel, Trademark } from "../models/trademark.model";

interface JobData {
  jobId: string;
  serialNumbers: string[];
  userId: string;
}

interface JobProgress {
  processed: number;
  total: number;
  currentSerial?: string;
}

export class JobQueueService {
  private static instance: JobQueueService;
  private queue: Bull.Queue<JobData>;
  private redis: Redis;
  private usptoService: USPTOService;
  private jobs: Map<string, ProcessingJob> = new Map();

  private constructor() {
    this.redis = new Redis(config.get("redisUri"), {
      tls: {},
    });
    this.usptoService = new USPTOService();
    this.queue = this.createQueue();
    this.setupJobProcessors();
  }

  public static getInstance(): JobQueueService {
    if (!JobQueueService.instance) {
      JobQueueService.instance = new JobQueueService();
    }
    return JobQueueService.instance;
  }

  /**
   * Create Bull queue for processing trademark jobs
   */
  private createQueue(): Bull.Queue<JobData> {
    const queue = new Bull<JobData>("trademark-processing", {
      redis: {
        port: 6379,
        host: "deep-crappie-47918.upstash.io",
        password:
          "AbsuAAIncDEzN2UxNDNlNWQ3NWE0NzhmYTFhODBlYzEyZjU2NjE3OXAxNDc5MTg",
        username: "default",
        tls: {}, // 👈 this makes it work with Upstash
      },
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 100,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
      },
    });

    return queue;
  }

  /**
   * Set up job processors and event listeners
   */
  private setupJobProcessors(): void {
    // Process jobs with concurrency of 1 to respect rate limits
    this.queue.process(
      "process-trademarks",
      1,
      this.processTrademarkJob.bind(this)
    );

    // Event listeners for job lifecycle
    this.queue.on("completed", async (job, result) => {
      logger.info("Job completed successfully", {
        action: "job_completed",
        jobId: job.data.jobId,
        duration: Date.now() - job.timestamp,
        totalRecords: job.data.serialNumbers.length,
      });

      // Force update Redis job status to completed
      await this.updateJobStatus(job.data.jobId, "completed");
    });

    this.queue.on("failed", async (job, error) => {
      logger.error("Job failed", error, {
        action: "job_failed",
        jobId: job?.data?.jobId,
        attempts: job?.attemptsMade,
        maxAttempts: job?.opts.attempts,
      });

      if (job?.data?.jobId) {
        await this.updateJobStatus(job.data.jobId, "failed", {
          errorMessage: error.message,
        });
      }
    });

    this.queue.on("progress", (job, progress: JobProgress) => {
      if (job.data.jobId) {
        this.updateJobProgress(
          job.data.jobId,
          progress.processed,
          progress.total
        );

        logger.jobProgress(job.data.jobId, progress.processed, progress.total);
      }
    });

    this.queue.on("stalled", (job) => {
      logger.warn("Job stalled", {
        action: "job_stalled",
        jobId: job?.data?.jobId,
        stalledCount: 1,
      });
    });
  }

  /**
   * Add a new trademark processing job to the queue
   */
  public async addTrademarkJob(
    serialNumbers: string[],
    userId: string
  ): Promise<string> {
    const jobId = uuidv4();

    try {
      // Create job record
      const job: ProcessingJob = {
        id: jobId,
        serialNumbers,
        status: "pending",
        results: [],
        totalRecords: serialNumbers.length,
        processedRecords: 0,
        createdAt: new Date(),
      };

      // Store job in memory and Redis
      this.jobs.set(jobId, job);
      await this.redis.setex(`job:${jobId}`, 600, JSON.stringify(job));
      await this.saveJobToMongoDB(jobId, userId, serialNumbers);

      // Add to Bull queue
      await this.queue.add(
        "process-trademarks",
        {
          jobId,
          serialNumbers,
          userId,
        },
        {
          jobId: `trademark-job-${jobId}`,
          delay: 0,
        }
      );

      logger.info("Added trademark processing job to queue", {
        action: "job_added",
        jobId,
        totalRecords: serialNumbers.length,
      });

      return jobId;
    } catch (error) {
      logger.error("Failed to add job to queue", error as Error, { jobId });
      throw error;
    }
  }

  /**
   * Process a trademark job (Bull job processor)
   */
  private async processTrademarkJob(job: Bull.Job<JobData>): Promise<void> {
    const { jobId, serialNumbers } = job.data;
    const startTime = Date.now();

    try {
      logger.info("Starting trademark job processing", {
        action: "job_start",
        jobId,
        totalRecords: serialNumbers.length,
      });

      // Update job status to processing
      await this.updateJobStatus(jobId, "processing");

      // Process serial numbers with progress updates
      const results = await this.usptoService.fetchMultipleTrademarkData(
        serialNumbers,
        async (processed, total) => {
          // Update Bull job progress
          job.progress({
            processed,
            total,
            percentage: Math.round((processed / total) * 100),
            currentSerial: serialNumbers[processed - 1],
          });

          // Update stored job progress in Redis and MongoDB
          await this.updateJobProgress(jobId, processed, total);
        }
      );

      // Update job with results
      const duration = Date.now() - startTime;
      const successCount = results.filter((r) => r.status === "success").length;

      await this.updateJobStatus(jobId, "completed", {
        results,
        completedAt: new Date(),
      });

      await this.saveTrademarkDataToMongoDB(results);

      logger.jobCompleted(jobId, serialNumbers.length, successCount, duration);
    } catch (error) {
      logger.error("Error processing trademark job", error as Error, { jobId });

      await this.updateJobStatus(jobId, "failed", {
        errorMessage: (error as Error).message,
        completedAt: new Date(),
      });

      throw error; // Re-throw to mark Bull job as failed
    }
  }

  /**
   * Get job status and results
   */
  public async getJobStatus(jobId: string): Promise<ProcessingJob | null> {
    try {
      // First check MongoDB as primary source
      let job = await this.getJobFromMongoDB(jobId);

      // If not in MongoDB, check memory cache
      if (!job) {
        job = this.jobs.get(jobId) || null;
      }

      // If not in memory, check Redis as fallback
      if (!job) {
        const jobData = await this.redis.get(`job:${jobId}`);
        if (jobData) {
          job = JSON.parse(jobData);
        }
      }

      return job || null;
    } catch (error) {
      logger.error("Failed to get job status", error as Error, { jobId });
      return null;
    }
  }

  /**
   * Update job status in MongoDB, memory and Redis
   */
  private async updateJobStatus(
    jobId: string,
    status: ProcessingJob["status"],
    updates: Partial<ProcessingJob> = {}
  ): Promise<void> {
    try {
      let existingJob = await this.getJobFromMongoDB(jobId);

      if (!existingJob) {
        existingJob = this.jobs.get(jobId) || null;
      }

      if (!existingJob) {
        const jobData = await this.redis.get(`job:${jobId}`);
        if (jobData) {
          existingJob = JSON.parse(jobData);
        }
      }

      if (!existingJob) return;

      const updatedJob: ProcessingJob = {
        ...existingJob,
        ...updates,
        status,
      };

      // Update MongoDB first as primary source
      await ProcessingJobModel.updateOne(
        { jobId },
        {
          status,
          processedRecords:
            updates.processedRecords || existingJob.processedRecords,
          completedAt: updates.completedAt,
          errorMessage: updates.errorMessage,
        }
      );

      // Update memory cache
      this.jobs.set(jobId, updatedJob);

      // Update Redis as backup
      await this.redis.setex(
        `job:${jobId}`,
        604800,
        JSON.stringify(updatedJob)
      );
    } catch (error) {
      logger.error("Failed to update job status", error as Error, {
        jobId,
        status,
      });
    }
  }
  /**
   * Update job progress
   */
  private async updateJobProgress(
    jobId: string,
    processed: number,
    total: number
  ): Promise<void> {
    try {
      await this.updateJobStatus(jobId, "processing", {
        processedRecords: processed,
      });

      const bullJobId = `trademark-job-${jobId}`;
      const bullJob = await this.queue.getJob(bullJobId);
      if (bullJob) {
        await bullJob.progress({
          processed,
          total,
          percentage: Math.round((processed / total) * 100)
        });
      }
    } catch (error) {
      logger.error("Failed to update job progress", error as Error, {
        jobId,
        processed,
        total,
      });
    }
  }

  private async saveJobToMongoDB(
    jobId: string,
    userId: string,
    serialNumbers: string[]
  ): Promise<void> {
    try {
      await ProcessingJobModel.create({
        jobId,
        userId,
        serialNumbers,
        status: "pending",
        totalRecords: serialNumbers.length,
        processedRecords: 0,
        createdAt: new Date(),
      });
    } catch (error) {
      logger.error("Failed to save job to MongoDB", error as Error, { jobId });
    }
  }

  private async saveTrademarkDataToMongoDB(
    results: TrademarkData[]
  ): Promise<void> {
    try {
      const bulkOps = results.map((result) => ({
        updateOne: {
          filter: { serialNumber: result.serialNumber },
          update: { $set: result },
          upsert: true,
        },
      }));

      await Trademark.bulkWrite(bulkOps);
    } catch (error) {
      logger.error("Failed to save trademark data to MongoDB", error as Error);
    }
  }

  /**
   * Get job queue statistics
   */
  public async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        this.queue.getWaiting(),
        this.queue.getActive(),
        this.queue.getCompleted(),
        this.queue.getFailed(),
        this.queue.getDelayed(),
      ]);

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
      };
    } catch (error) {
      logger.error("Failed to get queue stats", error as Error);
      return {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
      };
    }
  }

  /**
   * Cancel a job if it's still pending
   */
  public async cancelJob(jobId: string): Promise<boolean> {
    try {
      const bullJobId = `trademark-job-${jobId}`;
      const job = await this.queue.getJob(bullJobId);

      if (!job) {
        logger.warn("Job not found for cancellation", { jobId });
        return false;
      }

      if (["completed", "failed"].includes(await job.getState())) {
        logger.warn("Cannot cancel completed or failed job", { jobId });
        return false;
      }

      await job.remove();

      // Update job status
      await this.updateJobStatus(jobId, "failed", {
        errorMessage: "Job cancelled by user",
        completedAt: new Date(),
      });

      logger.info("Job cancelled successfully", { jobId });
      return true;
    } catch (error) {
      logger.error("Failed to cancel job", error as Error, { jobId });
      return false;
    }
  }

  /**
   * Retry a failed job
   */
  public async retryJob(jobId: string): Promise<boolean> {
    try {
      const job = await this.getJobStatus(jobId);

      if (!job) {
        logger.warn("Job not found for retry", { jobId });
        return false;
      }

      if (job.status !== "failed") {
        logger.warn("Cannot retry non-failed job", {
          jobId,
          status: job.status,
        });
        return false;
      }

      // Create new job with same data
      const newJobId = await this.addTrademarkJob(
        job.serialNumbers,
        "retry-user"
      );

      logger.info("Job retried successfully", {
        originalJobId: jobId,
        newJobId,
      });

      return true;
    } catch (error) {
      logger.error("Failed to retry job", error as Error, { jobId });
      return false;
    }
  }

  /**
   * Get all jobs for a specific status
   */
  public async getJobsByStatus(
    status: ProcessingJob["status"]
  ): Promise<ProcessingJob[]> {
    try {
      // First try to get jobs from MongoDB as primary source
      const mongoJobs = await ProcessingJobModel.find({ status }).sort({ createdAt: -1 });

      if (mongoJobs.length > 0) {
        const jobs: ProcessingJob[] = [];

        for (const mongoJob of mongoJobs) {
          const trademarkResults = await Trademark.find({
            serialNumber: { $in: mongoJob.serialNumbers },
          });

          jobs.push({
            id: mongoJob.jobId,
            serialNumbers: mongoJob.serialNumbers,
            status: mongoJob.status as ProcessingJob["status"],
            results: trademarkResults.map((t) => ({
              serialNumber: t.serialNumber,
              ownerName: t.ownerName,
              markText: t.markText,
              ownerPhone: t.ownerPhone,
              ownerEmail: t.ownerEmail,
              attorneyName: t.attorneyName,
              abandonDate: t.abandonDate,
              abandonReason: t.abandonReason,
              filingDate: t.filingDate,
              status: t.status as TrademarkData["status"],
              errorMessage: t.errorMessage,
            })),
            totalRecords: mongoJob.totalRecords,
            processedRecords: mongoJob.processedRecords,
            createdAt: mongoJob.createdAt,
            completedAt: mongoJob.completedAt || undefined,
            errorMessage: mongoJob.errorMessage,
          });
        }

        return jobs;
      }

      // Fallback to Redis if MongoDB is empty
      const jobs: ProcessingJob[] = [];
      const jobKeys = await this.redis.keys("job:*");

      for (const key of jobKeys) {
        const jobData = await this.redis.get(key);
        if (jobData) {
          const job: ProcessingJob = JSON.parse(jobData);

          // Convert date strings back to Date objects
          job.createdAt = new Date(job.createdAt);
          if (job.completedAt) {
            job.completedAt = new Date(job.completedAt);
          }

          if (job.status === status) {
            jobs.push(job);
          }
        }
      }

      return jobs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch (error) {
      logger.error("Failed to get jobs by status", error as Error, { status });
      return [];
    }
  }

  /**
   * Clean up old completed jobs
   */
  public async cleanupOldJobs(olderThanHours: number = 24): Promise<number> {
    try {
      const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
      let cleanedCount = 0;

      // Get all job keys from Redis
      const jobKeys = await this.redis.keys("job:*");

      for (const key of jobKeys) {
        const jobData = await this.redis.get(key);
        if (jobData) {
          const job: ProcessingJob = JSON.parse(jobData);
          const jobDate = new Date(job.completedAt || job.createdAt);

          if (
            jobDate < cutoffTime &&
            ["completed", "failed"].includes(job.status)
          ) {
            await this.redis.del(key);
            const jobId = key.replace("job:", "");
            this.jobs.delete(jobId);
            cleanedCount++;
          }
        }
      }

      // Also clean up Bull queue
      await this.queue.clean(olderThanHours * 60 * 60 * 1000, "completed");
      await this.queue.clean(olderThanHours * 60 * 60 * 1000, "failed");

      logger.info("Cleaned up old jobs", {
        action: "cleanup_jobs",
        cleanedCount,
        olderThanHours,
      });

      return cleanedCount;
    } catch (error) {
      logger.error("Failed to cleanup old jobs", error as Error);
      return 0;
    }
  }

  /**
   * Get job processing rate info
   */
  public getProcessingInfo(): {
    rateLimitPerMinute: number;
    estimatedTimeFor100Records: string;
    currentQueueLength: number;
  } {
    const rateLimitInfo = this.usptoService.getRateLimitInfo();

    return {
      rateLimitPerMinute: rateLimitInfo.requestsPerMinute,
      estimatedTimeFor100Records: `${rateLimitInfo.estimatedTimeFor100Records} seconds`,
      currentQueueLength: this.jobs.size,
    };
  }

  /**
   * Pause the queue
   */
  public async pauseQueue(): Promise<void> {
    try {
      await this.queue.pause();
      logger.info("Job queue paused");
    } catch (error) {
      logger.error("Failed to pause queue", error as Error);
      throw error;
    }
  }

  /**
   * Resume the queue
   */
  public async resumeQueue(): Promise<void> {
    try {
      await this.queue.resume();
      logger.info("Job queue resumed");
    } catch (error) {
      logger.error("Failed to resume queue", error as Error);
      throw error;
    }
  }

  /**
   * Check if queue is paused
   */
  public async isQueuePaused(): Promise<boolean> {
    try {
      return await this.queue.isPaused();
    } catch (error) {
      logger.error("Failed to check queue pause status", error as Error);
      return false;
    }
  }

  /**
   * Get detailed job information including Bull job data
   */
  public async getDetailedJobInfo(jobId: string): Promise<{
    job: ProcessingJob | null;
    bullJob: any;
    queuePosition?: number;
  }> {
    try {
      const job = await this.getJobStatus(jobId);
      const bullJobId = `trademark-job-${jobId}`;
      const bullJob = await this.queue.getJob(bullJobId);

      let queuePosition: number | undefined;

      if (bullJob && (await bullJob.getState()) === "waiting") {
        const waitingJobs = await this.queue.getWaiting();
        queuePosition = waitingJobs.findIndex((j) => j.id === bullJob.id) + 1;
      }

      return {
        job,
        bullJob: bullJob
          ? {
            id: bullJob.id,
            state: await bullJob.getState(),
            progress: bullJob.progress(),
            attemptsMade: bullJob.attemptsMade,
            timestamp: bullJob.timestamp,
            processedOn: bullJob.processedOn,
            finishedOn: bullJob.finishedOn,
            failedReason: bullJob.failedReason,
          }
          : null,
        queuePosition,
      };
    } catch (error) {
      logger.error("Failed to get detailed job info", error as Error, {
        jobId,
      });
      return { job: null, bullJob: null };
    }
  }

  /**
   * Gracefully shutdown the queue service
   */
  public async shutdown(): Promise<void> {
    try {
      logger.info("Shutting down job queue service");

      // Close the queue
      await this.queue.close();

      // Close Redis connection
      this.redis.disconnect();

      logger.info("Job queue service shutdown completed");
    } catch (error) {
      logger.error("Error during job queue shutdown", error as Error);
      throw error;
    }
  }

  public async getJobFromMongoDB(
    jobId: string
  ): Promise<ProcessingJob | null> {
    try {
      const mongoJob = await ProcessingJobModel.findOne({ jobId });
      if (!mongoJob) return null;

      const trademarkResults = await Trademark.find({
        serialNumber: { $in: mongoJob.serialNumbers },
      });

      return {
        id: mongoJob.jobId,
        serialNumbers: mongoJob.serialNumbers,
        status: mongoJob.status as ProcessingJob["status"],
        results: trademarkResults.map((t) => ({
          serialNumber: t.serialNumber,
          ownerName: t.ownerName,
          markText: t.markText,
          ownerPhone: t.ownerPhone,
          ownerEmail: t.ownerEmail,
          attorneyName: t.attorneyName,
          abandonDate: t.abandonDate,
          abandonReason: t.abandonReason,
          filingDate: t.filingDate,
          status: t.status as TrademarkData["status"],
          errorMessage: t.errorMessage,
        })),
        totalRecords: mongoJob.totalRecords,
        processedRecords: mongoJob.processedRecords,
        createdAt: mongoJob.createdAt,
        completedAt: mongoJob.completedAt || undefined,
        errorMessage: mongoJob.errorMessage,
      };
    } catch (error) {
      logger.error("Failed to get job from MongoDB", error as Error, { jobId });
      return null;
    }
  }

  /**
   * Health check for queue service
   */
  public async healthCheck(): Promise<{
    status: "healthy" | "unhealthy";
    details: any;
  }> {
    try {
      // Check Redis connection
      await this.redis.ping();

      // Check queue status
      const stats = await this.getQueueStats();
      const isPaused = await this.isQueuePaused();

      // Check USPTO service
      const usptoHealth = await this.usptoService.healthCheck();

      return {
        status: usptoHealth.status === "ok" ? "healthy" : "unhealthy",
        details: {
          redis: "connected",
          queue: {
            paused: isPaused,
            stats,
          },
          usptoApi: usptoHealth,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      logger.error("Health check failed", error as Error);

      return {
        status: "unhealthy",
        details: {
          error: (error as Error).message,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }
}
