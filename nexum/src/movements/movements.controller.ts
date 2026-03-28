/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Controller, Get, Post, Body, Query, Req, Param } from '@nestjs/common';
import { Request } from 'express';
import { MovementsService } from './movements.service';

@Controller('movements')
export class MovementsController {
  constructor(private readonly movementsService: MovementsService) {}

  @Get()
  findAll(
    @Req() req: Request,
    @Query('start_date') start_date?: string,
    @Query('end_date') end_date?: string,
    @Query('product_name') product_name?: string,
    @Query('relations') relations?: string,
    @Query('warehouse') warehouse?: string,
    @Query('movement_type') movement_type?: string,
  ) {
    const companyId = (req.query.companyId as string)
      ? parseInt(req.query.companyId as string)
      : 1;
    return this.movementsService.findAll(companyId, {
      start_date,
      end_date,
      product_name,
      relations,
      warehouse,
      movement_type: movement_type as any,
    });
  }

  @Post('direct-entry')
  createDirectEntry(
    @Req() req: Request,
    @Body()
    body: {
      productCode: string;
      productName: string;
      productDescription?: string;
      quantity: number;
      label?: string;
      entity?: string;
      warehouseId: string;
      unitPrice?: number;
      unit?: string;
      location?: string;
    },
  ) {
    const companyId = (req.body.companyId as string)
      ? parseInt(req.body.companyId as string)
      : 1;
    return this.movementsService.createDirectEntry(companyId, body);
  }

  @Post('exit')
  createExit(
    @Req() req: Request,
    @Body()
    body: {
      product_code: string;
      quantity: number;
      reason?: string;
      entity?: string;
      warehouseId: string;
    },
  ) {
    const companyId = (req.body.companyId as string)
      ? parseInt(req.body.companyId as string)
      : 1;
    return this.movementsService.createExit(companyId, body);
  }

  @Post('transfer')
  createTransfer(
    @Req() req: Request,
    @Body()
    body: {
      productCode: string;
      quantity: number;
      sourceWarehouseId: string;
      destinationWarehouseId: string;
      reason?: string;
    },
  ) {
    const companyId = (req.body.companyId as string)
      ? parseInt(req.body.companyId as string)
      : 1;
    return this.movementsService.createTransfer(companyId, body);
  }

  @Post('return')
  createReturn(
    @Req() req: Request,
    @Body()
    body: {
      product_code: string;
      quantity: number;
      purchase_id?: string;
      reason: string;
      warehouseId: string;
    },
  ) {
    const companyId = (req.body.companyId as string)
      ? parseInt(req.body.companyId as string)
      : 1;
    return this.movementsService.createReturn(companyId, body);
  }

  @Get('transfers/:warehouseId')
  getTransfersByWarehouse(
    @Req() req: Request,
    @Param('warehouseId') warehouseId: string,
    @Query('start_date') start_date?: string,
    @Query('end_date') end_date?: string,
    @Query('type') type?: 'incoming' | 'outgoing',
  ) {
    const companyId = (req.query.companyId as string)
      ? parseInt(req.query.companyId as string)
      : 1;
    return this.movementsService.getTransfersByWarehouse(
      companyId,
      warehouseId,
      {
        start_date,
        end_date,
        type,
      },
    );
  }
}
