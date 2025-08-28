import config from '../config/config';
import { LogContext, LogLevel } from '../types/global-interface';
import winston from 'winston';


class Logger {
  private static instance: Logger;
  private winston: winston.Logger;

  private constructor() {
    this.winston = this.createLogger();
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private createLogger(): winston.Logger {
    const logFormat = winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json(),
      winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
        let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
        
        if (Object.keys(meta).length > 0) {
          log += ` ${JSON.stringify(meta)}`;
        }
        
        if (stack) {
          log += `\n${stack}`;
        }
        
        return log;
      })
    );

    const transports: winston.transport[] = [
      new winston.transports.Console({
        format: config.isDevelopment() 
          ? winston.format.combine(
              winston.format.colorize(),
              winston.format.simple()
            )
          : logFormat
      })
    ];

    if (config.isProduction()) {
      transports.push(
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
          format: logFormat
        }),
        new winston.transports.File({
          filename: 'logs/combined.log',
          format: logFormat
        })
      );
    }

    return winston.createLogger({
      level: config.isDevelopment() ? 'debug' : 'info',
      format: logFormat,
      transports,
      exceptionHandlers: [
        new winston.transports.File({ filename: 'logs/exceptions.log' })
      ],
      rejectionHandlers: [
        new winston.transports.File({ filename: 'logs/rejections.log' })
      ]
    });
  }

  private formatContext(context?: LogContext): object {
    if (!context) return {};
    
    return Object.entries(context).reduce((acc, [key, value]) => {
      if (value !== undefined && value !== null) {
        acc[key] = value;
      }
      return acc;
    }, {} as any);
  }

  public error(message: string, error?: Error, context?: LogContext): void {
    this.winston.error(message, {
      ...this.formatContext(context),
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : undefined
    });
  }

  public warn(message: string, context?: LogContext): void {
    this.winston.warn(message, this.formatContext(context));
  }

  public info(message: string, context?: LogContext): void {
    this.winston.info(message, this.formatContext(context));
  }

  public debug(message: string, context?: LogContext): void {
    this.winston.debug(message, this.formatContext(context));
  }

  public log(level: LogLevel, message: string, context?: LogContext): void {
    this.winston.log(level, message, this.formatContext(context));
  }

  public usptoApiCall(serialNumber: string, success: boolean, responseTime?: number): void {
    this.info('USPTO API call completed', {
      action: 'uspto_api_call',
      serialNumber,
      success,
      responseTime
    });
  }

  public jobProgress(jobId: string, processed: number, total: number): void {
    this.info('Job progress update', {
      action: 'job_progress',
      jobId,
      processed,
      total,
      percentage: Math.round((processed / total) * 100)
    });
  }

  public jobCompleted(jobId: string, totalRecords: number, successCount: number, duration: number): void {
    this.info('Job completed', {
      action: 'job_completed',
      jobId,
      totalRecords,
      successCount,
      failureCount: totalRecords - successCount,
      duration,
      successRate: Math.round((successCount / totalRecords) * 100)
    });
  }

  public rateLimitHit(endpoint: string, remainingTime: number): void {
    this.warn('Rate limit hit', {
      action: 'rate_limit_hit',
      endpoint,
      remainingTime
    });
  }

  public excelProcessed(filename: string, serialNumbers: number): void {
    this.info('Excel file processed', {
      action: 'excel_processed',
      filename,
      serialNumbers
    });
  }
}

export const logger = Logger.getInstance();
export default logger;