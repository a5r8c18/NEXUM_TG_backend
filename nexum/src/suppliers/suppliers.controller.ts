import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { SuppliersService } from './suppliers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';
import { getCompanyId } from '../common/get-company-id';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER)
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  findAll(
    @Req() req: Request,
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.suppliersService.findAll(getCompanyId(req), {
      search,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
    });
  }

  @Get('statistics')
  getStatistics(@Req() req: Request) {
    return this.suppliersService.getStatistics(getCompanyId(req));
  }

  @Get(':id')
  findOne(@Req() req: Request, @Param('id') id: string) {
    return this.suppliersService.findOne(getCompanyId(req), id);
  }

  @Post()
  create(@Req() req: Request, @Body() body: any) {
    return this.suppliersService.create(getCompanyId(req), body);
  }

  @Put(':id')
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.suppliersService.update(getCompanyId(req), id, body);
  }

  @Put(':id/deactivate')
  deactivate(@Req() req: Request, @Param('id') id: string) {
    return this.suppliersService.deactivate(getCompanyId(req), id);
  }
}
