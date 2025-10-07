import Bull from "bull";
import Redis from "ioredis";
import { v4 as uuidv4 } from "uuid";
import { USPTOService } from "./uspto-service";
import {
  AppError,
  ProcessingJob,
  TrademarkData,
} from "../types/global-interface";
// import config from "../config/config";
import logger from "../utils/logger";
import { ProcessingJobModel, Trademark } from "../models/trademark.model";
import { NotificationService } from "./notification-service";
import { User } from "../models/user.model";
import mongoose from "mongoose";

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
  private queue!: Bull.Queue<JobData>;
  private redis: Redis;
  private usptoService: USPTOService;
  private notificationService: NotificationService;
  private jobs: Map<string, ProcessingJob> = new Map();
  private memoryCleanupInterval?: NodeJS.Timeout;
  private healthCheckInterval?: NodeJS.Timeout;
  private isProcessorSetup = false;

  private constructor() {
    const redisConfig = {
      port: Number(process.env.REDIS_PORT),
      host: process.env.REDIS_HOST!,
      username: process.env.REDIS_USERNAME!,
      password: process.env.REDIS_PASSWORD!,
      tls: {},
      lazyConnect: false,
      family: 4,
      connectTimeout: 30000,
      commandTimeout: 10000,
      maxRetriesPerRequest: null, // Keep this for Upstash
      enableReadyCheck: false, // Keep this for Upstash
    };

    this.redis = new Redis(redisConfig);
    this.usptoService = new USPTOService();
    this.notificationService = NotificationService.getInstance();

    this.redis.on("error", (error) => {
      logger.error("Redis connection error", error);
    });

    this.redis.on("connect", () => {
      logger.info("Redis connected successfully");
    });

    // ✅ Initialize ONLY when ready
    this.redis.on("ready", () => {
      logger.info("Redis ready for operations");

      if (!this.queue) {
        try {
          this.initializeQueue();
        } catch (error) {
          logger.error("Failed to initialize queue", error as Error);
        }
      }
    });

    this.redis.on("close", () => {
      logger.warn("Redis connection closed");
    });
  }

  private initializeQueue(): void {
    try {
      this.queue = this.createQueue();

      // Wait for queue to be ready before setting up processors
      this.queue.on("ready", () => {
        if (!this.isProcessorSetup) {
          logger.info("Queue is ready, setting up processors...");
          this.setupJobProcessors();
        }
      });

      // Also try to set up processors immediately in case queue is already ready
      if (!this.isProcessorSetup) {
        this.setupJobProcessors();
      }

      this.setupMemoryCleanup();
      logger.info("Queue and processors initialized");
    } catch (error) {
      logger.error("Failed to initialize queue", error as Error);
      throw error;
    }
  }

  public static getInstance(): JobQueueService {
    if (!JobQueueService.instance) {
      JobQueueService.instance = new JobQueueService();
    }
    return JobQueueService.instance;
  }

  private createQueue(): Bull.Queue<JobData> {
    // Simplified Redis config for Upstash compatibility
    const redisConfig = {
      port: Number(process.env.REDIS_PORT),
      host: process.env.REDIS_HOST!,
      username: process.env.REDIS_USERNAME!,
      password: process.env.REDIS_PASSWORD!,
      tls: {},
      family: 4,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: false, // Changed to false for immediate connection
      connectTimeout: 30000, // Increased timeout
      commandTimeout: 10000,
    };

    const queue = new Bull<JobData>("trademark-processing", {
      redis: redisConfig,
      settings: {
        stalledInterval: 30 * 1000, // Reduced to 30 seconds for faster detection
        maxStalledCount: 3,
        retryProcessDelay: 5000,
      },
      defaultJobOptions: {
        backoff: {
          type: "exponential",
          delay: 2000,
        },
        removeOnComplete: 10, // Keep last 10 completed jobs
        removeOnFail: 50, // Keep last 50 failed jobs for debugging
        attempts: 3, // Allow retries
      },
    });

    queue.on("error", (error) => {
      logger.error("Queue connection error", error);
    });

    queue.on("ready", () => {
      logger.info("Queue is ready and connected");
    });

    queue.on("paused", () => {
      logger.warn("Queue has been paused");
    });

    queue.on("resumed", () => {
      logger.info("Queue has been resumed");
    });

    return queue;
  }

  private setupJobProcessors(): void {
    if (this.isProcessorSetup) {
      logger.info("Processor already set up, skipping...");
      return;
    }

    logger.info("Setting up job processors...");

    try {
      if (!this.queue) {
        throw new Error("Queue is not initialized");
      }

      logger.info("Registering processor with concurrency: 1", {
        queueExists: !!this.queue,
        isProcessorSetup: this.isProcessorSetup,
      });

      // Register the processor for trademark processing jobs
      this.queue.process("trademark-processing", 1, async (job) => {
        logger.info("🚀 PROCESSING JOB STARTED", {
          jobId: job.data.jobId,
          bullJobId: job.id as string,
          serialNumbers: job.data.serialNumbers.length,
        });

        try {
          await this.processTrademarkJob(job);
          logger.info("✅ JOB COMPLETED SUCCESSFULLY", {
            jobId: job.data.jobId,
          });
        } catch (error) {
          logger.error("❌ JOB PROCESSING FAILED", error as Error, {
            jobId: job.data.jobId,
          });
          throw error;
        }
      });

      // Setup event listeners
      this.setupQueueEventListeners();

      this.isProcessorSetup = true;
      logger.info("✅ Job processor registered successfully");

      // Force process any waiting jobs
      this.queue.resume().catch((err) => {
        logger.warn("Failed to resume queue (might already be running)", err);
      });
    } catch (error) {
      logger.error("❌ Failed to setup job processor", error as Error);
      throw error;
    }
  }

  private setupQueueEventListeners(): void {
    // Job lifecycle events
    this.queue.on("waiting", (jobId) => {
      logger.info("Job waiting for processing", { jobId });
    });

    this.queue.on("active", (job) => {
      logger.info("Job started processing", {
        jobId: job.data.jobId,
        bullJobId: job.id as string,
      });
    });

    this.queue.on("completed", async (job, result) => {
      logger.info("Job completed successfully", {
        action: "job_completed",
        jobId: job.data.jobId,
        duration: Date.now() - job.timestamp,
        totalRecords: job.data.serialNumbers.length,
      });

      await this.handleJobCompleted(job);
    });

    this.queue.on("failed", async (job, error) => {
      logger.error("Job failed", error, {
        action: "job_failed",
        jobId: job?.data?.jobId,
        attempts: job?.attemptsMade,
        maxAttempts: job?.opts.attempts,
      });

      await this.handleJobFailed(job, error);
    });

    this.queue.on("progress", (job, progress: JobProgress) => {
      if (job.data.jobId) {
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

  private async verifyProcessorStatus(): Promise<void> {
    // ✅ STEP 1: Skip in production to save Redis commands
    if (
      process.env.NODE_ENV === "production" &&
      process.env.DEBUG_QUEUE !== "true"
    ) {
      logger.debug(
        "Processor verification skipped in production (Upstash optimization)"
      );
      return;
    }

    try {
      logger.info("🔍 Verifying processor status (DEBUG MODE)", {
        action: "verify_processor_status",
        isProcessorSetup: this.isProcessorSetup,
      });

      // ✅ STEP 2: Only check waiting and active (not completed/failed to save commands)
      const [waiting, active] = await Promise.all([
        this.queue.getWaiting(),
        this.queue.getActive(),
      ]);

      // ✅ STEP 3: Check if queue is paused
      const isPaused = await this.queue.isPaused();

      logger.info("🔍 Processor Status Check", {
        action: "processor_status_result",
        waiting: waiting.length,
        active: active.length,
        isPaused,
        processorSetup: this.isProcessorSetup,
      });

      // ✅ STEP 4: If jobs are waiting but none active, investigate
      if (waiting.length > 0 && active.length === 0) {
        logger.warn("🚨 Jobs waiting but none active - investigating...", {
          action: "processor_status_issue",
          waitingCount: waiting.length,
        });

        // Try to resume the queue if paused
        if (isPaused) {
          logger.info("Queue was paused, attempting to resume...");
          await this.queue.resume();

          // Wait a bit and check again
          await new Promise((resolve) => setTimeout(resolve, 2000));

          const stillActive = await this.queue.getActive();
          if (stillActive.length === 0) {
          } else {
            logger.info("Queue resumed successfully", {
              action: "processor_status_resumed",
              activeCount: stillActive.length,
            });
          }
        } else {
          // Queue not paused but jobs not processing - possible processor issue
          logger.error("Processor may not be running correctly");

          // ✅ OPTIONAL: Auto-restart processor (use with caution)
          if (process.env.AUTO_RESTART_PROCESSOR === "true") {
            logger.warn("Attempting to restart processor...");
            await this.restartProcessor();
          }
        }
      } else {
        logger.info("✅ Processor status normal", {
          action: "processor_status_ok",
          waiting: waiting.length,
          active: active.length,
        });
      }
    } catch (error) {
      logger.error("Failed to verify processor status", error as Error, {
        action: "verify_processor_status_error",
      });
    }
  }

  private async handleJobCompleted(job: Bull.Job<JobData>): Promise<void> {
    const jobId = job.data.jobId;
    logger.info("Handling job completion", { jobId });

    try {
      // Get complete job data from MongoDB
      const mongoJob = await this.getJobFromMongoDB(jobId);
      if (mongoJob) {
        // Update both Redis and memory cache with complete data
        const completeJobData = {
          ...mongoJob,
          status: "completed" as const,
          completedAt: mongoJob.completedAt || new Date(),
        };

        // Update memory cache
        this.jobs.set(jobId, completeJobData);

        // Update Redis cache
        await this.redis.setex(
          `job:${jobId}`,
          604800, // 7 days
          JSON.stringify(completeJobData)
        );

        logger.info("Job cache updated with complete data", {
          jobId,
          totalRecords: mongoJob.results?.length || 0,
        });
      }
    } catch (error) {
      logger.error("Error handling job completion", error as Error, { jobId });
    }
  }

  private async handleJobFailed(
    job: Bull.Job<JobData>,
    error: Error
  ): Promise<void> {
    const jobId = job?.data?.jobId;
    if (!jobId) return;

    logger.error("Handling job failure", error, { jobId });

    try {
      await this.updateJobStatus(jobId, "failed", {
        errorMessage: error.message,
        completedAt: new Date(),
      });
    } catch (updateError) {
      logger.error("Error updating failed job status", updateError as Error, {
        jobId,
      });
    }
  }

  public async addTrademarkJob(
    serialNumbers: string[],
    userId: string
  ): Promise<string> {
    const jobId = uuidv4();

    try {
      // Ensure queue is initialized before adding jobs
      let attempts = 0;
      while (!this.queue && attempts < 50) {
        await new Promise((resolve) => setTimeout(resolve, 100)); // Wait 100ms
        attempts++;
      }

      if (!this.queue) {
        throw new Error(
          "Queue not initialized yet. Please wait for Redis connection."
        );
      }

      // Ensure processor is set up
      if (!this.isProcessorSetup) {
        logger.warn("⚠️ Processor not set up yet, attempting to set up...");
        this.setupJobProcessors();

        // Wait a bit for processor setup
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

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
      await this.redis.sadd("job:status:pending", jobId);
      await this.saveJobToMongoDB(jobId, userId, serialNumbers);

      const bullJob = await this.queue.add(
        "trademark-processing",
        {
          jobId,
          serialNumbers,
          userId,
        },
        {
          delay: 0,
          priority: 0,
          attempts: 3,
        }
      );

      logger.info("✅ Added trademark processing job to queue", {
        action: "job_added",
        jobId,
        bullJobId: bullJob.id as string,
        totalRecords: serialNumbers.length,
        isProcessorSetup: this.isProcessorSetup,
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
    let jobCompleted = false;
    let progressUpdateLock = false;

    try {
      const existingJob = await this.getJobStatus(jobId);
      if (
        existingJob &&
        (existingJob.status === "completed" || existingJob.status === "failed")
      ) {
        logger.warn("Job already processed, skipping", {
          jobId,
          status: existingJob.status,
        });
        return;
      }

      logger.info("Starting trademark job processing", {
        action: "job_start",
        jobId,
        totalRecords: serialNumbers.length,
      });

      await this.updateJobStatus(jobId, "processing");

      // ✅ NOW returns both results AND stats
      const { results, stats } =
        await this.usptoService.fetchMultipleTrademarkData(
          serialNumbers,
          (processed, total) => {
            if (!jobCompleted && !progressUpdateLock) {
              progressUpdateLock = true;
              try {
                job.progress({
                  processed,
                  total,
                  currentSerial: serialNumbers[processed - 1],
                });
                this.updateJobProgress(jobId, processed, total);
              } catch (error) {
                logger.error("Error updating progress", error as Error, {
                  jobId,
                });
              } finally {
                progressUpdateLock = false;
              }
            }
          }
        );

      jobCompleted = true;

      const duration = Date.now() - startTime;
      const successCount = results.filter((r) => r.status === "success").length;

      // ✅ Save with filtering stats
      await this.updateJobStatus(jobId, "completed", {
        results,
        completedAt: new Date(),
        processedRecords: serialNumbers.length,
        filteringStats: stats, // ✅ ADD: Store stats
      });

      await this.saveTrademarkDataToMongoDB(results);

      logger.info("Job completed - self-filed records only", {
        action: "job_completed",
        jobId,
        totalFetched: stats.totalFetched,
        selfFiledRecords: stats.selfFiled,
        hadAttorney: stats.hadAttorney,
        successCount,
        duration,
      });
    } catch (error) {
      logger.error("Error processing trademark job", error as Error, { jobId });
      await this.updateJobStatus(jobId, "failed", {
        errorMessage: (error as Error).message,
        completedAt: new Date(),
      });
      throw error;
    }
  }

  public async getJobStatus(jobId: string): Promise<ProcessingJob | null> {
    try {
      // ✅ STEP 1: Check memory cache first (fastest, zero Redis commands)
      let job = this.jobs.get(jobId);

      // ✅ STEP 2: If in memory but completed without results, sync from MongoDB
      if (
        job &&
        job.status === "completed" &&
        (!job.results || job.results.length === 0)
      ) {
        logger.debug(
          "Job in memory but missing results, fetching from MongoDB",
          {
            jobId,
          }
        );

        const mongoJob = await this.getJobFromMongoDB(jobId);
        if (mongoJob && mongoJob.results && mongoJob.results.length > 0) {
          job = mongoJob;
          this.jobs.set(jobId, job);

          // Update Redis cache for future requests
          await this.redis
            .setex(
              `job:${jobId}`,
              604800, // 7 days TTL
              JSON.stringify(job)
            )
            .catch((err) => {
              logger.warn("Failed to update Redis cache (non-critical)", {
                jobId,
                error: err.message,
              });
            });
        }
      }

      // ✅ STEP 3: If found in memory and valid, return it
      if (job) {
        logger.debug("Job found in memory cache", {
          jobId,
          status: job.status,
        });
        return job;
      }

      // ✅ STEP 4: Not in memory, check MongoDB first (not Redis)
      logger.debug("Job not in memory, checking MongoDB", { jobId });
      const mongoJob = await this.getJobFromMongoDB(jobId);

      if (mongoJob) {
        // Cache in memory for future requests
        this.jobs.set(jobId, mongoJob);

        // Only cache completed/failed jobs in Redis to save commands
        if (mongoJob.status === "completed" || mongoJob.status === "failed") {
          await this.redis
            .setex(
              `job:${jobId}`,
              604800, // 7 days
              JSON.stringify(mongoJob)
            )
            .catch((err) => {
              logger.warn("Failed to cache in Redis (non-critical)", {
                jobId,
                error: err.message,
              });
            });
        }

        logger.debug("Job found in MongoDB and cached", {
          jobId,
          status: mongoJob.status,
        });
        return mongoJob;
      }

      // ✅ STEP 5: Last resort - check Redis (only if not found in MongoDB)
      logger.debug("Job not in MongoDB, checking Redis as fallback", { jobId });
      const jobData = await this.redis.get(`job:${jobId}`).catch((err) => {
        logger.warn("Redis get failed (non-critical)", {
          jobId,
          error: err.message,
        });
        return null;
      });

      if (jobData) {
        try {
          job = JSON.parse(jobData as string) as ProcessingJob;
          job.createdAt = new Date(job.createdAt);
          if (job.completedAt) job.completedAt = new Date(job.completedAt);

          // If Redis has it but MongoDB doesn't, this is stale data
          logger.warn("Job found in Redis but not MongoDB (stale cache)", {
            jobId,
            status: job.status,
          });

          // Cache in memory temporarily
          this.jobs.set(jobId, job);
          return job;
        } catch (parseError) {
          logger.error("Failed to parse Redis job data", parseError as Error, {
            jobId,
          });
        }
      }

      // ✅ STEP 6: Job not found anywhere
      logger.debug("Job not found in any storage", { jobId });
      return null;
    } catch (error) {
      logger.error("Failed to get job status", error as Error, { jobId });
      return null;
    }
  }

  public async debugQueueStatus(): Promise<void> {
    try {
      if (!this.queue) {
        logger.error("❌ Queue is not initialized");
        return;
      }

      const [waiting, active, completed, failed, delayed, paused] =
        await Promise.all([
          this.queue.getWaiting(),
          this.queue.getActive(),
          this.queue.getCompleted(),
          this.queue.getFailed(),
          this.queue.getDelayed(),
          this.queue.isPaused(),
        ]);

      logger.info("🔍 Queue Status Debug", {
        isProcessorSetup: this.isProcessorSetup,
        isPaused: paused,
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
        waitingJobs: waiting.slice(0, 5).map((job) => ({
          id: job.id,
          jobId: job.data?.jobId,
          createdAt: new Date(job.timestamp).toISOString(),
        })),
        activeJobs: active.slice(0, 5).map((job) => ({
          id: job.id,
          jobId: job.data?.jobId,
          processedOn: job.processedOn
            ? new Date(job.processedOn).toISOString()
            : null,
        })),
      });

      // Try to resume if paused
      if (paused) {
        logger.info("🔄 Queue is paused, attempting to resume...");
        await this.queue.resume();
      }
    } catch (error) {
      logger.error("❌ Error debugging queue status", error as Error);
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
        logger.warn("Job not found in memory cache for status update", {
          jobId,
        });
        return;
      }

      const updatedJob: ProcessingJob = { ...existingJob, ...updates, status };
      this.jobs.set(jobId, updatedJob);

      // Only update Redis for major state changes
      const shouldUpdateRedis =
        status === "completed" ||
        status === "failed" ||
        (existingJob.status === "pending" && status === "processing") ||
        (updates.processedRecords && updates.processedRecords % 50 === 0);

      if (shouldUpdateRedis) {
        const ttl =
          status === "completed" || status === "failed" ? 604800 : 3600;
        await this.redis.setex(`job:${jobId}`, ttl, JSON.stringify(updatedJob));
      }

      // ✅ UPDATE: Include filteringStats in MongoDB update
      if (
        existingJob.status !== status ||
        status === "completed" ||
        status === "failed"
      ) {
        const mongoUpdate: any = {
          status,
          processedRecords:
            updates.processedRecords || existingJob.processedRecords,
          ...(updates.completedAt && { completedAt: updates.completedAt }),
          ...(updates.errorMessage && {
            errorMessage: updates.errorMessage,
          }),
          // ✅ ADD: Save filtering stats
          ...(updates.filteringStats && {
            filteringStats: updates.filteringStats,
          }),
          // ✅ ADD: Save results array for accurate count display
          ...(updates.results && {
            results: updates.results,
          }),
        };

        await ProcessingJobModel.updateOne({ jobId }, { $set: mongoUpdate });
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

      // Don't update progress if job is already completed
      const currentJob = this.jobs.get(jobId);
      if (
        currentJob &&
        (currentJob.status === "completed" || currentJob.status === "failed")
      ) {
        return;
      }

      const shouldUpdate =
        !existing ||
        now - existing.lastUpdate > 300000 ||
        processed === total ||
        Math.floor((processed / total) * 4) !==
          Math.floor((existing.processed / existing.total) * 4);

      if (shouldUpdate) {
        this.progressUpdateBuffer.set(jobId, {
          processed,
          total,
          lastUpdate: now,
        });

        if (
          currentJob &&
          currentJob.status !== "completed" &&
          currentJob.status !== "failed"
        ) {
          currentJob.processedRecords = processed;
          this.jobs.set(jobId, currentJob);

          // Update MongoDB periodically
          if (processed % 200 === 0 || processed === total) {
            await ProcessingJobModel.updateOne(
              { jobId },
              {
                $set: {
                  processedRecords: processed,
                  ...(processed === total && { completedAt: new Date() }),
                },
              }
            );
          }
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

  private async deleteJobFromDatabase(jobId: string): Promise<void> {
    try {
      const result = await ProcessingJobModel.deleteOne({ jobId });
      if (result.deletedCount === 0) {
        logger.warn("No job found in database for deletion", { jobId });
      } else {
        logger.info("Job deleted from database", { jobId });
      }
    } catch (error) {
      logger.error("Failed to delete job from database", error as Error, {
        jobId,
      });
      throw error;
    }
  }

  private async saveTrademarkDataToMongoDB(
    results: TrademarkData[]
  ): Promise<void> {
    try {
      if (results.length === 0) {
        logger.warn("No trademark results to save");
        return;
      }

      const bulkOps = results.map((result) => ({
        updateOne: {
          filter: { serialNumber: result.serialNumber },
          update: { $set: { ...result, lastUpdated: new Date() } },
          upsert: true,
        },
      }));

      const result = await Trademark.bulkWrite(bulkOps);
      logger.info("Trademark data saved to MongoDB", {
        matched: result.matchedCount,
        modified: result.modifiedCount,
        upserted: result.upsertedCount,
      });
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
      if (!this.queue) {
        return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
      }

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
      const [waitingJobs, activeJobs] = await Promise.all([
        this.queue.getWaiting(),
        this.queue.getActive(),
      ]);

      const allJobs = [...waitingJobs, ...activeJobs];
      const job = allJobs.find((j) => j.data.jobId === jobId);

      if (!job) {
        logger.warn("Job not found for cancellation", { jobId });
        return false;
      }

      const state = await job.getState();
      if (["completed", "failed"].includes(state)) {
        logger.warn("Cannot cancel completed or failed job", { jobId, state });
        return false;
      }

      await job.remove();

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

  public async removeJob(jobId: string): Promise<boolean> {
    try {
      // Get all jobs including completed and failed ones
      const [waitingJobs, activeJobs, completedJobs, failedJobs] =
        await Promise.all([
          this.queue.getWaiting(),
          this.queue.getActive(),
          this.queue.getCompleted(),
          this.queue.getFailed(),
        ]);

      const allJobs = [
        ...waitingJobs,
        ...activeJobs,
        ...completedJobs,
        ...failedJobs,
      ];
      const job = allJobs.find((j) => j.data.jobId === jobId);

      if (!job) {
        logger.warn("Job not found for removal", { jobId });
        return false;
      }

      const state = await job.getState();

      // Only allow removal of completed or failed jobs
      if (!["completed", "failed"].includes(state)) {
        logger.warn("Cannot remove active or pending job", { jobId, state });
        return false;
      }

      // Remove the job from the queue
      await job.remove();

      // Remove from memory cache
      this.jobs.delete(jobId);

      // Remove from database
      await this.deleteJobFromDatabase(jobId);

      logger.info("Job removed successfully", { jobId, state });
      return true;
    } catch (error) {
      logger.error("Failed to remove job", error as Error, { jobId });
      return false;
    }
  }

  private setupMemoryCleanup(): void {
    if (this.memoryCleanupInterval) {
      clearInterval(this.memoryCleanupInterval);
    }
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.memoryCleanupInterval = setInterval(() => {
      if (this.jobs.size > 100) {
        this.cleanupMemoryCache();
        // logger.info("Memory cleanup performed", { jobCount: this.jobs.size });
      }
    }, 30 * 60 * 1000);

    logger.info(
      "Queue initialized - health checks disabled for Upstash optimization"
    );

    process.on("exit", () => {
      this.cleanup();
    });

    process.on("SIGINT", () => {
      this.cleanup();
    });

    process.on("SIGTERM", () => {
      this.cleanup();
    });
  }

  private cleanup(): void {
    this.progressUpdateBuffer.clear();

    if (this.memoryCleanupInterval) {
      clearInterval(this.memoryCleanupInterval);
      this.memoryCleanupInterval = undefined;
    }

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  private cleanupMemoryCache(): void {
    const maxCacheSize = 1000;
    const jobs = Array.from(this.jobs.entries());

    if (jobs.length > maxCacheSize) {
      const sortedJobs = jobs.sort((a, b) => {
        const aTime = new Date(a[1].completedAt || a[1].createdAt).getTime();
        const bTime = new Date(b[1].completedAt || b[1].createdAt).getTime();
        return bTime - aTime;
      });

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

  private async getJobFromMongoDB(
    jobId: string
  ): Promise<ProcessingJob | null> {
    try {
      const mongoJob = await ProcessingJobModel.findOne({ jobId });
      if (!mongoJob) return null;

      // ✅ Use results from job record if available (for completed jobs with filtered results)
      // Otherwise fall back to fetching from Trademark collection (for backward compatibility)
      let results: TrademarkData[] = [];

      if (mongoJob.results && mongoJob.results.length > 0) {
        // Use the filtered results stored in the job record
        results = mongoJob.results.map((r) => ({
          serialNumber: r.serialNumber || "",
          ownerName: r.ownerName || null,
          markText: r.markText || null,
          ownerPhone: r.ownerPhone || null,
          ownerEmail: r.ownerEmail || null,
          attorneyName: r.attorneyName || null,
          abandonDate: r.abandonDate || null,
          abandonReason: r.abandonReason || null,
          filingDate: r.filingDate || null,
          status: r.status as TrademarkData["status"],
          errorMessage: r.errorMessage,
        }));
      } else {
        // Fallback to fetching from Trademark collection (backward compatibility)
        const trademarkResults = await Trademark.find({
          serialNumber: { $in: mongoJob.serialNumbers },
        });

        results = trademarkResults.map((t) => ({
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
        }));
      }

      return {
        id: mongoJob.jobId,
        serialNumbers: mongoJob.serialNumbers,
        status: mongoJob.status as ProcessingJob["status"],
        results,
        totalRecords: mongoJob.totalRecords,
        processedRecords: mongoJob.processedRecords,
        createdAt: mongoJob.createdAt,
        completedAt: mongoJob.completedAt || undefined,
        errorMessage: mongoJob.errorMessage,
        // Include assignment fields
        assignedTo: mongoJob.assignedTo,
        userStatus: mongoJob.userStatus,
        assignedAt: mongoJob.assignedAt,
        downloadedAt: mongoJob.downloadedAt,
        workStartedAt: mongoJob.workStartedAt,
        finishedAt: mongoJob.finishedAt,
        filteringStats: mongoJob.filteringStats
          ? {
              totalFetched: Number(mongoJob.filteringStats.totalFetched),
              selfFiled: Number(mongoJob.filteringStats.selfFiled),
              hadAttorney: Number(mongoJob.filteringStats.hadAttorney),
            }
          : undefined,
        archived: mongoJob.archived, 
        archivedAt: mongoJob.archivedAt,
      };
    } catch (error) {
      logger.error("Failed to get job from MongoDB", error as Error, { jobId });
      return null;
    }
  }

  public async logQueueHealth(): Promise<void> {
    try {
      const health = await this.getQueueHealth();

      if (health.isHealthy) {
        logger.info("Queue health check passed", {
          action: "queue_health_check",
          redis: health.redis.connected,
          paused: health.queue.isPaused,
          stats: health.stats,
        });
      } else {
        logger.error(
          "Queue health check failed",
          new Error("Queue unhealthy"),
          {
            action: "queue_health_check",
            health,
          }
        );
      }
    } catch (error) {
      logger.error("Failed to perform queue health check", error as Error);
    }
  }

  public async getQueueHealth(): Promise<{
    isHealthy: boolean;
    redis: { connected: boolean; error?: string };
    queue: { isPaused: boolean; error?: string };
    processors: { active: boolean; error?: string };
    stats: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
    };
  }> {
    const health = {
      isHealthy: true,
      redis: { connected: false, error: undefined as string | undefined },
      queue: { isPaused: false, error: undefined as string | undefined },
      processors: { active: false, error: undefined as string | undefined },
      stats: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
    };

    try {
      // Check Redis connection
      await this.redis.ping();
      health.redis.connected = true;
    } catch (error) {
      health.redis.connected = false;
      health.redis.error = (error as Error).message;
      health.isHealthy = false;
    }

    try {
      // Check queue status
      health.queue.isPaused = await this.queue.isPaused();
      if (health.queue.isPaused) {
        health.isHealthy = false;
      }
    } catch (error) {
      health.queue.error = (error as Error).message;
      health.isHealthy = false;
    }

    try {
      // Check processors
      const activeJobs = await this.queue.getActive();
      health.processors.active =
        this.isProcessorSetup && activeJobs.length >= 0;

      // Get queue stats
      health.stats = await this.getQueueStats();
    } catch (error) {
      health.processors.error = (error as Error).message;
      health.isHealthy = false;
    }

    return health;
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

  public async isQueuePaused(): Promise<boolean> {
    try {
      return await this.queue.isPaused();
    } catch (error) {
      logger.error("Failed to check queue pause status", error as Error);
      return false;
    }
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

  public async getJobsByStatus(
    status: ProcessingJob["status"]
  ): Promise<ProcessingJob[]> {
    try {
      const mongoJobs = await ProcessingJobModel.find({
        status: status,
        archived: { $ne: true },
      })
        .sort({ createdAt: -1 })
        .limit(100)
        .select(
          "jobId assignedTo userStatus assignedAt downloadedAt workStartedAt finishedAt totalRecords processedRecords createdAt completedAt errorMessage filteringStats"
        )
        .lean();

      if (mongoJobs.length === 0) {
        logger.debug("No jobs found with status", { status });
        return [];
      }

      logger.info("Found jobs in MongoDB", {
        action: "get_jobs_by_status",
        status,
        count: mongoJobs.length,
      });

      // ✅ STEP 2: Enrich with full data and update memory cache
      const jobs: ProcessingJob[] = [];

      for (const mongoJob of mongoJobs) {
        // Check memory cache first (fastest)
        let fullJob: ProcessingJob | null =
          this.jobs.get(mongoJob.jobId) || null; // ✅ CHANGED: explicitly handle undefined

        // If not in memory or status doesn't match, get from MongoDB
        if (!fullJob || fullJob.status !== status) {
          fullJob = await this.getJobFromMongoDB(mongoJob.jobId);

          if (fullJob) {
            // Update memory cache for future requests
            this.jobs.set(fullJob.id, fullJob);
            jobs.push(fullJob);
          }
        } else {
          // Use cached version
          jobs.push(fullJob);
        }
      }

      // ✅ STEP 3: Sort by creation date (most recent first)
      jobs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      logger.info("Jobs by status retrieved successfully", {
        action: "get_jobs_by_status_complete",
        status,
        returned: jobs.length,
      });

      return jobs;
    } catch (error) {
      logger.error("Failed to get jobs by status", error as Error, { status });
      return [];
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

  public async cleanupOldJobs(olderThanHours: number = 24): Promise<number> {
    try {
      const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
      let cleanedCount = 0;

      logger.info("Starting job cleanup", {
        action: "cleanup_jobs_start",
        olderThanHours,
        cutoffTime: cutoffTime.toISOString(),
      });

      // ✅ STEP 1: Query MongoDB for old completed/failed jobs
      const oldJobs = await ProcessingJobModel.find({
        status: { $in: ["completed", "failed"] },
        $or: [
          { completedAt: { $exists: true, $lt: cutoffTime } },
          { createdAt: { $lt: cutoffTime } }, // Fallback for jobs without completedAt
        ],
      })
        .select("jobId status completedAt createdAt")
        .limit(1000) // Process in batches to avoid overwhelming the system
        .lean();

      if (oldJobs.length === 0) {
        logger.info("No old jobs to clean up", {
          action: "cleanup_jobs_complete",
          cleanedCount: 0,
        });
        return 0;
      }

      logger.info("Found old jobs to clean", {
        action: "cleanup_jobs_found",
        count: oldJobs.length,
      });

      // ✅ STEP 2: Clean from Redis using pipeline (batch operation)
      try {
        const pipeline = this.redis.pipeline();

        oldJobs.forEach((job) => {
          pipeline.del(`job:${job.jobId}`);
        });

        await pipeline.exec();

        logger.info("Cleaned Redis cache", {
          action: "cleanup_redis_complete",
          count: oldJobs.length,
        });
      } catch (redisError) {
        // Redis cleanup is not critical - log and continue
        logger.warn("Redis cleanup failed (non-critical)", {
          error: (redisError as Error).message,
        });
      }

      // ✅ STEP 3: Clean from memory cache
      oldJobs.forEach((job) => {
        this.jobs.delete(job.jobId);
      });

      // ✅ STEP 4: Clean Bull queue (completed and failed jobs)
      try {
        const cleanedCompleted = await this.queue.clean(
          olderThanHours * 60 * 60 * 1000,
          "completed",
          1000 // Limit to prevent timeout
        );

        const cleanedFailed = await this.queue.clean(
          olderThanHours * 60 * 60 * 1000,
          "failed",
          1000
        );

        logger.info("Cleaned Bull queue", {
          action: "cleanup_bull_complete",
          completed: cleanedCompleted.length || 0,
          failed: cleanedFailed.length || 0,
        });
      } catch (bullError) {
        // Bull cleanup failure is not critical
        logger.warn("Bull queue cleanup failed (non-critical)", {
          error: (bullError as Error).message,
        });
      }

      // ✅ STEP 5: Optional - Delete from MongoDB (if you want permanent cleanup)
      // Uncomment if you want to delete old jobs from database too
      /*
    try {
      const deleteResult = await ProcessingJobModel.deleteMany({
        jobId: { $in: oldJobs.map(j => j.jobId) }
      });
      
      logger.info("Deleted old jobs from MongoDB", {
        action: "cleanup_mongodb",
        deletedCount: deleteResult.deletedCount,
      });
    } catch (mongoError) {
      logger.error("Failed to delete from MongoDB", mongoError as Error);
    }
    */

      cleanedCount = oldJobs.length;

      logger.info("Job cleanup completed successfully", {
        action: "cleanup_jobs_complete",
        cleanedCount,
        olderThanHours,
        cutoffTime: cutoffTime.toISOString(),
      });

      return cleanedCount;
    } catch (error) {
      logger.error("Failed to cleanup old jobs", error as Error, {
        olderThanHours,
      });
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

  public async close(): Promise<void> {
    try {
      logger.info("Closing job queue service...");

      // Close the Bull queue
      if (this.queue) {
        await this.queue.close();
        logger.info("Bull queue closed");
      }

      // Close Redis connection
      if (this.redis) {
        this.redis.disconnect();
        logger.info("Redis connection closed");
      }

      // Clear memory cleanup interval
      if (this.memoryCleanupInterval) {
        clearInterval(this.memoryCleanupInterval);
        logger.info("Memory cleanup interval cleared");
      }

      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        logger.info("Health check interval cleared");
      }

      logger.info("Job queue service closed successfully");
    } catch (error) {
      logger.error("Error closing job queue service", error as Error);
    }
  }

  // Emergency method to restart processor if stuck
  public async restartProcessor(): Promise<void> {
    try {
      logger.info("🔄 Emergency restart of job processor...");

      // Force re-register the processor
      this.isProcessorSetup = false;
      this.setupJobProcessors();

      // Resume queue if paused
      const isPaused = await this.queue.isPaused();
      if (isPaused) {
        await this.queue.resume();
        logger.info("Queue resumed after processor restart");
      }

      // Verify status after restart
      setTimeout(() => {
        this.verifyProcessorStatus();
      }, 3000);

      logger.info("✅ Processor restart completed");
    } catch (error) {
      logger.error("Failed to restart processor", error as Error);
      throw error;
    }
  }

  public async assignJobToUser(
    jobId: string,
    userId: string,
    adminId: string
  ): Promise<ProcessingJob | null> {
    try {
      // Verify user exists and is active
      const user = await User.findById(userId);
      if (!user || !user.isActive) {
        throw new AppError("User not found or inactive", 404, "USER_NOT_FOUND");
      }

      // ✅ ADD DEBUG LOG BEFORE UPDATE
      console.log("🔧 Assigning job...");
      console.log("  jobId:", jobId);
      console.log("  userId (string):", userId);
      console.log("  userId as ObjectId:", new mongoose.Types.ObjectId(userId));

      // Update job in MongoDB
      const result = await ProcessingJobModel.findOneAndUpdate(
        { jobId },
        {
          $set: {
            assignedTo: new mongoose.Types.ObjectId(userId),
            userStatus: "assigned",
            assignedAt: new Date(),
          },
        },
        { new: true }
      );

      console.log("✅ Job updated in DB, assignedTo:", result?.assignedTo);
      console.log("✅ assignedTo type:", typeof result?.assignedTo);

      if (!result) {
        throw new AppError("Job not found", 404, "JOB_NOT_FOUND");
      }

      // Update cache
      const job = await this.getJobFromMongoDB(jobId);
      if (job) {
        this.jobs.set(jobId, job);
        await this.redis.setex(`job:${jobId}`, 604800, JSON.stringify(job));
      }

      // Create notification for user (optional - for future user notifications)
      // For now, we'll skip user notifications

      logger.info("Job assigned to user", {
        action: "job_assigned",
        jobId,
        assignedTo: userId,
        assignedBy: adminId,
        userName: user.getFullName(),
      });

      return job;
    } catch (error) {
      logger.error("Failed to assign job", error as Error, { jobId, userId });
      throw error;
    }
  }

  public async getJobAssignments(): Promise<any[]> {
    try {
      const jobs = await ProcessingJobModel.find({
        assignedTo: { $exists: true, $ne: null },
      })
        .sort({ assignedAt: -1 })
        .limit(100)
        .lean();

      // Get user details for each assignment
      const userIds = [
        ...new Set(jobs.map((j) => j.assignedTo).filter(Boolean)),
      ];
      const users = await User.find({ _id: { $in: userIds } })
        .select("_id firstName lastName email")
        .lean();

      const userMap = new Map(users.map((u) => [u._id.toString(), u]));

      return jobs.map((job) => ({
        jobId: job.jobId,
        assignedTo: job.assignedTo,
        assignedUser: job.assignedTo ? userMap.get(job.assignedTo) : null,
        userStatus: job.userStatus,
        totalRecords: job.totalRecords,
        processedRecords: job.processedRecords,
        status: job.status,
        assignedAt: job.assignedAt,
        downloadedAt: job.downloadedAt,
        workStartedAt: job.workStartedAt,
        finishedAt: job.finishedAt,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
      }));
    } catch (error) {
      logger.error("Failed to get job assignments", error as Error);
      throw new AppError(
        "Failed to retrieve job assignments",
        500,
        "ASSIGNMENTS_FETCH_ERROR"
      );
    }
  }

  public async getJobsAssignedToUser(userId: string): Promise<ProcessingJob[]> {
    try {
      console.log("🔍 Fetching jobs for userId:", userId);
      console.log("🔍 userId type:", typeof userId);
      console.log(
        "🔍 Converted to ObjectId:",
        new mongoose.Types.ObjectId(userId)
      );

      const mongoJobs = await ProcessingJobModel.find({
        assignedTo: new mongoose.Types.ObjectId(userId),
        status: { $in: ["pending", "processing", "completed"] }, // Exclude failed jobs
      })
        .sort({ assignedAt: -1 })
        .lean();

      // ✅ ADD THIS DEBUG LOG
      console.log("📦 Found jobs:", mongoJobs.length);
      mongoJobs.forEach((job) => {
        console.log("  - Job:", job.jobId, "assignedTo:", job.assignedTo);
      });

      const jobs: ProcessingJob[] = [];
      for (const mongoJob of mongoJobs) {
        const fullJob = await this.getJobFromMongoDB(mongoJob.jobId);
        if (fullJob) jobs.push(fullJob);
      }

      return jobs;
    } catch (error) {
      logger.error("Failed to get user assigned jobs", error as Error, {
        userId,
      });
      throw new AppError(
        "Failed to retrieve assigned jobs",
        500,
        "ASSIGNED_JOBS_FETCH_ERROR"
      );
    }
  }

  public async getJobsByStatusForUser(
    status: ProcessingJob["status"],
    userId: string
  ): Promise<ProcessingJob[]> {
    try {
      logger.debug("Fetching jobs for user", {
        action: "get_jobs_by_status_for_user",
        status,
        userId,
      });

      // ✅ STEP 1: Query MongoDB with user filter
      const mongoJobs = await ProcessingJobModel.find({
        assignedTo: new mongoose.Types.ObjectId(userId),
        status: status,
      })
        .sort({ assignedAt: -1 })
        .limit(100)
        .select(
          "jobId assignedTo userStatus assignedAt downloadedAt workStartedAt finishedAt totalRecords processedRecords createdAt completedAt errorMessage filteringStats"
        )
        .lean();

      if (mongoJobs.length === 0) {
        logger.debug("No jobs found for user with status", { status, userId });
        return [];
      }

      // ✅ STEP 2: Enrich with full data
      const jobs: ProcessingJob[] = [];

      for (const mongoJob of mongoJobs) {
        // Check memory cache
        let fullJob: ProcessingJob | null =
          this.jobs.get(mongoJob.jobId) || null; // ✅ CHANGED

        if (!fullJob || fullJob.status !== status) {
          fullJob = await this.getJobFromMongoDB(mongoJob.jobId);

          if (fullJob && fullJob.status === status) {
            // Verify ownership (security check)
            if (fullJob.assignedTo?.toString() === userId) {
              this.jobs.set(fullJob.id, fullJob);
              jobs.push(fullJob);
            }
          }
        } else {
          // Verify ownership from cache
          if (fullJob.assignedTo?.toString() === userId) {
            jobs.push(fullJob);
          }
        }
      }

      // ✅ STEP 3: Sort by assignment date
      jobs.sort((a, b) => {
        const aTime = a.assignedAt ? new Date(a.assignedAt).getTime() : 0;
        const bTime = b.assignedAt ? new Date(b.assignedAt).getTime() : 0;
        return bTime - aTime;
      });

      logger.info("User jobs retrieved successfully", {
        action: "get_jobs_by_status_for_user_complete",
        status,
        userId,
        count: jobs.length,
      });

      return jobs;
    } catch (error) {
      logger.error("Failed to get jobs by status for user", error as Error, {
        status,
        userId,
      });
      throw new AppError(
        "Failed to retrieve jobs by status",
        500,
        "JOBS_BY_STATUS_FETCH_ERROR"
      );
    }
  }
  public async updateJobUserStatus(
    jobId: string,
    userId: string,
    status: "downloaded" | "working" | "finished"
  ): Promise<ProcessingJob | null> {
    try {
      console.log("🔄 updateJobUserStatus called");
      console.log("  jobId:", jobId);
      console.log("  userId:", userId);
      console.log("  status:", status);
      // Verify job is assigned to this user
      const job = await ProcessingJobModel.findOne({
        jobId,
        assignedTo: new mongoose.Types.ObjectId(userId),
      });

      console.log("📦 Job found:", !!job);

      if (!job) {
        console.log("❌ Job not found - checking all jobs with this jobId...");
        const anyJob = await ProcessingJobModel.findOne({ jobId });
        console.log("  Job exists:", !!anyJob);
        if (anyJob) {
          console.log("  But assignedTo is:", anyJob.assignedTo);
          console.log("  Expected userId:", userId);
        }
        throw new AppError(
          "Job not found or not assigned to you",
          404,
          "JOB_NOT_FOUND"
        );
      }

      console.log("✅ Job verified, continuing...");

      // Get admin who created the job
      const admin = await User.findById(job.userId);
      if (!admin) {
        throw new AppError("Admin not found", 404, "ADMIN_NOT_FOUND");
      }

      // Get user details for notification
      const user = await User.findById(userId);
      if (!user) {
        throw new AppError("User not found", 404, "USER_NOT_FOUND");
      }

      const userName = user.getFullName();
      const now = new Date();

      // Update based on status
      const updateData: any = { userStatus: status };
      let notificationType: any;
      let notificationMessage: string;

      switch (status) {
        case "downloaded":
          updateData.downloadedAt = now;
          notificationType = "job_downloaded";
          notificationMessage = `${userName} downloaded Job #${jobId.slice(
            0,
            8
          )}`;
          break;
        case "working":
          updateData.workStartedAt = now;
          notificationType = "job_working";
          notificationMessage = `${userName} started working on Job #${jobId.slice(
            0,
            8
          )}`;
          break;
        case "finished":
          updateData.finishedAt = now;
          notificationType = "job_finished";
          notificationMessage = `${userName} finished Job #${jobId.slice(
            0,
            8
          )}`;
          break;
      }

      // Update job
      await ProcessingJobModel.updateOne({ jobId }, { $set: updateData });

      // Create notification for admin
      await this.notificationService.createNotification({
        recipientId: admin._id.toString(),
        senderId: userId,
        jobId,
        type: notificationType,
        message: notificationMessage,
      });

      // Update cache
      const updatedJob = await this.getJobFromMongoDB(jobId);
      if (updatedJob) {
        this.jobs.set(jobId, updatedJob);
        await this.redis.setex(
          `job:${jobId}`,
          604800,
          JSON.stringify(updatedJob)
        );
      }

      logger.info("Job user status updated", {
        action: "job_status_updated",
        jobId,
        userId,
        status,
        notificationType,
      });

      return updatedJob;
    } catch (error) {
      logger.error("Failed to update job status", error as Error, {
        jobId,
        userId,
        status,
      });
      throw error;
    }
  }

  public async notifyDownload(jobId: string, userId: string): Promise<void> {
    try {
      await this.updateJobUserStatus(jobId, userId, "downloaded");
    } catch (error) {
      // Log but don't throw - download should still work
      logger.error("Failed to notify download", error as Error, {
        jobId,
        userId,
      });
    }
  }

  public async archiveJob(jobId: string): Promise<ProcessingJob | null> {
    try {
      // Update job in MongoDB
      const result = await ProcessingJobModel.findOneAndUpdate(
        { jobId, status: "completed" }, // Only completed jobs can be archived
        {
          $set: {
            archived: true,
            archivedAt: new Date(),
          },
        },
        { new: true }
      );

      if (!result) {
        throw new AppError(
          "Job not found or not completed",
          404,
          "JOB_NOT_FOUND"
        );
      }

      // Update cache - remove from active jobs cache
      this.jobs.delete(jobId);

      // Update Redis cache
      await this.redis.del(`job:${jobId}`);

      logger.info("Job archived successfully", {
        action: "job_archived",
        jobId,
      });

      const job = await this.getJobFromMongoDB(jobId);
      return job;
    } catch (error) {
      logger.error("Failed to archive job", error as Error, { jobId });
      throw error;
    }
  }

  public async unarchiveJob(jobId: string): Promise<ProcessingJob | null> {
    try {
      // Update job in MongoDB
      const result = await ProcessingJobModel.findOneAndUpdate(
        { jobId, archived: true },
        {
          $set: {
            archived: false,
            archivedAt: null,
          },
        },
        { new: true }
      );

      if (!result) {
        throw new AppError(
          "Job not found or not archived",
          404,
          "JOB_NOT_FOUND"
        );
      }

      logger.info("Job unarchived successfully", {
        action: "job_unarchived",
        jobId,
      });

      const job = await this.getJobFromMongoDB(jobId);
      if (job) {
        this.jobs.set(jobId, job);
      }
      return job;
    } catch (error) {
      logger.error("Failed to unarchive job", error as Error, { jobId });
      throw error;
    }
  }

  public async getArchivedJobs(): Promise<ProcessingJob[]> {
    try {
      const mongoJobs = await ProcessingJobModel.find({
        archived: true,
      })
        .sort({ archivedAt: -1 })
        .limit(100)
        .select(
          "jobId assignedTo userStatus assignedAt downloadedAt workStartedAt finishedAt totalRecords processedRecords createdAt completedAt errorMessage filteringStats archived archivedAt"
        )
        .lean();

      const jobs: ProcessingJob[] = [];

      for (const mongoJob of mongoJobs) {
        const fullJob = await this.getJobFromMongoDB(mongoJob.jobId);
        if (fullJob) {
          jobs.push(fullJob);
        }
      }

      return jobs.sort((a, b) => {
        const aTime = a.archivedAt ? new Date(a.archivedAt).getTime() : 0;
        const bTime = b.archivedAt ? new Date(b.archivedAt).getTime() : 0;
        return bTime - aTime;
      });
    } catch (error) {
      logger.error("Failed to get archived jobs", error as Error);
      return [];
    }
  }
}
