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
} from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CompanyResponseDto } from './dto/company-response.dto';
import { Company } from '../entities/company.entity';

@Controller('companies')
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
  async findAll() {
    const companies = await this.companiesService.findAll();
    return companies.map((company) => this.mapToResponseDto(company));
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const company = await this.companiesService.findOne(id);
    return this.mapToResponseDto(company);
  }

  @Post()
  async create(
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
    const company = await this.companiesService.create(body);
    return this.mapToResponseDto(company);
  }

  @Put(':id')
  async update(
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
    const company = await this.companiesService.update(id, body);
    return this.mapToResponseDto(company);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.companiesService.remove(id);
  }
}
