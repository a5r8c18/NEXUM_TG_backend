import { Controller, Get, Query, Req, UseGuards, Param } from '@nestjs/common';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { getCompanyId } from '../common/get-company-id';
import { AuditAction, AuditResource } from '../entities/audit-log.entity';

@UseGuards(JwtAuthGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('logs')
  async getAuditLogs(
    @Req() req: any,
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

    return await this.auditService.findByCompany(getCompanyId(req), filters);
  }

  @Get('logs/user/:userId')
  async getUserAuditLogs(
    @Req() req: any,
    @Param('userId') userId: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit) : 100;
    return await this.auditService.findByUser(userId, getCompanyId(req), limitNum);
  }

  @Get('logs/resource/:resource/:resourceId')
  async getResourceAuditLogs(
    @Req() req: any,
    @Param('resource') resource: AuditResource,
    @Param('resourceId') resourceId: string,
  ) {
    return await this.auditService.findByResource(resourceId, resource, getCompanyId(req));
  }

  @Get('statistics')
  async getAuditStatistics(
    @Req() req: any,
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
      getCompanyId(req),
      filters.fromDate,
      filters.toDate
    );
  }
}
