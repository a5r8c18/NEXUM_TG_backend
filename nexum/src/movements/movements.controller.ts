/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Controller, Get, Post, Body, Query, Req, Param, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { MovementsService } from './movements.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';
import { getCompanyId } from '../common/get-company-id';
import { CreateDirectEntryDto, CreateExitDto, CreateTransferDto, CreateReturnDto } from './dto';

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
    @Query('relations') relations?: string,
    @Query('warehouse') warehouse?: string,
    @Query('movement_type') movement_type?: string,
  ) {
    const companyId = getCompanyId(req);
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
  createDirectEntry(@Req() req: Request, @Body() body: CreateDirectEntryDto) {
    const companyId = getCompanyId(req);
    return this.movementsService.createDirectEntry(companyId, body);
  }

  @Post('exit')
  createExit(@Req() req: Request, @Body() body: CreateExitDto) {
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
