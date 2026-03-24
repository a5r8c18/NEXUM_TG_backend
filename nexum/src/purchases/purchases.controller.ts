import { Controller, Get, Post, Body, Req } from '@nestjs/common';
import { Request } from 'express';
import { PurchasesService } from './purchases.service';

@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Get()
  findAll(@Req() req: Request) {
    const companyId = (req.query.companyId as string)
      ? parseInt(req.query.companyId as string)
      : 1;
    return this.purchasesService.findAll(companyId);
  }

  @Post()
  create(
    @Req() req: Request,
    @Body()
    body: {
      entity: string;
      warehouse: string;
      supplier: string;
      document: string;
      products: Array<{
        product_code: string;
        product_name: string;
        quantity: number;
        unit_price: number;
        unit?: string;
        expiration_date?: string;
      }>;
    },
  ) {
    const companyId = (req.body.companyId as string)
      ? parseInt(req.body.companyId as string)
      : 1;
    return this.purchasesService.create(companyId, body);
  }
}
