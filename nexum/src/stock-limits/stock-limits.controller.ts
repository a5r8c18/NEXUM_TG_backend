import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { StockLimitsService } from './stock-limits.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { getCompanyId } from '../common/get-company-id';
import { CreateStockLimitDto, UpdateStockLimitDto } from './dto/stock-limit.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER)
@Controller('stock-limits')
export class StockLimitsController {
  constructor(
    private readonly stockLimitsService: StockLimitsService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  @Get()
  findAll(@Req() req: any, @Query('warehouseId') warehouseId?: string) {
    return this.stockLimitsService.findAll(getCompanyId(req), warehouseId);
  }

  @Get('warnings')
  async getWarnings(
    @Req() req: any,
    @Query('warehouseId') warehouseId?: string,
  ) {
    const companyId = getCompanyId(req);
    const warnings = await this.stockLimitsService.getWarnings(companyId, warehouseId);

    const critical = warnings.filter(
      (w) => w.urgency === 'critical' || w.urgency === 'high',
    );
    for (const item of critical) {
      this.notificationsGateway.emitStockAlert({
        productName: item.productName,
        currentStock: item.currentStock,
        minStock: item.minStock,
        companyId,
        tenantId: '',
      });
    }

    return warnings;
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.stockLimitsService.findOne(id, getCompanyId(req));
  }

  @Post()
  create(@Req() req: any, @Body() body: CreateStockLimitDto) {
    // La empresa la fija el contexto autenticado, nunca el body.
    return this.stockLimitsService.create({ ...body, companyId: getCompanyId(req) });
  }

  @Post('bulk')
  bulkCreate(@Req() req: any, @Body() body: CreateStockLimitDto[]) {
    const companyId = getCompanyId(req);
    return this.stockLimitsService.bulkCreate(
      body.map((l) => ({ ...l, companyId })),
    );
  }

  @Post('sync')
  async syncStock(
    @Req() req: any,
    @Query('warehouseId') warehouseId?: string,
  ) {
    const updated = await this.stockLimitsService.syncCurrentStock(
      getCompanyId(req),
      warehouseId,
    );
    return { message: `Stock sincronizado: ${updated} registros actualizados`, updated };
  }

  @Put(':id')
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: UpdateStockLimitDto,
  ) {
    return this.stockLimitsService.update(id, getCompanyId(req), body);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.stockLimitsService.remove(id, getCompanyId(req));
  }
}
