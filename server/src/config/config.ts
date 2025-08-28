import { AppConfig, AppError } from "../types/global-interface";
import dotenv from "dotenv";

dotenv.config();

class ConfigManager {
  private static instance: ConfigManager;
  private config: AppConfig;

  private constructor() {
    this.config = this.loadConfig();
    this.validateConfig();
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private loadConfig(): AppConfig {
    return {
      port: parseInt(process.env.PORT || "3001", 10),
      mongoUri: process.env.MONGO_URI || "mongodb://localhost:27017/uspto-tsdr",
      redisUri: process.env.REDIS_URI || "redis://localhost:6379",
      usptoApiKey: process.env.USPTO_API_KEY || "",
      usptoApiBaseUrl:
        process.env.USPTO_API_BASE_URL || "https://tsdrapi.uspto.gov/ts/cd",
      corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:3000").split(
        ","
      ),
      rateLimitWindowMs: parseInt(
        process.env.RATE_LIMIT_WINDOW_MS || "900000",
        10
      ),
      rateLimitMaxRequests: parseInt(
        process.env.RATE_LIMIT_MAX_REQUESTS || "100",
        10
      ),
      usptoRateLimitPerMinute: parseInt(
        process.env.USPTO_RATE_LIMIT_PER_MINUTE || "50",
        10
      ),
      jwtSecret:
        process.env.JWT_SECRET || "fallback-secret-key-change-in-production",
      jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
    };
  }

  private validateConfig(): void {
    const requiredFields: (keyof AppConfig)[] = ["usptoApiKey", "jwtSecret"];

    for (const field of requiredFields) {
      if (!this.config[field]) {
        throw new AppError(
          `Missing required configuration: ${field}`,
          500,
          "CONFIG_MISSING"
        );
      }
    }

    if (this.config.jwtSecret.length < 32) {
      throw new AppError(
        "JWT secret must be at least 32 characters long for security",
        500,
        "CONFIG_INVALID_JWT_SECRET"
      );
    }

    // Validate port range
    if (this.config.port < 1 || this.config.port > 65535) {
      throw new AppError(
        "Invalid port number. Must be between 1 and 65535",
        500,
        "CONFIG_INVALID_PORT"
      );
    }

    // Validate USPTO rate limit
    if (
      this.config.usptoRateLimitPerMinute < 1 ||
      this.config.usptoRateLimitPerMinute > 120
    ) {
      throw new AppError(
        "USPTO rate limit must be between 1 and 120 requests per minute",
        500,
        "CONFIG_INVALID_RATE_LIMIT"
      );
    }
  }

  public getConfig(): AppConfig {
    return { ...this.config };
  }

  public get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.config[key];
  }

  public updateConfig(updates: Partial<AppConfig>): void {
    this.config = { ...this.config, ...updates };
    this.validateConfig();
  }

  public isDevelopment(): boolean {
    return process.env.NODE_ENV === "development";
  }

  public isProduction(): boolean {
    return process.env.NODE_ENV === "production";
  }

  public isTest(): boolean {
    return process.env.NODE_ENV === "test";
  }
}

export const config = ConfigManager.getInstance();
export default config;
