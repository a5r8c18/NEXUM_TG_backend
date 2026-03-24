import { Controller, Get, Post, Body, Query, Req } from '@nestjs/common';
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
  ) {
    const companyId = (req.query.companyId as string)
      ? parseInt(req.query.companyId as string)
      : 1;
    return this.movementsService.findAll(companyId, {
      start_date,
      end_date,
      product_name,
      relations,
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
      warehouse?: string;
      unitPrice?: number;
      unit?: string;
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
      warehouse?: string;
    },
  ) {
    const companyId = (req.body.companyId as string)
      ? parseInt(req.body.companyId as string)
      : 1;
    return this.movementsService.createExit(companyId, body);
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
    },
  ) {
    const companyId = (req.body.companyId as string)
      ? parseInt(req.body.companyId as string)
      : 1;
    return this.movementsService.createReturn(companyId, body);
  }
}
