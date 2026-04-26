/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/await-thenable */
/* eslint-disable @typescript-eslint/require-await */
import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as os from 'os';
import * as process from 'process';
import { Voucher } from '../entities/voucher.entity';
import { User } from '../entities/user.entity';
import { Company } from '../entities/company.entity';

export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  components: {
    database: ComponentHealth;
    memory: ComponentHealth;
    cpu: ComponentHealth;
    disk: ComponentHealth;
  };
}

export interface ComponentHealth {
  status: 'healthy' | 'unhealthy' | 'degraded';
  details?: any;
  responseTime?: number;
  lastCheck: string;
}

export interface ApplicationMetrics {
  timestamp: string;
  uptime: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  cpu: {
    usage: number;
    cores: number;
  };
  database: {
    connections: number;
    queryTime: number;
  };
  requests: {
    total: number;
    success: number;
    error: number;
    averageResponseTime: number;
  };
  business: {
    totalVouchers: number;
    totalUsers: number;
    totalCompanies: number;
    activeCompanies: number;
  };
}

@Injectable()
export class MonitoringService implements OnModuleInit {
  private readonly startTime = Date.now();
  private requestMetrics = {
    total: 0,
    success: 0,
    error: 0,
    responseTimes: [] as number[],
  };

  constructor(
    @InjectRepository(Voucher)
    private readonly voucherRepo: Repository<Voucher>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
  ) {}

  async onModuleInit() {
    // Start monitoring interval
    setInterval(() => {
      this.collectMetrics();
    }, 30000); // Collect metrics every 30 seconds
  }

