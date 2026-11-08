import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subaccount } from '../entities/subaccount.entity';
import { VoucherLine } from '../entities/voucher-line.entity';

@Injectable()
export class SubaccountService {
  constructor(
    @InjectRepository(Subaccount)
    private readonly subaccountRepo: Repository<Subaccount>,
  ) {}

  /**
   * Recalcula el saldo de las subcuentas desde las líneas de comprobantes
   * asentados (posted), ajustado por la naturaleza de cada subcuenta.
   */
  private async overlayLiveBalances(companyId: number, subs: Subaccount[]): Promise<Subaccount[]> {
    if (!subs.length) return subs;
    const rows = await this.subaccountRepo.manager
      .getRepository(VoucherLine)
      .createQueryBuilder('l')
      .innerJoin('l.voucher', 'v')
      .where('v.companyId = :companyId', { companyId })
      .andWhere("v.status = 'posted'")
      .select('l.subaccountCode', 'subaccountCode')
      .addSelect('SUM(l.debit)', 'debit')
      .addSelect('SUM(l.credit)', 'credit')
      .groupBy('l.subaccountCode')
      .getRawMany();
    const bal = new Map(
      rows.map((r) => [r.subaccountCode, { d: Number(r.debit) || 0, c: Number(r.credit) || 0 }]),
    );
    for (const s of subs) {
      const t = bal.get(s.subaccountCode) || { d: 0, c: 0 };
      s.balance = s.nature === 'acreedora' ? t.c - t.d : t.d - t.c;
    }
    return subs;
  }

  async findAll(accountId?: string): Promise<Subaccount[]> {
    const queryBuilder = this.subaccountRepo.createQueryBuilder('subaccount');

    if (accountId) {
      queryBuilder.where('subaccount.accountId = :accountId', { accountId });
    }

    queryBuilder.orderBy('subaccount.subaccountCode', 'ASC');

    const list = await queryBuilder.getMany();
    return this.overlayLiveBalances(list[0]?.companyId, list);
  }

  async findOne(id: string): Promise<Subaccount | null> {
    const sub = await this.subaccountRepo.findOne({
      where: { id },
      relations: ['account', 'company'],
    });
    return sub ? (await this.overlayLiveBalances(sub.companyId, [sub]))[0] : null;
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
