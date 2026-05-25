import { Injectable, LoggerService as NestLoggerService, Scope } from '@nestjs/common';
import * as winston from 'winston';
import * as DailyRotateFile from 'winston-daily-rotate-file';

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
}

export enum LogCategory {
  AUTH = 'AUTH',
  SECURITY = 'SECURITY',
  AUDIT = 'AUDIT',
  SYSTEM = 'SYSTEM',
  API = 'API',
  DATABASE = 'DATABASE',
}

export interface LogContext {
  userId?: string;
  userEmail?: string;
  companyId?: string;
  ipAddress?: string;
  userAgent?: string;
  action?: string;
  resource?: string;
  details?: any;
  [key: string]: any; // Allow additional properties
}

@Injectable({ scope: Scope.TRANSIENT })
export class LoggerService implements NestLoggerService {
  private logger: winston.Logger;
  private context?: string;

  constructor() {
    const logFormat = winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.splat(),
      winston.format.json()
    );

    const consoleFormat = winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message, context, ...meta }) => {
        const ctx = context ? `[${context}]` : '';
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
        return `${timestamp} ${level}: ${ctx} ${message} ${metaStr}`;
      })
    );

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: logFormat,
      transports: [
        // Console transport
        new winston.transports.Console({
          format: consoleFormat,
        }),

        // Error log file with daily rotation
        new DailyRotateFile({
          filename: 'logs/error-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '20m',
          maxFiles: '30d',
          level: 'error',
        }),

        // Combined log file with daily rotation
        new DailyRotateFile({
          filename: 'logs/combined-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '20m',
          maxFiles: '30d',
        }),

        // Security log file with daily rotation
        new DailyRotateFile({
          filename: 'logs/security-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '20m',
          maxFiles: '90d',
          level: 'warn',
        }),

        // Audit log file with daily rotation
        new DailyRotateFile({
          filename: 'logs/audit-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '20m',
          maxFiles: '365d',
        }),
      ],
    });
  }

  setContext(context: string) {
    this.context = context;
  }

  log(message: string, context?: string) {
    this.logger.info(message, { context: context || this.context });
  }

  error(message: string, trace?: string, context?: string) {
    this.logger.error(message, { trace, context: context || this.context });
  }

  warn(message: string, context?: string) {
    this.logger.warn(message, { context: context || this.context });
  }

  debug(message: string, context?: string) {
    this.logger.debug(message, { context: context || this.context });
  }

  verbose(message: string, context?: string) {
    this.logger.verbose(message, { context: context || this.context });
  }

  // Structured logging methods
  logSecurity(category: LogCategory, message: string, context: LogContext) {
    this.logger.warn(message, {
      category,
      context: this.context,
      ...context,
    });
  }

  logAudit(action: string, resource: string, context: LogContext) {
    this.logger.info(`AUDIT: ${action} on ${resource}`, {
      category: LogCategory.AUDIT,
      action,
      resource,
      context: this.context,
      ...context,
    });
  }

  logApiRequest(method: string, url: string, statusCode: number, responseTime: number, context: LogContext) {
    this.logger.info(`API: ${method} ${url} - ${statusCode}`, {
      category: LogCategory.API,
      method,
      url,
      statusCode,
      responseTime,
      context: this.context,
      ...context,
    });
  }

  logDatabase(query: string, duration: number, context: LogContext) {
    this.logger.debug(`DB: ${query.substring(0, 100)}...`, {
      category: LogCategory.DATABASE,
      query: query.substring(0, 200),
      duration,
      context: this.context,
      ...context,
    });
  }
}
