/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { WarehousesService } from './warehouses.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';
import { getCompanyId } from '../common/get-company-id';
import { CreateWarehouseDto, UpdateWarehouseDto } from './dto/warehouse.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER)
@Controller()
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Get('warehouses')
  findAll(@Req() req: Request) {
    const companyId = getCompanyId(req);
    return this.warehousesService.findAll(companyId);
  }

  @Get('companies/:companyId/warehouses')
  findByCompany(@Req() req: Request) {
    const companyId = getCompanyId(req);
    return this.warehousesService.findAll(companyId);
  }

  @Get('warehouses/:id')
  findOne(@Req() req: Request, @Param('id') id: string) {
    const companyId = getCompanyId(req);
    return this.warehousesService.findOne(companyId, id);
  }

  @Post('warehouses')
  create(
    @Req() req: Request,
    @Body() body: CreateWarehouseDto,
  ) {
    const companyId = getCompanyId(req);
    return this.warehousesService.create(companyId, body);
  }

  @Put('warehouses/:id')
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpdateWarehouseDto,
  ) {
    const companyId = getCompanyId(req);
    return this.warehousesService.update(companyId, id, body);
  }

  @Delete('warehouses/:id')
  remove(@Req() req: Request, @Param('id') id: string) {
    const companyId = getCompanyId(req);
    return this.warehousesService.remove(companyId, id);
  }

  @Patch('warehouses/:id/activate')
  activate(@Req() req: Request, @Param('id') id: string) {
    const companyId = getCompanyId(req);
    return this.warehousesService.activate(companyId, id);
  }

  @Patch('warehouses/:id/deactivate')
  deactivate(@Req() req: Request, @Param('id') id: string) {
    const companyId = getCompanyId(req);
    return this.warehousesService.deactivate(companyId, id);
  }
}
