/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { MaterialRequestsService } from './material-requests.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';
import { getCompanyId } from '../common/get-company-id';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER)
@Controller('material-requests')
export class MaterialRequestsController {
  constructor(private readonly materialRequestsService: MaterialRequestsService) {}

  @Get()
  findAll(
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.materialRequestsService.findAll(getCompanyId(req), {
      status,
      warehouseId,
      departmentId,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  findOne(@Req() req: Request, @Param('id') id: string) {
    return this.materialRequestsService.findOne(getCompanyId(req), id);
  }

  @Post()
  create(@Req() req: Request, @Body() body: any) {
    const userName = (req as any).user?.name;
    return this.materialRequestsService.create(getCompanyId(req), {
      ...body,
      requesterName: body.requesterName || userName || 'Sistema',
    });
  }

  @Put(':id/approve')
  approve(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const userName = (req as any).user?.name;
    return this.materialRequestsService.approve(getCompanyId(req), id, {
      ...body,
      approvedBy: body.approvedBy || userName,
    });
  }

  @Put(':id/deliver')
  deliver(@Req() req: Request, @Param('id') id: string) {
    const userName = (req as any).user?.name;
    return this.materialRequestsService.deliver(getCompanyId(req), id, userName);
  }

  @Put(':id/reject')
  reject(@Req() req: Request, @Param('id') id: string, @Body() body: { notes?: string }) {
    return this.materialRequestsService.reject(getCompanyId(req), id, body?.notes);
  }

  @Patch(':id/cancel')
  cancel(@Req() req: Request, @Param('id') id: string) {
    return this.materialRequestsService.cancel(getCompanyId(req), id);
  }
}
