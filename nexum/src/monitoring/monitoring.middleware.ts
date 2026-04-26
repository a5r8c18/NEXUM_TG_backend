/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable prettier/prettier */
import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { MonitoringService } from './monitoring.service';

@Injectable()
export class MonitoringMiddleware implements NestMiddleware {
  private readonly logger = new Logger(MonitoringMiddleware.name);

  constructor(private readonly monitoringService: MonitoringService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const startTime = Date.now();
    const originalEnd = res.end;
    const monitoringService = this.monitoringService;
    const logger = this.logger;

    // Override res.end to capture response time and status
    res.end = function(this: Response, ...args: any[]) {
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      const isSuccess = res.statusCode >= 200 && res.statusCode < 400;

      // Record metrics
      monitoringService.recordRequest(responseTime, isSuccess);

      // Log request details
      logger.log(
        `${req.method} ${req.originalUrl} - ${res.statusCode} - ${responseTime}ms`,
      );

      // Call original end
      originalEnd.apply(this, args);
    }.bind(res);

    next();
  }
}
