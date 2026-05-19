import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { InventoryAnalyticsService } from './inventory-analytics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('inventory-analytics')
export class InventoryAnalyticsController {
  constructor(private readonly inventoryAnalyticsService: InventoryAnalyticsService) {}

  @Get('rotation')
  async getRotationAnalytics(
    @Request() req,
    @Query('warehouseId') warehouseId?: string,
    @Query('category') category?: string,
    @Query('period') period?: string,
  ) {
    const companyId = req.user.companyId;
    const filters: any = {};
    
    if (warehouseId) filters.warehouseId = warehouseId;
    if (category) filters.category = category;
    if (period) filters.period = parseInt(period);

    return await this.inventoryAnalyticsService.getRotationAnalytics(companyId, filters);
  }

  @Get('slow-moving')
  async getSlowMovingReport(
    @Request() req,
    @Query('warehouseId') warehouseId?: string,
  ) {
    const companyId = req.user.companyId;
    return await this.inventoryAnalyticsService.getSlowMovingReport(companyId, warehouseId);
  }
}