  async getHealthStatus(): Promise<HealthStatus> {
    const components = await this.checkAllComponents();
    const overallStatus = this.calculateOverallStatus(components);

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      components,
    };
  }

  async getDetailedHealthStatus(): Promise<HealthStatus> {
    const basicStatus = await this.getHealthStatus();

    // Add more detailed checks
    const detailedComponents = {
      ...basicStatus.components,
      database: await this.getDetailedDatabaseHealth(),
      memory: await this.getDetailedMemoryHealth(),
      cpu: await this.getDetailedCpuHealth(),
      disk: await this.getDetailedDiskHealth(),
    };

    return {
      ...basicStatus,
      components: detailedComponents,
    };
  }

  async getMetrics(): Promise<ApplicationMetrics> {
    const now = Date.now();
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    // Get business metrics
    const [totalVouchers, totalUsers, totalCompanies, activeCompanies] =
      await Promise.all([
        this.voucherRepo.count(),
        this.userRepo.count({ where: { isActive: true } }),
        this.companyRepo.count(),
        this.companyRepo.count({ where: { isActive: true } }),
      ]);

    return {
      timestamp: new Date().toISOString(),
      uptime: now - this.startTime,
      memory: {
        used: memUsage.heapUsed,
        total: memUsage.heapTotal,
        percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100,
      },
      cpu: {
        usage: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to seconds
        cores: os.cpus().length,
      },
      database: {
        connections: 1, // Simplified - would need connection pool monitoring
        queryTime: 0, // Would need query timing middleware
      },
      requests: {
        total: this.requestMetrics.total,
        success: this.requestMetrics.success,
        error: this.requestMetrics.error,
        averageResponseTime: this.calculateAverageResponseTime(),
      },
      business: {
        totalVouchers,
        totalUsers,
        totalCompanies,
        activeCompanies,
      },
    };
  }

  async getPrometheusMetrics(): Promise<string> {
    const metrics = await this.getMetrics();
    const health = await this.getHealthStatus();

    const prometheusMetrics = [
      `# HELP nexum_uptime_seconds Application uptime in seconds`,
      `# TYPE nexum_uptime_seconds counter`,
      `nexum_uptime_seconds ${metrics.uptime / 1000}`,

      `# HELP nexum_memory_usage_bytes Memory usage in bytes`,
      `# TYPE nexum_memory_usage_bytes gauge`,
      `nexum_memory_usage_bytes{type="used"} ${metrics.memory.used}`,
      `nexum_memory_usage_bytes{type="total"} ${metrics.memory.total}`,

      `# HELP nexum_memory_usage_percentage Memory usage percentage`,
      `# TYPE nexum_memory_usage_percentage gauge`,
      `nexum_memory_usage_percentage ${metrics.memory.percentage}`,

      `# HELP nexum_cpu_usage_seconds_total CPU usage in seconds`,
      `# TYPE nexum_cpu_usage_seconds_total counter`,
      `nexum_cpu_usage_seconds_total ${metrics.cpu.usage}`,

      `# HELP nexum_requests_total Total number of requests`,
      `# TYPE nexum_requests_total counter`,
      `nexum_requests_total ${metrics.requests.total}`,

      `# HELP nexum_requests_success_total Total number of successful requests`,
      `# TYPE nexum_requests_success_total counter`,
      `nexum_requests_success_total ${metrics.requests.success}`,

      `# HELP nexum_requests_error_total Total number of error requests`,
      `# TYPE nexum_requests_error_total counter`,
      `nexum_requests_error_total ${metrics.requests.error}`,

      `# HELP nexum_business_vouchers_total Total number of vouchers`,
      `# TYPE nexum_business_vouchers_total gauge`,
      `nexum_business_vouchers_total ${metrics.business.totalVouchers}`,

      `# HELP nexum_business_users_total Total number of active users`,
      `# TYPE nexum_business_users_total gauge`,
      `nexum_business_users_total ${metrics.business.totalUsers}`,

      `# HELP nexum_business_companies_total Total number of companies`,
      `# TYPE nexum_business_companies_total gauge`,
      `nexum_business_companies_total ${metrics.business.totalCompanies}`,

      `# HELP nexum_business_companies_active_total Total number of active companies`,
      `# TYPE nexum_business_companies_active_total gauge`,
      `nexum_business_companies_active_total ${metrics.business.activeCompanies}`,

      `# HELP nexum_health_status Health status (1=healthy, 0.5=degraded, 0=unhealthy)`,
      `# TYPE nexum_health_status gauge`,
      `nexum_health_status ${health.status === 'healthy' ? 1 : health.status === 'degraded' ? 0.5 : 0}`,
    ];

    return prometheusMetrics.join('\n') + '\n';
  }

  getUptime() {
    return {
      uptime: Date.now() - this.startTime,
      uptimeFormatted: this.formatUptime(Date.now() - this.startTime),
      startTime: new Date(this.startTime).toISOString(),
    };
  }

  async getPerformanceMetrics() {
    const metrics = await this.getMetrics();
    const health = await this.getDetailedHealthStatus();

    return {
      ...metrics,
      health,
      performance: {
        averageResponseTime: this.calculateAverageResponseTime(),
        requestsPerSecond: this.calculateRequestsPerSecond(),
        errorRate: this.calculateErrorRate(),
        memoryEfficiency: this.calculateMemoryEfficiency(),
        cpuEfficiency: this.calculateCpuEfficiency(),
      },
    };
  }

  // Public methods for middleware to call
  recordRequest(responseTime: number, success: boolean) {
    this.requestMetrics.total++;
    if (success) {
      this.requestMetrics.success++;
    } else {
      this.requestMetrics.error++;
    }
    this.requestMetrics.responseTimes.push(responseTime);

    // Keep only last 1000 response times
    if (this.requestMetrics.responseTimes.length > 1000) {
      this.requestMetrics.responseTimes =
        this.requestMetrics.responseTimes.slice(-1000);
    }
  }

  // Private helper methods
  private async checkAllComponents() {
    const [database, memory, cpu, disk] = await Promise.all([
      this.checkDatabaseHealth(),
      this.checkMemoryHealth(),
      this.checkCpuHealth(),
      this.checkDiskHealth(),
    ]);

    return { database, memory, cpu, disk };
  }

  private calculateOverallStatus(
    components: any,
  ): 'healthy' | 'unhealthy' | 'degraded' {
    const statuses = Object.values(components).map((c: any) => c.status);

    if (statuses.includes('unhealthy')) {
      return 'unhealthy';
    }
    if (statuses.includes('degraded')) {
      return 'degraded';
    }
    return 'healthy';
  }

  private async checkDatabaseHealth(): Promise<ComponentHealth> {
    const startTime = Date.now();
    try {
      await this.voucherRepo.query('SELECT 1');
      const responseTime = Date.now() - startTime;

      return {
        status: 'healthy',
        responseTime,
        lastCheck: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: error.message,
        lastCheck: new Date().toISOString(),
      };
    }
  }

  private async getDetailedDatabaseHealth(): Promise<ComponentHealth> {
    const basicHealth = await this.checkDatabaseHealth();

    if (basicHealth.status === 'healthy') {
      try {
        const connectionCount = await this.voucherRepo.query(
          'SELECT count(*) as count FROM pg_stat_activity',
        );

        return {
          ...basicHealth,
          details: {
            connections: connectionCount[0]?.count || 0,
            maxConnections: 100, // This would come from config
          },
        };
      } catch (error) {
        return {
          ...basicHealth,
          status: 'degraded',
          details: { error: error.message },
        };
      }
    }

    return basicHealth;
  }

  private checkMemoryHealth(): ComponentHealth {
    const memUsage = process.memoryUsage();
    const usagePercentage = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (usagePercentage > 90) {
      status = 'unhealthy';
    } else if (usagePercentage > 75) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    return {
      status,
      details: {
        used: memUsage.heapUsed,
        total: memUsage.heapTotal,
        percentage: usagePercentage,
      },
      lastCheck: new Date().toISOString(),
    };
  }

  private async getDetailedMemoryHealth(): Promise<ComponentHealth> {
    const basicHealth = this.checkMemoryHealth();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const systemUsage = ((totalMemory - freeMemory) / totalMemory) * 100;

    return {
      ...basicHealth,
      details: {
        ...basicHealth.details,
        systemTotal: totalMemory,
        systemFree: freeMemory,
        systemUsagePercentage: systemUsage,
      },
    };
  }

  private checkCpuHealth(): ComponentHealth {
    const cpus = os.cpus();
    const loadAvg = os.loadavg()[0]; // 1 minute load average
    const cpuUsage = (loadAvg / cpus.length) * 100;

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (cpuUsage > 90) {
      status = 'unhealthy';
    } else if (cpuUsage > 75) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    return {
      status,
      details: {
        loadAverage: loadAvg,
        cores: cpus.length,
        usagePercentage: cpuUsage,
      },
      lastCheck: new Date().toISOString(),
    };
  }

  private async getDetailedCpuHealth(): Promise<ComponentHealth> {
    const basicHealth = this.checkCpuHealth();
    const cpus = os.cpus();

    return {
      ...basicHealth,
      details: {
        ...basicHealth.details,
        model: cpus[0]?.model,
        speed: cpus[0]?.speed,
        loadAverages: os.loadavg(),
      },
    };
  }

  private checkDiskHealth(): ComponentHealth {
    // Simplified disk check - in production you'd check actual disk usage
    return {
      status: 'healthy',
      details: {
        // Would implement actual disk usage checking
        usage: 'Unknown',
      },
      lastCheck: new Date().toISOString(),
    };
  }

  private async getDetailedDiskHealth(): Promise<ComponentHealth> {
    const basicHealth = this.checkDiskHealth();

    // In production, implement actual disk space checking
    return {
      ...basicHealth,
      details: {
        ...basicHealth.details,
        note: 'Disk usage monitoring not implemented',
      },
    };
  }

  private calculateAverageResponseTime(): number {
    if (this.requestMetrics.responseTimes.length === 0) return 0;
    const sum = this.requestMetrics.responseTimes.reduce((a, b) => a + b, 0);
    return sum / this.requestMetrics.responseTimes.length;
  }

  private calculateRequestsPerSecond(): number {
    const uptimeSeconds = (Date.now() - this.startTime) / 1000;
    return this.requestMetrics.total / uptimeSeconds;
  }

  private calculateErrorRate(): number {
    if (this.requestMetrics.total === 0) return 0;
    return (this.requestMetrics.error / this.requestMetrics.total) * 100;
  }

  private calculateMemoryEfficiency(): number {
    const memUsage = process.memoryUsage();
    return (memUsage.heapUsed / memUsage.heapTotal) * 100;
  }

  private calculateCpuEfficiency(): number {
    const cpus = os.cpus();
    const loadAvg = os.loadavg()[0];
    return (loadAvg / cpus.length) * 100;
  }

  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  private collectMetrics() {
    // This would be called periodically to collect additional metrics
    // Could include things like:
    // - Database query performance
    // - External API call performance
    // - Cache hit rates
    // - Business KPIs
  }
}
