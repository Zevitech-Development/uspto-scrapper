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
  private queue!: Bull.Queue<JobData>; // Using definite assignment assertion since it's initialized after Redis ready
  private redis: Redis;
  private usptoService: USPTOService;
  private jobs: Map<string, ProcessingJob> = new Map();
  private memoryCleanupInterval?: NodeJS.Timeout;
  private healthCheckInterval?: NodeJS.Timeout;
  private isProcessorSetup = false;

  private constructor() {
    // Use consistent Redis configuration
    const redisConfig = {
      port: Number(process.env.REDIS_PORT),
      host: process.env.REDIS_HOST!,
      username: process.env.REDIS_USERNAME!,
      password: process.env.REDIS_PASSWORD!,
      tls: {},
      lazyConnect: false, // Changed to false to ensure immediate connection
      keepAlive: 30000,
      family: 4,
      connectTimeout: 10000,
      commandTimeout: 5000,
    };

    this.redis = new Redis(redisConfig);

    // Enhanced Redis event handlers
    this.redis.on("error", (error) => {
      logger.error("Redis connection error", error);
    });

    this.redis.on("connect", () => {
      logger.info("Redis connected successfully");
    });

    this.redis.on("ready", () => {
      logger.info("Redis ready for operations");
      // Only setup queue and processors after Redis is ready
      this.initializeQueueAfterRedisReady();
    });

    this.redis.on("close", () => {
      logger.warn("Redis connection closed");
    });

    this.usptoService = new USPTOService();
    // Remove immediate initialization - will be done after Redis is ready
  }

  private initializeQueueAfterRedisReady(): void {
    try {
      if (!this.queue) {
        this.queue = this.createQueue();
        this.setupJobProcessors();
        this.setupMemoryCleanup();
        logger.info("Queue and processors initialized after Redis ready");
      }
    } catch (error) {
      logger.error("Failed to initialize queue after Redis ready", error as Error);
    }
  }

  public static getInstance(): JobQueueService {
    if (!JobQueueService.instance) {
      JobQueueService.instance = new JobQueueService();
    }
    return JobQueueService.instance;
  }

  private createQueue(): Bull.Queue<JobData> {
    const redisConfig = {
      port: Number(process.env.REDIS_PORT),
      host: process.env.REDIS_HOST!,
      username: process.env.REDIS_USERNAME!,
      password: process.env.REDIS_PASSWORD!,
      tls: {},
      family: 4,
      keepAlive: 30000,
      lazyConnect: false, // Ensure immediate connection for Bull queue too
    };

    const queue = new Bull<JobData>("trademark-processing", {
      redis: redisConfig,
      settings: {
        stalledInterval: 30 * 1000, // 30 seconds
        maxStalledCount: 1,
        retryProcessDelay: 5000,
      },
      defaultJobOptions: {
        removeOnComplete: 10, // Keep more completed jobs for debugging
        removeOnFail: 5, // Keep more failed jobs for debugging
        attempts: 2, // Allow one retry
        timeout: 24 * 60 * 60 * 1000, // 24 hours
        backoff: {
          type: "exponential",
          delay: 5000,
        },
        jobId: undefined,
      },
    });

    // Enhanced queue event handlers
    queue.on("error", (error) => {
      logger.error("Queue connection error", error);
    });

    queue.on("ready", () => {
      logger.info("Queue is ready and connected");

      // Verify processor is working after queue is ready
      setTimeout(() => {
        this.verifyProcessorStatus();
      }, 5000);
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
      logger.warn("Processor already setup, skipping duplicate setup");
      return;
    }

    logger.info("Setting up job processors...");

    try {
      this.queue.process(1, async (job) => {
        logger.info("🔥 PROCESSING JOB STARTED", {
          jobId: job.data.jobId,
          bullJobId: job.id as string,
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

      // Setup event listeners (but avoid duplicates)
      this.setupQueueEventListeners();

      this.isProcessorSetup = true;
      logger.info("✅ Job processor registered successfully");
    } catch (error) {
      logger.error("Failed to setup job processor", error as Error);
      throw error;
    }
  }

  private setupQueueEventListeners(): void {
    // Remove existing listeners to avoid duplicates
    this.queue.removeAllListeners("completed");
    this.queue.removeAllListeners("failed");
    this.queue.removeAllListeners("progress");
    this.queue.removeAllListeners("stalled");
    this.queue.removeAllListeners("waiting");
    this.queue.removeAllListeners("active");

    // Job lifecycle events
    this.queue.on("waiting", (jobId) => {
      logger.info("📋 Job waiting for processing", { jobId });
    });

    this.queue.on("active", (job) => {
      logger.info("🚀 Job started processing", {
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
    try {
      const [waiting, active, completed, failed] = await Promise.all([
        this.queue.getWaiting(),
        this.queue.getActive(),
        this.queue.getCompleted(),
        this.queue.getFailed(),
      ]);

      logger.info("🔍 Processor Status Check", {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        processorSetup: this.isProcessorSetup,
      });

      // If jobs are waiting but none active, there might be an issue
      if (waiting.length > 0 && active.length === 0) {
        logger.warn("🚨 Jobs waiting but none active - investigating...");

        // Try to resume the queue in case it's paused
        const isPaused = await this.queue.isPaused();
        if (isPaused) {
          logger.info("Queue was paused, resuming...");
          await this.queue.resume();
        }

        // Force process the next job
        setTimeout(async () => {
          const stillWaiting = await this.queue.getWaiting();
          if (stillWaiting.length > 0) {
            logger.warn("🔄 Manually triggering job processing...");
            // This will trigger the processor to pick up waiting jobs
            await this.queue.resume();
          }
        }, 2000);
      }
    } catch (error) {
      logger.error("Failed to verify processor status", error as Error);
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
      if (!this.queue) {
        throw new Error("Queue not initialized yet. Please wait for Redis connection.");
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
        {
          jobId,
          serialNumbers,
          userId,
        },
        {
          delay: 0,
          priority: 0,
        }
      );

      logger.info("Added trademark processing job to queue", {
        action: "job_added",
        jobId,
        bullJobId: bullJob.id as string,
        totalRecords: serialNumbers.length,
      });

      // Verify job was added correctly
      setTimeout(async () => {
        const bullJobCheck = await this.queue.getJob(bullJob.id!);
        const state = bullJobCheck
          ? await bullJobCheck.getState()
          : "not found";
        logger.info("Job verification", {
          jobId,
          bullJobId: bullJob.id as string,
          state,
        });
      }, 1000);

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
      // Check if job was already processed (defensive check)
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

      const results = await this.usptoService.fetchMultipleTrademarkData(
        serialNumbers,
        (processed, total) => {
          // Defensive checks to prevent race conditions
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

      // Set completion flag before any completion operations
      jobCompleted = true;

      const duration = Date.now() - startTime;
      const successCount = results.filter((r) => r.status === "success").length;

      // Final status update with all results
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
      throw error;
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

      // Last resort: MongoDB (only for completed/failed jobs)
      const mongoJob = await this.getJobFromMongoDB(jobId);
      if (mongoJob) {
        if (mongoJob.status === "completed" || mongoJob.status === "failed") {
          this.jobs.set(jobId, mongoJob);
          await this.redis.setex(
            `job:${jobId}`,
            3600,
            JSON.stringify(mongoJob)
          );
          return mongoJob;
        } else {
          logger.warn(
            "Found active job in MongoDB but not in Redis - potential stale data",
            {
              jobId,
              mongoStatus: mongoJob.status,
            }
          );
          return null;
        }
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
        logger.warn("Job not found in memory cache for status update", {
          jobId,
        });
        return;
      }

      const updatedJob: ProcessingJob = { ...existingJob, ...updates, status };
      this.jobs.set(jobId, updatedJob);

      // Update Redis for important state changes
      const shouldUpdateRedis =
        status === "completed" ||
        status === "failed" ||
        status === "processing" ||
        (updates.processedRecords && updates.processedRecords % 25 === 0);

      if (shouldUpdateRedis) {
        const pipeline = this.redis.pipeline();

        // Update status sets
        if (existingJob.status !== status) {
          pipeline.srem(`job:status:${existingJob.status}`, jobId);
          pipeline.sadd(`job:status:${status}`, jobId);
        }

        // Update job data
        const ttl =
          status === "completed" || status === "failed" ? 604800 : 3600;
        pipeline.setex(`job:${jobId}`, ttl, JSON.stringify(updatedJob));

        await pipeline.exec();
      }

      // Update MongoDB for important changes
      if (
        existingJob.status !== status ||
        status === "completed" ||
        status === "failed"
      ) {
        await ProcessingJobModel.updateOne(
          { jobId },
          {
            $set: {
              status,
              processedRecords:
                updates.processedRecords || existingJob.processedRecords,
              ...(updates.completedAt && { completedAt: updates.completedAt }),
              ...(updates.errorMessage && {
                errorMessage: updates.errorMessage,
              }),
            },
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

      // Don't update progress if job is already completed
      const currentJob = this.jobs.get(jobId);
      if (
        currentJob &&
        (currentJob.status === "completed" || currentJob.status === "failed")
      ) {
        return;
      }

      // Throttle updates
      const shouldUpdate =
        !existing ||
        now - existing.lastUpdate > 30000 || // 30 seconds
        processed === total ||
        Math.floor((processed / total) * 4) !==
          Math.floor((existing.processed / existing.total) * 4); // Every 25%

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
          if (processed % 50 === 0 || processed === total) {
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

  // [Rest of the methods remain the same - getQueueStats, cancelJob, retryJob, etc.]
  // I'll include the key methods that might have issues:

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

  private setupMemoryCleanup(): void {
    // Clear existing intervals
    if (this.memoryCleanupInterval) {
      clearInterval(this.memoryCleanupInterval);
    }
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Memory cleanup every 10 minutes
    this.memoryCleanupInterval = setInterval(() => {
      this.cleanupMemoryCache();
    }, 10 * 60 * 1000);

    // Health check every 5 minutes
    this.healthCheckInterval = setInterval(() => {
      this.logQueueHealth();
    }, 5 * 60 * 1000);

    // Initial health check
    setTimeout(() => {
      this.logQueueHealth();
    }, 30 * 1000);

    // Process cleanup
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
      // Use MongoDB for completed jobs (more reliable)
      if (status === "completed") {
        const mongoJobs = await ProcessingJobModel.find({ status: "completed" })
          .sort({ completedAt: -1 })
          .limit(50)
          .lean();

        const jobs: ProcessingJob[] = [];
        for (const mongoJob of mongoJobs) {
          const fullJob = await this.getJobFromMongoDB(mongoJob.jobId);
          if (fullJob) jobs.push(fullJob);
        }
        return jobs;
      }

      // For active jobs, use Redis but with single pipeline
      const pipeline = this.redis.pipeline();
      const jobIds = await this.redis.smembers(`job:status:${status}`);

      if (jobIds.length === 0) return [];

      // Batch get all jobs in single pipeline
      jobIds.forEach((id) => pipeline.get(`job:${id}`));
      const results = await pipeline.exec();

      const jobs: ProcessingJob[] = [];
      results?.forEach(([err, value], index) => {
        if (!err && value) {
          try {
            const job: ProcessingJob = JSON.parse(value as string);
            job.createdAt = new Date(job.createdAt);
            if (job.completedAt) job.completedAt = new Date(job.completedAt);
            if (job.status === status) jobs.push(job);
          } catch (parseError) {
            logger.warn(`Failed to parse job ${jobIds[index]}`);
          }
        }
      });

      return jobs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
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
}
