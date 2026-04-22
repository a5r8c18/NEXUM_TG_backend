import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subelement, SubelementCategory } from '../entities/subelement.entity';

@Injectable()
export class SubelementsService {
  constructor(
    @InjectRepository(Subelement)
    private readonly subelementRepo: Repository<Subelement>,
  ) {}

  async findAll(options?: {
    category?: SubelementCategory;
    search?: string;
    activeOnly?: boolean;
  }) {
    const query = this.subelementRepo.createQueryBuilder('subelement');

    if (options?.category) {
      query.andWhere('subelement.category = :category', { category: options.category });
    }

    if (options?.search) {
      query.andWhere(
        '(subelement.code ILIKE :search OR subelement.name ILIKE :search)',
        { search: `%${options.search}%` }
      );
    }

    if (options?.activeOnly) {
      query.andWhere('subelement.isActive = :isActive', { isActive: true });
    }

    return query.orderBy('subelement.code', 'ASC').getMany();
  }

  async findOne(id: string) {
    const subelement = await this.subelementRepo.findOneBy({
      id,
    });

    if (!subelement) {
      throw new NotFoundException('Subelement not found');
    }

    return subelement;
  }

  async findByCode(code: string) {
    return this.subelementRepo.findOneBy({
      code,
    });
  }

  async create(data: Partial<Subelement>) {
    // Check if code already exists globally
    const existing = await this.subelementRepo.findOneBy({
      code: data.code,
    });

    if (existing) {
      throw new Error(`Subelement with code ${data.code} already exists`);
    }

    const subelement = this.subelementRepo.create(data);
    return this.subelementRepo.save(subelement);
  }

  async update(id: string, data: Partial<Subelement>) {
    const subelement = await this.findOne(id);
    Object.assign(subelement, data);
    return this.subelementRepo.save(subelement);
  }

  async delete(id: string) {
    const subelement = await this.findOne(id);
    return this.subelementRepo.remove(subelement);
  }

  async getCategories(): Promise<SubelementCategory[]> {
    return ['inventory', 'fuel', 'energy', 'personnel', 'depreciation', 'services', 'transfers'];
  }

  async getStatistics() {
    const stats = await this.subelementRepo
      .createQueryBuilder('subelement')
      .select('subelement.category', 'category')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COUNT(CASE WHEN subelement.isActive = true THEN 1 END)', 'activeCount')
      .groupBy('subelement.category')
      .getRawMany();

    const total = await this.subelementRepo.count();

    const activeTotal = await this.subelementRepo.count({
      where: { isActive: true }
    });

    return {
      total,
      active: activeTotal,
      byCategory: stats.reduce((acc, stat) => {
        acc[stat.category] = {
          total: parseInt(stat.count),
          active: parseInt(stat.activeCount)
        };
        return acc;
      }, {} as Record<SubelementCategory, { total: number; active: number }>)
    };
  }
}
