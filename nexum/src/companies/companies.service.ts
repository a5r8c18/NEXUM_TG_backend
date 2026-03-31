import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';

@Injectable()
export class CompaniesService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
  ) {}

  findAll() {
    return this.companyRepo.find({ order: { id: 'ASC' } });
  }

  findByTenant(tenantId: string) {
    return this.companyRepo.find({
      where: { tenantId },
      order: { id: 'ASC' },
    });
  }

  async findOne(id: number) {
    const company = await this.companyRepo.findOneBy({ id });
    if (!company) throw new NotFoundException('Empresa no encontrada');
    return company;
  }

  async create(data: {
    name: string;
    tax_id?: string;
    address?: string;
    phone?: string;
    email?: string;
    logo_path?: string;
    is_active?: boolean;
    tenantId?: string;
    tenantType?: string;
  }) {
    const existing = await this.companyRepo.findOneBy({ name: data.name });
    if (existing) {
      throw new ConflictException('Ya existe una empresa con ese nombre');
    }

    const company = new Company();
    company.name = data.name;
    company.taxId = data.tax_id || '';
    company.address = data.address || null;
    company.phone = data.phone || null;
    company.email = data.email || null;
    company.logoPath = data.logo_path || null;
    company.isActive = data.is_active ?? true;
    company.tenantId = data.tenantId || null;
    company.tenantType = data.tenantType || null;
    return this.companyRepo.save(company);
  }

  async update(
    id: number,
    data: {
      name?: string;
      tax_id?: string;
      address?: string;
      phone?: string;
      email?: string;
      logo_path?: string;
      is_active?: boolean;
    },
  ) {
    const company = await this.companyRepo.findOneBy({ id });
    if (!company) throw new NotFoundException('Empresa no encontrada');

    if (data.name) {
      const nameConflict = await this.companyRepo.findOneBy({
        name: data.name,
      });
      if (nameConflict && nameConflict.id !== id) {
        throw new ConflictException('Ya existe una empresa con ese nombre');
      }
    }

    if (data.name !== undefined) company.name = data.name;
    if (data.tax_id !== undefined) company.taxId = data.tax_id;
    if (data.address !== undefined) company.address = data.address;
    if (data.phone !== undefined) company.phone = data.phone;
    if (data.email !== undefined) company.email = data.email;
    if (data.logo_path !== undefined) company.logoPath = data.logo_path;
    if (data.is_active !== undefined) company.isActive = data.is_active;

    return this.companyRepo.save(company);
  }

  async remove(id: number) {
    const company = await this.companyRepo.findOneBy({ id });
    if (!company) throw new NotFoundException('Empresa no encontrada');

    if (id === 1) {
      throw new ConflictException('No se puede eliminar la empresa principal');
    }

    await this.companyRepo.remove(company);
    return { message: 'Empresa eliminada correctamente' };
  }
}
