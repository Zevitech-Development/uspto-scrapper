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
    this.setupMemoryCleanup();
  }

  public static getInstance(): JobQueueService {
    if (!JobQueueService.instance) {
      JobQueueService.instance = new JobQueueService();
    }
    return JobQueueService.instance;
  }

  private createQueue(): Bull.Queue<JobData> {
    const queue = new Bull<JobData>("trademark-processing", {
      redis: {
        port: Number(process.env.REDIS_PORT),
        host: process.env.REDIS_HOST!,
        username: process.env.REDIS_USERNAME!,
        password: process.env.REDIS_PASSWORD!,
        tls: {},
        maxRetriesPerRequest: 3,
      },
      settings: {
        stalledInterval: 30 * 1000, // 30 seconds instead of default 30s
        maxStalledCount: 1,
      },
      defaultJobOptions: {
        removeOnComplete: 10,
        removeOnFail: 5,
        attempts: 2,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
        timeout: 24 * 60 * 60 * 1000,
      },
    });

    return queue;
  }

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

      // Get complete job data from MongoDB
      const mongoJob = await this.getJobFromMongoDB(job.data.jobId);
      if (mongoJob) {
        // Update both Redis and memory cache with complete data
        const completeJobData = {
          ...mongoJob,
          status: "completed" as const,
          completedAt: mongoJob.completedAt || new Date(),
        };

        // Update memory cache
        this.jobs.set(job.data.jobId, completeJobData);

        // Update Redis cache
        await this.redis.setex(
          `job:${job.data.jobId}`,
          604800, // 7 days
          JSON.stringify(completeJobData)
        );

        logger.info("Job cache updated with complete data", {
          jobId: job.data.jobId,
          totalRecords: mongoJob.results?.length || 0,
        });
      }
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
        (processed, total) => {
          // Update Bull job progress
          job.progress({
            processed,
            total,
            currentSerial: serialNumbers[processed - 1],
          });
          this.updateJobProgress(jobId, processed, total);
        }
      );

      // Update job with results
      const duration = Date.now() - startTime;
      const successCount = results.filter((r) => r.status === "success").length;

      await this.updateJobStatus(jobId, "completed", {
        results,
        completedAt: new Date(),
        processedRecords: serialNumbers.length,
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

  public async getJobStatus(jobId: string): Promise<ProcessingJob | null> {
    try {
      // Check memory first
      let job = this.jobs.get(jobId);

      // If job is in memory but missing results and is completed, sync from MongoDB
      if (
        job &&
        job.status === "completed" &&
        (!job.results || job.results.length === 0)
      ) {
        const mongoJob = await this.getJobFromMongoDB(jobId);
        if (mongoJob && mongoJob.results && mongoJob.results.length > 0) {
          job = mongoJob;
          this.jobs.set(jobId, job);
          await this.redis.setex(`job:${jobId}`, 604800, JSON.stringify(job));
        }
      }

      if (job) {
        return job;
      }

      // Check Redis
      const jobData = await this.redis.get(`job:${jobId}`);
      if (jobData) {
        job = JSON.parse(jobData) as ProcessingJob;

        // If Redis job is completed but missing results, get from MongoDB
        if (
          job.status === "completed" &&
          (!job.results || job.results.length === 0)
        ) {
          const mongoJob = await this.getJobFromMongoDB(jobId);
          if (mongoJob && mongoJob.results && mongoJob.results.length > 0) {
            job = mongoJob;
          }
        }

        this.jobs.set(jobId, job);
        return job;
      }

      // Last resort: MongoDB
      const mongoJob = await this.getJobFromMongoDB(jobId);
      if (mongoJob) {
        this.jobs.set(jobId, mongoJob);
        await this.redis.setex(`job:${jobId}`, 3600, JSON.stringify(mongoJob));
        return mongoJob;
      }

      return null;
    } catch (error) {
      logger.error("Failed to get job status", error as Error, { jobId });
      return null;
    }
  }

  private async updateJobStatus(
    jobId: string,
    status: ProcessingJob["status"],
    updates: Partial<ProcessingJob> = {}
  ): Promise<void> {
    try {
      let existingJob = this.jobs.get(jobId);

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

      // Update memory first
      this.jobs.set(jobId, updatedJob);

      // Then update Redis
      const shouldUpdateRedis =
        status === "completed" ||
        status === "failed" ||
        status === "processing" ||
        (updates.processedRecords && updates.processedRecords % 10 === 0); // Update every 10 records

      if (shouldUpdateRedis) {
        await this.redis.setex(
          `job:${jobId}`,
          604800, // 7 days
          JSON.stringify(updatedJob)
        );
      }

      if (
        status === "completed" ||
        status === "failed" ||
        status === "processing"
      ) {
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
      }
    } catch (error) {
      logger.error("Failed to update job status", error as Error, {
        jobId,
        status,
      });
    }
  }

  private progressUpdateBuffer = new Map<
    string,
    { processed: number; total: number; lastUpdate: number }
  >();

  private async updateJobProgress(
    jobId: string,
    processed: number,
    total: number
  ): Promise<void> {
    try {
      const now = Date.now();
      const existing = this.progressUpdateBuffer.get(jobId);

      const shouldUpdate =
        !existing ||
        now - existing.lastUpdate > 1000 ||
        processed === total ||
        Math.floor((processed / total) * 20) !==
          Math.floor((existing.processed / existing.total) * 20);

      if (shouldUpdate) {
        this.progressUpdateBuffer.set(jobId, {
          processed,
          total,
          lastUpdate: now,
        });

        await this.updateJobStatus(jobId, "processing", {
          processedRecords: processed,
        });
      } else {
        // Just update memory without Redis/DB
        const job = this.jobs.get(jobId);
        if (job) {
          job.processedRecords = processed;
          this.jobs.set(jobId, job);
        }
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

  public async getJobsByStatus(
    status: ProcessingJob["status"]
  ): Promise<ProcessingJob[]> {
    try {
      const jobs: ProcessingJob[] = [];

      if (status === "completed") {
        // For completed jobs, get from MongoDB first (most reliable)
        const mongoJobs = await ProcessingJobModel.find({
          status: "completed",
        }).sort({ completedAt: -1 });

        for (const mongoJob of mongoJobs) {
          const fullJob = await this.getJobFromMongoDB(mongoJob.jobId);
          if (fullJob) {
            jobs.push(fullJob);
            // Update cache with complete data
            this.jobs.set(fullJob.id, fullJob);
          }
        }
      } else {
        // For other statuses, check Redis first, then MongoDB
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

        // Also check MongoDB for any missing jobs
        const mongoJobs = await ProcessingJobModel.find({
          status,
        }).sort({ createdAt: -1 });

        for (const mongoJob of mongoJobs) {
          const existingJob = jobs.find((j) => j.id === mongoJob.jobId);
          if (!existingJob) {
            const fullJob = await this.getJobFromMongoDB(mongoJob.jobId);
            if (fullJob) {
              jobs.push(fullJob);
            }
          }
        }
      }

      return jobs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch (error) {
      logger.error("Failed to get jobs by status", error as Error, { status });
      return [];
    }
  }

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

  public async pauseQueue(): Promise<void> {
    try {
      await this.queue.pause();
      logger.info("Job queue paused");
    } catch (error) {
      logger.error("Failed to pause queue", error as Error);
      throw error;
    }
  }

  public async resumeQueue(): Promise<void> {
    try {
      await this.queue.resume();
      logger.info("Job queue resumed");
    } catch (error) {
      logger.error("Failed to resume queue", error as Error);
      throw error;
    }
  }

  public async isQueuePaused(): Promise<boolean> {
    try {
      return await this.queue.isPaused();
    } catch (error) {
      logger.error("Failed to check queue pause status", error as Error);
      return false;
    }
  }

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

  private async getJobFromMongoDB(
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

  private cleanupMemoryCache(): void {
    const maxCacheSize = 1000;
    const jobs = Array.from(this.jobs.entries());

    if (jobs.length > maxCacheSize) {
      // Sort by last accessed time and remove oldest
      const sortedJobs = jobs.sort((a, b) => {
        const aTime = new Date(a[1].completedAt || a[1].createdAt).getTime();
        const bTime = new Date(b[1].completedAt || b[1].createdAt).getTime();
        return bTime - aTime;
      });

      // Keep only the most recent jobs
      const jobsToKeep = sortedJobs.slice(0, maxCacheSize);
      this.jobs.clear();

      jobsToKeep.forEach(([id, job]) => {
        this.jobs.set(id, job);
      });

      logger.info("Memory cache cleaned up", {
        cleanedCount: jobs.length - maxCacheSize,
        count: maxCacheSize,
      });
    }
  }

  private setupMemoryCleanup(): void {
    setInterval(() => {
      this.cleanupMemoryCache();
    }, 10 * 60 * 1000); // Every 10 minutes
  }

  // Add this method to manually sync cache when needed
  public async syncJobCache(jobId: string): Promise<ProcessingJob | null> {
    try {
      const mongoJob = await this.getJobFromMongoDB(jobId);
      if (mongoJob) {
        // Update memory cache
        this.jobs.set(jobId, mongoJob);

        // Update Redis cache
        await this.redis.setex(
          `job:${jobId}`,
          604800,
          JSON.stringify(mongoJob)
        );

        logger.info("Job cache synced", {
          jobId,
          status: mongoJob.status,
          resultsCount: mongoJob.results?.length || 0,
        });

        return mongoJob;
      }
      return null;
    } catch (error) {
      logger.error("Failed to sync job cache", error as Error, { jobId });
      return null;
    }
  }
}
