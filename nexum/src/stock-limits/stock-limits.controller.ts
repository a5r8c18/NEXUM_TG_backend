import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { StockLimitsService } from './stock-limits.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';
import { NotificationsGateway } from '../notifications/notifications.gateway';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER)
@Controller('stock-limits')
export class StockLimitsController {
  constructor(
    private readonly stockLimitsService: StockLimitsService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  @Get()
  findAll(
    @Query('companyId') companyId?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.stockLimitsService.findAll(companyId, warehouseId);
  }

  @Get('warnings')
  async getWarnings(
    @Query('companyId') companyId?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    const warnings = await this.stockLimitsService.getWarnings(companyId, warehouseId);

    const critical = warnings.filter(
      (w) => w.urgency === 'critical' || w.urgency === 'high',
    );
    for (const item of critical) {
      this.notificationsGateway.emitStockAlert({
        productName: item.productName,
        currentStock: item.currentStock,
        minStock: item.minStock,
        companyId: companyId ? parseInt(companyId) : 1,
        tenantId: '',
      });
    }

    return warnings;
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.stockLimitsService.findOne(id);
  }

  @Post()
  create(@Body() body: any) {
    return this.stockLimitsService.create(body);
  }

  @Post('bulk')
  bulkCreate(@Body() body: any[]) {
    return this.stockLimitsService.bulkCreate(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.stockLimitsService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.stockLimitsService.remove(id);
  }
}
