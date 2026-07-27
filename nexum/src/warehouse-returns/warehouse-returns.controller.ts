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
import { WarehouseReturnsService } from './warehouse-returns.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';
import { getCompanyId } from '../common/get-company-id';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER)
@Controller('warehouse-returns')
export class WarehouseReturnsController {
  constructor(private readonly warehouseReturnsService: WarehouseReturnsService) {}

  @Get()
  findAll(
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.warehouseReturnsService.findAll(getCompanyId(req), {
      status,
      warehouseId,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  findOne(@Req() req: Request, @Param('id') id: string) {
    return this.warehouseReturnsService.findOne(getCompanyId(req), id);
  }

  @Post()
  create(@Req() req: Request, @Body() body: any) {
    const userName = (req as any).user?.name;
    return this.warehouseReturnsService.create(getCompanyId(req), {
      ...body,
      returnedBy: body.returnedBy || userName || 'Sistema',
    });
  }

  @Put(':id/process')
  process(@Req() req: Request, @Param('id') id: string) {
    const userName = (req as any).user?.name;
    return this.warehouseReturnsService.process(getCompanyId(req), id, userName);
  }

  @Patch(':id/cancel')
  cancel(@Req() req: Request, @Param('id') id: string) {
    return this.warehouseReturnsService.cancel(getCompanyId(req), id);
  }
}
