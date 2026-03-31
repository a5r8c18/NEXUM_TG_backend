/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  Req,
} from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CompanyResponseDto } from './dto/company-response.dto';
import { Company } from '../entities/company.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';
import { ForbiddenException } from '@nestjs/common';

@Controller('companies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  private mapToResponseDto(company: Company): CompanyResponseDto {
    return {
      id: company.id,
      name: company.name,
      tax_id: company.taxId,
      address: company.address || undefined,
      phone: company.phone || undefined,
      email: company.email || undefined,
      logo_path: company.logoPath || undefined,
      is_active: company.isActive,
      created_at: company.createdAt 
        ? company.createdAt.toISOString() 
        : new Date().toISOString(),
      updated_at: company.updatedAt 
        ? company.updatedAt.toISOString() 
        : undefined,
      tenantId: company.tenantId || undefined,
      tenantType: company.tenantType || undefined,
    };
  }

  @Get()
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER, UserRole.FACTURADOR)
  async findAll(@Req() req: any) {
    const user = req.user;
    // Superadmin ve todas las empresas
    // Otros roles solo ven empresas de su tenant
    const companies = user.role === UserRole.SUPERADMIN
      ? await this.companiesService.findAll()
      : await this.companiesService.findByTenant(user.tenantId);
    return companies.map((company) => this.mapToResponseDto(company));
  }

  @Get(':id')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER, UserRole.FACTURADOR)
  async findOne(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    const company = await this.companiesService.findOne(id);
    const user = req.user;
    if (user.role !== UserRole.SUPERADMIN && company.tenantId !== user.tenantId) {
      throw new ForbiddenException('No tiene acceso a esta empresa');
    }
    return this.mapToResponseDto(company);
  }

  @Post()
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  async create(
    @Req() req: any,
    @Body()
    body: {
      name: string;
      tax_id?: string;
      address?: string;
      phone?: string;
      email?: string;
      logo_path?: string;
    },
  ) {
    const user = req.user;
    const company = await this.companiesService.create({
      ...body,
      tenantId: user.tenantId,
      tenantType: user.tenantType,
    });
    return this.mapToResponseDto(company);
  }

  @Put(':id')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  async update(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      name?: string;
      tax_id?: string;
      address?: string;
      phone?: string;
      email?: string;
      logo_path?: string;
    },
  ) {
    const user = req.user;
    if (user.role !== UserRole.SUPERADMIN) {
      const existing = await this.companiesService.findOne(id);
      if (existing.tenantId !== user.tenantId) {
        throw new ForbiddenException('No tiene acceso a esta empresa');
      }
    }
    const company = await this.companiesService.update(id, body);
    return this.mapToResponseDto(company);
  }

  @Delete(':id')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  async remove(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    const user = req.user;
    if (user.role !== UserRole.SUPERADMIN) {
      const existing = await this.companiesService.findOne(id);
      if (existing.tenantId !== user.tenantId) {
        throw new ForbiddenException('No tiene acceso a esta empresa');
      }
    }
    return this.companiesService.remove(id);
  }
}
