import { Controller, Get, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { InventoryService } from './inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  getInventory(
    @Req() req: Request,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('product') product?: string,
    @Query('expirationDate') expirationDate?: string,
    @Query('warehouse') warehouse?: string,
    @Query('entity') entity?: string,
    @Query('minStock') minStock?: string,
    @Query('maxStock') maxStock?: string,
  ) {
    const companyId = (req.query.companyId as string)
      ? parseInt(req.query.companyId as string)
      : 1;
    return this.inventoryService.getInventory(companyId, {
      fromDate,
      toDate,
      product,
      warehouse,
      entity,
      minStock: minStock ? parseInt(minStock) : undefined,
      maxStock: maxStock ? parseInt(maxStock) : undefined,
    });
  }
}
