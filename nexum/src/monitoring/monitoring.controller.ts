/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Controller, Get, Inject, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MonitoringService } from './monitoring.service';
import { Request } from 'express';

@ApiTags('Monitoring')
@Controller('monitoring')
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Get('health')
  @ApiOperation({ summary: 'Basic health check' })
  @ApiResponse({ status: 200, description: 'Application is healthy' })
  async healthCheck() {
    return this.monitoringService.getHealthStatus();
  }

  @Get('health/detailed')
  @ApiOperation({ summary: 'Detailed health check with all components' })
  @ApiResponse({ status: 200, description: 'Detailed health status' })
  async detailedHealthCheck() {
    return this.monitoringService.getDetailedHealthStatus();
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Get application metrics' })
  @ApiResponse({ status: 200, description: 'Application metrics' })
  async getMetrics() {
    return this.monitoringService.getMetrics();
  }

  @Get('metrics/prometheus')
  @ApiOperation({ summary: 'Get metrics in Prometheus format' })
  @ApiResponse({ status: 200, description: 'Prometheus metrics' })
  async getPrometheusMetrics(@Req() req: Request) {
    const metrics = await this.monitoringService.getPrometheusMetrics();
    if (req.res) {
      req.res.setHeader('Content-Type', 'text/plain');
    }
    return metrics;
  }

  @Get('uptime')
  @ApiOperation({ summary: 'Get application uptime' })
  @ApiResponse({ status: 200, description: 'Application uptime' })
  async getUptime() {
    return this.monitoringService.getUptime();
  }

  @Get('performance')
  @ApiOperation({ summary: 'Get performance metrics' })
  @ApiResponse({ status: 200, description: 'Performance metrics' })
  async getPerformanceMetrics() {
    return this.monitoringService.getPerformanceMetrics();
  }
}
