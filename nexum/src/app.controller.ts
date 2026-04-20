import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  async healthCheck() {
    let dbStatus = 'down';
    try {
      await this.dataSource.query('SELECT 1');
      dbStatus = 'up';
    } catch {
      dbStatus = 'down';
    }

    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();

    return {
      status: dbStatus === 'up' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(uptime),
      version: process.env.npm_package_version || '0.0.1',
      database: dbStatus,
      memory: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      },
    };
  }
}
