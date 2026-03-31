import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, AuditAction, AuditResource } from '../entities/audit-log.entity';

export interface CreateAuditLogDto {
  companyId?: number | null;
  userId?: string;
  userName?: string;
  userEmail?: string;
  userRole?: string;
  action: AuditAction;
  resource: AuditResource;
  resourceId?: string;
  resourceName?: string;
  ipAddress?: string;
  userAgent?: string;
  endpoint?: string;
  method?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  success?: boolean;
  errorMessage?: string;
  sessionId?: string;
  durationMs?: number;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
  ) {}

  async log(data: CreateAuditLogDto): Promise<void> {
    try {
      const auditLog = this.auditLogRepo.create({
        ...data,
        companyId: data.companyId || null, // Asegurar null si no hay companyId
        createdAt: new Date(),
      });
      await this.auditLogRepo.save(auditLog);
    } catch (error) {
      console.error('Error al crear audit log:', error);
    }
  }

  async findByCompany(
    companyId: number,
    filters?: {
      userId?: string;
      action?: AuditAction;
      resource?: AuditResource;
      resourceId?: string;
      fromDate?: Date;
      toDate?: Date;
      success?: boolean;
    }
  ): Promise<AuditLog[]> {
    const queryBuilder = this.auditLogRepo.createQueryBuilder('audit');
    queryBuilder.where('audit.companyId = :companyId', { companyId });

    if (filters?.userId) {
      queryBuilder.andWhere('audit.userId = :userId', { userId: filters.userId });
    }

    if (filters?.action) {
      queryBuilder.andWhere('audit.action = :action', { action: filters.action });
    }

    if (filters?.resource) {
      queryBuilder.andWhere('audit.resource = :resource', { resource: filters.resource });
    }

    if (filters?.resourceId) {
      queryBuilder.andWhere('audit.resourceId = :resourceId', { resourceId: filters.resourceId });
    }

    if (filters?.fromDate) {
      queryBuilder.andWhere('audit.createdAt >= :fromDate', { fromDate: filters.fromDate });
    }

    if (filters?.toDate) {
      queryBuilder.andWhere('audit.createdAt <= :toDate', { toDate: filters.toDate });
    }

    if (filters?.success !== undefined) {
      queryBuilder.andWhere('audit.success = :success', { success: filters.success });
    }

    return queryBuilder.orderBy('audit.createdAt', 'DESC').limit(1000).getMany();
  }

  async findByUser(
    userId: string,
    companyId: number,
    limit: number = 100
  ): Promise<AuditLog[]> {
    return this.auditLogRepo.find({
      where: {
        userId,
        companyId,
      },
      order: {
        createdAt: 'DESC',
      },
      take: limit,
    });
  }

  async findByResource(
    resourceId: string,
    resource: AuditResource,
    companyId: number
  ): Promise<AuditLog[]> {
    return this.auditLogRepo.find({
      where: {
        resourceId,
        resource,
        companyId,
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async getStatistics(
    companyId: number,
    fromDate?: Date,
    toDate?: Date
  ): Promise<{
    totalActions: number;
    actionsByType: Record<AuditAction, number>;
    actionsByResource: Record<AuditResource, number>;
    actionsByUser: Array<{ userName: string; count: number }>;
    successRate: number;
    averageDuration: number;
  }> {
    const logs = await this.auditLogRepo.find({
      where: {
        companyId,
      },
    });

    const totalActions = logs.length;
    const successfulActions = logs.filter(log => log.success).length;
    const successRate = totalActions > 0 ? (successfulActions / totalActions) * 100 : 0;
    
    const actionsByType = logs.reduce((acc, log) => {
      acc[log.action] = (acc[log.action] || 0) + 1;
      return acc;
    }, {} as Record<AuditAction, number>);

    const actionsByResource = logs.reduce((acc, log) => {
      acc[log.resource] = (acc[log.resource] || 0) + 1;
      return acc;
    }, {} as Record<AuditResource, number>);

    const actionsByUser = logs.reduce((acc, log) => {
      if (log.userName) {
        const existing = acc.find((item: any) => item.userName === log.userName);
        if (existing) {
          existing.count++;
        } else {
          acc.push({ userName: log.userName, count: 1 });
        }
      }
      return acc;
    }, [] as Array<{ userName: string; count: number }>);

    const avgDuration = logs
      .filter(log => log.durationMs !== null)
      .reduce((sum: number, log: any) => sum + (log.durationMs || 0), 0) / 
      logs.filter((log: any) => log.durationMs !== null).length;

    return {
      totalActions,
      actionsByType,
      actionsByResource,
      actionsByUser,
      successRate,
      averageDuration: avgDuration || 0,
    };
  }

  async cleanupOldLogs(daysToKeep: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await this.auditLogRepo
      .createQueryBuilder('audit')
      .delete()
      .where('audit.createdAt < :cutoffDate', { cutoffDate })
      .execute();

    return result.affected || 0;
  }
}
