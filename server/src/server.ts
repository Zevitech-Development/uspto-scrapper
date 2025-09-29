import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { createServer } from "http";
import logger from "./utils/logger";
import {
  corsOptions,
  securityHeaders,
  requestSizeLimit,
  healthCheckBypass,
  gracefulShutdown,
} from "./middleware";
import config from "./config/config";
import routes from "./routes";
import database from "./config/database";
import { AuthService } from "./services/auth-service";
import { JobQueueService } from "./services/job-queue";

class Server {
  private app: express.Application;
  private server: any;
  private isShuttingDown = false;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Basic security and headers
    this.app.use(
      helmet({
        contentSecurityPolicy: false,
      })
    );
    this.app.use(securityHeaders);

    // CORS configuration
    this.app.use(cors(corsOptions));

    // Request parsing
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true, limit: "10mb" }));

    // Request size limiting
    this.app.use(requestSizeLimit);

    // Request logging (conditional)
    this.app.use(healthCheckBypass);

    // Morgan HTTP request logging (only in development)
    if (config.isDevelopment()) {
      this.app.use(morgan("dev"));
    }

    // Graceful shutdown check
    this.app.use(gracefulShutdown);

    // Request metadata
    this.app.use((req: express.Request & { requestId?: string }, res, next) => {
      req.requestId = Math.random().toString(36).substring(7);
      res.setHeader("X-Request-ID", req.requestId);
      next();
    });
  }

  private setupRoutes(): void {
    // Health check endpoint (before API prefix)
    this.app.get("/health", (req, res) => {
      res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || "1.0.0",
      });
    });

    // API routes
    this.app.use("/api", routes);

    // Root endpoint
    this.app.get("/", (req, res) => {
      res.json({
        message: "USPTO TSDR API Server",
        version: "1.0.0",
        status: "running",
        endpoints: {
          health: "/health",
          api: "/api",
          docs: "/api/health",
        },
      });
    });

    // 404 handler for unmatched routes
    this.app.use("*", (req, res) => {
      res.status(404).json({
        success: false,
        message: "Endpoint not found",
        error: "Not found",
        path: req.originalUrl,
      });
    });
  }

  private setupErrorHandling(): void {
    // Global error handler
    this.app.use((error: Error, req: any, res: any, next: any) => {
      logger.error("Unhandled application error", error, {
        requestId: req.requestId,
        path: req.path,
        method: req.method,
      });

      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: config.isDevelopment()
            ? error.message
            : "Internal server error",
          error: config.isDevelopment() ? error.stack : "Internal server error",
          requestId: req.requestId,
        });
      }
    });
  }

  public async start(): Promise<void> {
    const port = config.get("port");

    try {
      await database.connect();

      const authService = AuthService.getInstance();
      await authService.createDefaultAdmin();

      // Initialize job queue service to start processing jobs
      JobQueueService.getInstance();
      await new Promise(resolve => setTimeout(resolve, 2000));
      logger.info("Job queue service initialized");
      // Create HTTP server
      this.server = createServer(this.app);

      // Server event listeners
      this.server.on("error", (error: NodeJS.ErrnoException) => {
        if (error.syscall !== "listen") {
          throw error;
        }

        switch (error.code) {
          case "EACCES":
            logger.error(`Port ${port} requires elevated privileges`);
            process.exit(1);
            break;
          case "EADDRINUSE":
            logger.error(`Port ${port} is already in use`);
            process.exit(1);
            break;
          default:
            throw error;
        }
      });

      this.server.on("listening", () => {
        logger.info("Server started successfully", {
          port,
          environment: process.env.NODE_ENV || "development",
          pid: process.pid,
        });
      });

      // Start listening
      this.server.listen(port);

      // Setup graceful shutdown handlers
      this.setupGracefulShutdown();
    } catch (error) {
      logger.error("Failed to start server", error as Error);
      process.exit(1);
    }
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) {
        logger.warn("Shutdown already in progress, forcing exit");
        process.exit(1);
        return;
      }

      this.isShuttingDown = true;
      process.env.SHUTTING_DOWN = "true";

      logger.info(`Received ${signal}, starting graceful shutdown`);

      // Set shutdown timeout
      const shutdownTimeout = setTimeout(() => {
        logger.error("Shutdown timeout reached, forcing exit");
        process.exit(1);
      }, 30000); // 30 second timeout

      try {
        // Stop accepting new requests
        if (this.server) {
          this.server.close(() => {
            logger.info("HTTP server closed");
          });
        }

        await database.disconnect();

        // Close job queue connections
        const jobQueueService = JobQueueService.getInstance();
        await jobQueueService.close();

        clearTimeout(shutdownTimeout);
        logger.info("Graceful shutdown completed");
        process.exit(0);
      } catch (error) {
        logger.error("Error during shutdown", error as Error);
        clearTimeout(shutdownTimeout);
        process.exit(1);
      }
    };

    // Handle different shutdown signals
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGQUIT", () => shutdown("SIGQUIT"));

    // Handle uncaught exceptions
    process.on("uncaughtException", (error: Error) => {
      logger.error("Uncaught exception", error);
      shutdown("uncaughtException");
    });

    // Handle unhandled promise rejections
    process.on("unhandledRejection", (reason: any, promise: Promise<any>) => {
      logger.error("Unhandled promise rejection", new Error(String(reason)), {
        promise: promise.toString(),
      });
      shutdown("unhandledRejection");
    });
  }

  public getApp(): express.Application {
    return this.app;
  }

  public async stop(): Promise<void> {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          logger.info("Server stopped");
          resolve();
        });
      });
    }
  }
}

// Create and start server
const server = new Server();

// Start server if this file is run directly
if (require.main === module) {
  server.start().catch((error) => {
    logger.error("Failed to start application", error);
    process.exit(1);
  });
}

export default server;
