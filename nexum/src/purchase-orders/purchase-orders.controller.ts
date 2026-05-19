import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { PurchaseOrdersService } from './purchase-orders.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';
import { getCompanyId } from '../common/get-company-id';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER)
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly poService: PurchaseOrdersService) {}

  @Get()
  findAll(
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('supplierName') supplierName?: string,
  ) {
    return this.poService.findAll(getCompanyId(req), {
      status,
      supplierName,
    });
  }

  @Get('statistics')
  getStatistics(@Req() req: Request) {
    return this.poService.getStatistics(getCompanyId(req));
  }

  @Get(':id')
  findOne(@Req() req: Request, @Param('id') id: string) {
    return this.poService.findOne(getCompanyId(req), id);
  }

  @Post()
  create(@Req() req: Request, @Body() body: any) {
    return this.poService.create(getCompanyId(req), body);
  }

  @Put(':id/submit')
  submit(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    return this.poService.submit(getCompanyId(req), id, user?.email || 'system');
  }

  @Put(':id/approve')
  approve(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    return this.poService.approve(getCompanyId(req), id, user?.email || 'system');
  }

  @Put(':id/reject')
  reject(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    return this.poService.reject(getCompanyId(req), id, body.reason);
  }

  @Put(':id/cancel')
  cancel(@Req() req: Request, @Param('id') id: string) {
    return this.poService.cancel(getCompanyId(req), id);
  }
}
