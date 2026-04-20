import { Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { PurchasesService } from './purchases.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';
import { getCompanyId } from '../common/get-company-id';
import { CreatePurchaseDto } from './dto/create-purchase.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER)
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Get()
  findAll(@Req() req: Request) {
    const companyId = getCompanyId(req);
    return this.purchasesService.findAll(companyId);
  }

  @Post()
  create(@Req() req: Request, @Body() body: CreatePurchaseDto) {
    const companyId = getCompanyId(req);
    return this.purchasesService.create(companyId, body);
  }
}
