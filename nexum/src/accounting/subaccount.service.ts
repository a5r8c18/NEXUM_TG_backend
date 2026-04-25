import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subaccount } from '../entities/subaccount.entity';

@Injectable()
export class SubaccountService {
  constructor(
    @InjectRepository(Subaccount)
    private readonly subaccountRepo: Repository<Subaccount>,
  ) {}

  async findAll(accountId?: string): Promise<Subaccount[]> {
    const queryBuilder = this.subaccountRepo.createQueryBuilder('subaccount');

    if (accountId) {
      queryBuilder.where('subaccount.accountId = :accountId', { accountId });
    }

    queryBuilder.orderBy('subaccount.subaccountCode', 'ASC');

    return await queryBuilder.getMany();
  }

  async findOne(id: string): Promise<Subaccount | null> {
    return await this.subaccountRepo.findOne({
      where: { id },
      relations: ['account', 'company'],
    });
  }

  async findByAccount(accountId: string): Promise<Subaccount[]> {
    return await this.subaccountRepo.find({
      where: { accountId },
      relations: ['account'],
      order: { subaccountCode: 'ASC' },
    });
  }

  async findByCompany(companyId: number): Promise<Subaccount[]> {
    return await this.subaccountRepo.find({
      where: { companyId },
      relations: ['account'],
      order: { subaccountCode: 'ASC' },
    });
  }

  async create(data: Partial<Subaccount>): Promise<Subaccount> {
    const subaccount = new Subaccount();
    Object.assign(subaccount, data);
    return await this.subaccountRepo.save(subaccount);
  }

  async update(
    id: string,
    data: Partial<Subaccount>,
  ): Promise<Subaccount | null> {
    await this.subaccountRepo.update(id, data);
    return await this.findOne(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.subaccountRepo.delete(id);
    return (result.affected ?? 0) > 0;
  }

  async toggleActive(id: string): Promise<Subaccount | null> {
    const subaccount = await this.findOne(id);
    if (!subaccount) return null;

    subaccount.isActive = !subaccount.isActive;
    subaccount.updatedAt = new Date();

    return await this.subaccountRepo.save(subaccount);
  }

  async getStatistics(companyId: number): Promise<{
    total: number;
    active: number;
    inactive: number;
    byAccount: Record<string, number>;
  }> {
    const subaccounts = await this.findByCompany(companyId);

    const byAccount: Record<string, number> = {};
    subaccounts.forEach((sub) => {
      const key = sub.accountId;
      byAccount[key] = (byAccount[key] || 0) + 1;
    });

    return {
      total: subaccounts.length,
      active: subaccounts.filter((s) => s.isActive).length,
      inactive: subaccounts.filter((s) => !s.isActive).length,
      byAccount,
    };
  }
}
