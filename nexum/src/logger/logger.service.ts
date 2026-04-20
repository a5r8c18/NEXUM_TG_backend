import { Injectable, Logger as NestLogger } from '@nestjs/common';
import * as winston from 'winston';
import * as DailyRotateFile from 'winston-daily-rotate-file';

@Injectable()
export class LoggerService extends NestLogger {
  private readonly winston: winston.Logger;

  constructor() {
    super();
    
    const logFormat = winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.json(),
    );

    this.winston = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: logFormat,
      transports: [
        // Console transport for development
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
          ),
        }),
        
        // Daily rotate files for production
        new DailyRotateFile({
          filename: 'logs/application-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '20m',
          maxFiles: '14d',
        }),
        
        // Separate error logs
        new DailyRotateFile({
          filename: 'logs/error-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          level: 'error',
          zippedArchive: true,
          maxSize: '20m',
          maxFiles: '30d',
        }),
      ],
    });
  }

  log(message: any, context?: string) {
    this.winston.info(message, { context });
    super.log(message, context);
  }

  error(message: any, trace?: string, context?: string) {
    this.winston.error(message, { trace, context });
    super.error(message, trace, context);
  }

  warn(message: any, context?: string) {
    this.winston.warn(message, { context });
    super.warn(message, context);
  }

  debug(message: any, context?: string) {
    this.winston.debug(message, { context });
    super.debug(message, context);
  }

  verbose(message: any, context?: string) {
    this.winston.verbose(message, { context });
    super.verbose(message, context);
  }
}
