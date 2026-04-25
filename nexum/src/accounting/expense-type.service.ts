import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExpenseType } from '../entities/expense-type.entity';

@Injectable()
export class ExpenseTypeService {
  constructor(
    @InjectRepository(ExpenseType)
    private readonly expenseTypeRepo: Repository<ExpenseType>,
  ) {}

  async findAll(companyId: number) {
    return this.expenseTypeRepo.find({
      where: { companyId, isActive: true },
      order: { code: 'ASC' },
    });
  }

  async create(companyId: number, data: { code: string; name: string; description?: string }) {
    const existing = await this.expenseTypeRepo.findOneBy({ code: data.code, companyId });
    if (existing) throw new BadRequestException(`Código ${data.code} ya existe`);
    const et = this.expenseTypeRepo.create({ ...data, companyId });
    return this.expenseTypeRepo.save(et);
  }

  async seed(companyId: number) {
    const defaultTypes = [
      { code: '11', name: 'Materia prima y Materiales' },
      { code: '30', name: 'Combustibles y lubricantes' },
      { code: '40', name: 'Energia' },
      { code: '50', name: 'Gastos de personal' },
      { code: '70', name: 'Depreciacion y Amortizacion' },
      { code: '80', name: 'Otros gastos monetarios' },
    ];
    for (const type of defaultTypes) {
      const exists = await this.expenseTypeRepo.findOneBy({ code: type.code, companyId });
      if (!exists) await this.create(companyId, type);
    }
    return { message: 'Tipos de partida predefinidos creados' };
  }
}
