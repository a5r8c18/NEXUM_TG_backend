import { Controller, Get, Query, ForbiddenException } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { Company } from '../entities/company.entity';

@Controller('companies/public')
export class PublicCompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get('search')
  async searchForLogin(@Query() query: any) {
    const { email } = query;
    
    if (!email) {
      throw new ForbiddenException('Email is required');
    }
    
    // Buscar empresas asociadas al email del usuario
    const companies = await this.companiesService.findByUserEmail(email);
    
    return companies.map((company: Company) => ({
      id: company.id,
      name: company.name,
      tax_id: company.taxId,
      address: company.address || undefined,
      phone: company.phone || undefined,
      email: company.email || undefined,
      logo_path: company.logoPath || undefined,
      is_active: company.isActive,
      created_at: company.createdAt,
      updated_at: company.updatedAt,
    }));
  }
}
