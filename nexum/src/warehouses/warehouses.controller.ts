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
} from '@nestjs/common';
import { Request } from 'express';
import { WarehousesService } from './warehouses.service';

@Controller()
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Get('warehouses')
  findAll(@Req() req: Request) {
    const companyId = (req.query.companyId as string)
      ? parseInt(req.query.companyId as string)
      : 1;
    return this.warehousesService.findAll(companyId);
  }

  @Get('companies/:companyId/warehouses')
  findByCompany(@Param('companyId') companyId: string) {
    return this.warehousesService.findAll(parseInt(companyId) || 1);
  }

  @Get('warehouses/:id')
  findOne(@Req() req: Request, @Param('id') id: string) {
    const companyId = (req.query.companyId as string)
      ? parseInt(req.query.companyId as string)
      : 1;
    return this.warehousesService.findOne(companyId, id);
  }

  @Post('warehouses')
  create(
    @Req() req: Request,
    @Body() body: { name: string; code: string; address?: string },
  ) {
    const companyId = (req.body.companyId as string)
      ? parseInt(req.body.companyId as string)
      : 1;
    return this.warehousesService.create(companyId, body);
  }

  @Put('warehouses/:id')
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      code?: string;
      address?: string;
      isActive?: boolean;
    },
  ) {
    const companyId = (req.body.companyId as string)
      ? parseInt(req.body.companyId as string)
      : 1;
    return this.warehousesService.update(companyId, id, body);
  }

  @Delete('warehouses/:id')
  remove(@Req() req: Request, @Param('id') id: string) {
    const companyId = (req.query.companyId as string)
      ? parseInt(req.query.companyId as string)
      : 1;
    return this.warehousesService.remove(companyId, id);
  }

  @Patch('warehouses/:id/activate')
  activate(@Req() req: Request, @Param('id') id: string) {
    const companyId = (req.query.companyId as string)
      ? parseInt(req.query.companyId as string)
      : 1;
    return this.warehousesService.activate(companyId, id);
  }

  @Patch('warehouses/:id/deactivate')
  deactivate(@Req() req: Request, @Param('id') id: string) {
    const companyId = (req.query.companyId as string)
      ? parseInt(req.query.companyId as string)
      : 1;
    return this.warehousesService.deactivate(companyId, id);
  }
}
