import { Controller, Get, Query, UseGuards, Param } from '@nestjs/common';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuditAction, AuditResource } from '../entities/audit-log.entity';

@UseGuards(JwtAuthGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('logs')
  async getAuditLogs(
    @Query('companyId') companyId: number,
    @Query('userId') userId?: string,
    @Query('action') action?: AuditAction,
    @Query('resource') resource?: AuditResource,
    @Query('resourceId') resourceId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('success') success?: string,
  ) {
    const filters: any = {
      userId,
      action,
      resource,
      resourceId,
    };

    if (fromDate) {
      filters.fromDate = new Date(fromDate);
    }

    if (toDate) {
      filters.toDate = new Date(toDate);
    }

    if (success !== undefined) {
      filters.success = success === 'true';
    }

    return await this.auditService.findByCompany(companyId, filters);
  }

  @Get('logs/user/:userId')
  async getUserAuditLogs(
    @Param('userId') userId: string,
    @Query('companyId') companyId: number,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit) : 100;
    return await this.auditService.findByUser(userId, companyId, limitNum);
  }

  @Get('logs/resource/:resource/:resourceId')
  async getResourceAuditLogs(
    @Query('companyId') companyId: number,
    @Param('resource') resource: AuditResource,
    @Param('resourceId') resourceId: string,
  ) {
    return await this.auditService.findByResource(resourceId, resource, companyId);
  }

  @Get('statistics')
  async getAuditStatistics(
    @Query('companyId') companyId: number,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    const filters: any = {};
    
    if (fromDate) {
      filters.fromDate = new Date(fromDate);
    }

    if (toDate) {
      filters.toDate = new Date(toDate);
    }

    return await this.auditService.getStatistics(
      companyId, 
      filters.fromDate, 
      filters.toDate
    );
  }
}
