import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';
import { getCompanyId } from '../common/get-company-id';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER)
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
    const companyId = getCompanyId(req);
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
