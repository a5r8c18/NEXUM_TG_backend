import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Supplier } from '../entities/supplier.entity';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(Supplier)
    private readonly supplierRepo: Repository<Supplier>,
  ) {}

  async findAll(companyId: number, filters?: any) {
    const qb = this.supplierRepo
      .createQueryBuilder('s')
      .where('s.company_id = :companyId', { companyId })
      .orderBy('s.business_name', 'ASC');

    if (filters?.search) {
      qb.andWhere('(s.business_name ILIKE :search OR s.supplier_code ILIKE :search OR s.nit ILIKE :search)', {
        search: `%${filters.search}%`,
      });
    }
    if (filters?.isActive !== undefined) {
      qb.andWhere('s.is_active = :isActive', { isActive: filters.isActive });
    }

    return qb.getMany();
  }

  async findOne(companyId: number, id: string) {
    const supplier = await this.supplierRepo.findOne({
      where: { id, companyId },
    });
    if (!supplier) throw new NotFoundException(`Proveedor ${id} no encontrado`);
    return supplier;
  }

  /** Genera el código consecutivo PRV-000001, PRV-000002… */
  private async nextSupplierCode(): Promise<string> {
    const rows: { supplier_code: string }[] = await this.supplierRepo.query(
      `SELECT supplier_code FROM suppliers WHERE supplier_code ~ '^PRV-[0-9]+$'
       ORDER BY LENGTH(supplier_code) DESC, supplier_code DESC LIMIT 1`,
    );
    const last = rows[0] ? parseInt(rows[0].supplier_code.split('-')[1], 10) : 0;
    return `PRV-${String(last + 1).padStart(6, '0')}`;
  }

  async create(companyId: number, data: any) {
    if (!data.supplierCode) {
      data.supplierCode = await this.nextSupplierCode();
    }
    const supplier = this.supplierRepo.create({ ...data, companyId });
    return this.supplierRepo.save(supplier);
  }

  async update(companyId: number, id: string, data: any) {
    const supplier = await this.findOne(companyId, id);
    Object.assign(supplier, data);
    return this.supplierRepo.save(supplier);
  }

  async deactivate(companyId: number, id: string) {
    const supplier = await this.findOne(companyId, id);
    supplier.isActive = false;
    return this.supplierRepo.save(supplier);
  }

  async getStatistics(companyId: number) {
    const all = await this.supplierRepo.find({ where: { companyId } });
    return {
      total: all.length,
      active: all.filter(s => s.isActive).length,
      inactive: all.filter(s => !s.isActive).length,
    };
  }
}
