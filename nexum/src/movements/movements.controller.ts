/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Controller, Get, Post, Put, Body, Query, Req, Param, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { MovementsService } from './movements.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';
import { getCompanyId } from '../common/get-company-id';
import { CreateDirectEntryDto, CreateExitDto, CreateTransferDto, CreateReturnDto } from './dto';
import { getEntryTypes, getExitTypes, MOVEMENT_TYPES_CATALOG } from './movement-types.catalog';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER)
@Controller('movements')
export class MovementsController {
  constructor(private readonly movementsService: MovementsService) {}

  @Get()
  findAll(
    @Req() req: Request,
    @Query('start_date') start_date?: string,
    @Query('end_date') end_date?: string,
    @Query('product_name') product_name?: string,
    @Query('product_code') product_code?: string,
    @Query('relations') relations?: string,
    @Query('warehouse') warehouse?: string,
    @Query('movement_type') movement_type?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.movementsService.findAll(companyId, {
      start_date,
      end_date,
      product_name,
      product_code,
      relations,
      warehouse,
      movement_type: movement_type as any,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('history/:productCode')
  getProductHistory(
    @Req() req: Request,
    @Param('productCode') productCode: string,
    @Query('warehouse') warehouse?: string,
    @Query('start_date') start_date?: string,
    @Query('end_date') end_date?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.movementsService.getProductHistory(companyId, productCode, {
      warehouse,
      start_date,
      end_date,
    });
  }

  @Post('direct-entry')
  createDirectEntry(@Req() req: Request, @Body() body: CreateDirectEntryDto) {
    const companyId = getCompanyId(req);
    return this.movementsService.createDirectEntry(companyId, body);
  }

  @Post('exit')
  createExit(@Req() req: Request, @Body() body: CreateExitDto) {
    const companyId = getCompanyId(req);
    return this.movementsService.createExit(companyId, body);
  }

  /**
   * INVRH: Venta de inventario a trabajador con descuento por nómina.
   * Utiliza los códigos 1101 (insumo), 2101 (mercancía) o 3101 (producción).
   */
  @Post('worker-sale')
  createWorkerSale(@Req() req: Request, @Body() body: CreateExitDto & { employeeId: string; employeeName: string }) {
    const companyId = getCompanyId(req);
    return this.movementsService.createExit(companyId, body);
  }

  @Post('transfer')
  createTransfer(@Req() req: Request, @Body() body: CreateTransferDto) {
    const companyId = getCompanyId(req);
    return this.movementsService.createTransfer(companyId, body);
  }

  @Post('return')
  createReturn(@Req() req: Request, @Body() body: CreateReturnDto) {
    const companyId = getCompanyId(req);
    return this.movementsService.createReturn(companyId, body);
  }

  @Get('types')
  getMovementTypes(
    @Query('direction') direction?: 'entry' | 'exit',
    @Query('category') category?: 'insumo' | 'mercancia' | 'produccion',
  ) {
    if (direction === 'entry') return getEntryTypes(category);
    if (direction === 'exit') return getExitTypes(category);
    if (category) return MOVEMENT_TYPES_CATALOG.filter((t) => t.category === category);
    return MOVEMENT_TYPES_CATALOG;
  }

  @Get('investigations')
  getOpenInvestigations(@Req() req: Request) {
    return this.movementsService.findOpenInvestigations(getCompanyId(req));
  }

  @Put('investigations/:id/resolve-shortage')
  resolveShortage(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { resolution: 'loss' | 'responsible'; responsibleName?: string; resolutionDate?: string; notes?: string },
  ) {
    const userName = (req as any).user?.name;
    return this.movementsService.resolveShortage(getCompanyId(req), id, body, userName);
  }

  @Put('investigations/:id/resolve-surplus')
  resolveSurplus(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { resolution: 'income' | 'owner_found'; resolutionDate?: string; notes?: string },
  ) {
    const userName = (req as any).user?.name;
    return this.movementsService.resolveSurplus(getCompanyId(req), id, body, userName);
  }

  @Get('transfers/:warehouseId')
  getTransfersByWarehouse(
    @Req() req: Request,
    @Param('warehouseId') warehouseId: string,
    @Query('start_date') start_date?: string,
    @Query('end_date') end_date?: string,
    @Query('type') type?: 'incoming' | 'outgoing',
  ) {
    const companyId = getCompanyId(req);
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
