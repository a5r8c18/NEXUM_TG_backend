import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JournalEntry } from '../entities/journal-entry.entity';
import { Account } from '../entities/account.entity';

@Injectable()
export class AccountingService {
  constructor(
    @InjectRepository(JournalEntry)
    private readonly journalRepo: Repository<JournalEntry>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
  ) {}

  // ── Journal Entries ──

  async findAllEntries(companyId: number, filters?: {
    status?: string;
    fromDate?: string;
    toDate?: string;
    accountCode?: string;
  }) {
    const qb = this.journalRepo.createQueryBuilder('je')
      .where('je.companyId = :companyId', { companyId });

    if (filters?.status) qb.andWhere('je.status = :status', { status: filters.status });
    if (filters?.fromDate) qb.andWhere('je.date >= :fromDate', { fromDate: filters.fromDate });
    if (filters?.toDate) qb.andWhere('je.date <= :toDate', { toDate: filters.toDate });
    if (filters?.accountCode) qb.andWhere('je.accountCode = :accountCode', { accountCode: filters.accountCode });

    qb.orderBy('je.date', 'DESC');
    return qb.getMany();
  }

  async findOneEntry(companyId: number, id: string) {
    const entry = await this.journalRepo.findOneBy({ id, companyId });
    if (!entry) throw new NotFoundException(`Asiento #${id} no encontrado`);
    return entry;
  }

  async createEntry(companyId: number, data: Partial<JournalEntry>) {
    const count = await this.journalRepo.count({ where: { companyId } });
    const entry = this.journalRepo.create({
      ...data,
      companyId,
      entryNumber: `AST-${String(count + 1).padStart(5, '0')}`,
      status: 'draft',
    });
    return this.journalRepo.save(entry);
  }

  async updateEntryStatus(companyId: number, id: string, status: string) {
    const entry = await this.findOneEntry(companyId, id);
    entry.status = status as any;
    return this.journalRepo.save(entry);
  }

  async deleteEntry(companyId: number, id: string) {
    const entry = await this.findOneEntry(companyId, id);
    await this.journalRepo.remove(entry);
    return { message: 'Asiento eliminado correctamente' };
  }

  async getEntryStatistics(companyId: number) {
    const entries = await this.journalRepo.find({ where: { companyId } });
    const totalDebit = entries.reduce((sum, e) => sum + Number(e.debit), 0);
    const totalCredit = entries.reduce((sum, e) => sum + Number(e.credit), 0);
    return {
      totalEntries: entries.length,
      totalDebit,
      totalCredit,
      balance: totalDebit - totalCredit,
      byStatus: {
        draft: entries.filter(e => e.status === 'draft').length,
        posted: entries.filter(e => e.status === 'posted').length,
        cancelled: entries.filter(e => e.status === 'cancelled').length,
      },
    };
  }

  // ── Accounts (Chart of Accounts) ──

  async findAllAccounts(companyId: number, filters?: {
    type?: string;
    search?: string;
    nature?: string;
    level?: string;
    groupNumber?: string;
    activeOnly?: string;
  }) {
    const qb = this.accountRepo.createQueryBuilder('a')
      .where('a.companyId = :companyId', { companyId });

    if (filters?.type) qb.andWhere('a.type = :type', { type: filters.type });
    if (filters?.nature) qb.andWhere('a.nature = :nature', { nature: filters.nature });
    if (filters?.level) qb.andWhere('a.level = :level', { level: parseInt(filters.level) });
    if (filters?.groupNumber) qb.andWhere('a.groupNumber = :groupNumber', { groupNumber: filters.groupNumber });
    if (filters?.activeOnly === 'true') qb.andWhere('a.isActive = true');
    if (filters?.search) {
      qb.andWhere('(a.name ILIKE :search OR a.code ILIKE :search)', { search: `%${filters.search}%` });
    }

    qb.orderBy('a.code', 'ASC');
    return qb.getMany();
  }

  async getAccountStatistics(companyId: number) {
    const accounts = await this.accountRepo.find({ where: { companyId } });
    const active = accounts.filter(a => a.isActive);
    const byType: Record<string, number> = {};
    const byNature: Record<string, number> = {};
    const byLevel: Record<number, number> = {};

    for (const a of active) {
      byType[a.type] = (byType[a.type] || 0) + 1;
      byNature[a.nature] = (byNature[a.nature] || 0) + 1;
      byLevel[a.level] = (byLevel[a.level] || 0) + 1;
    }

    return {
      total: accounts.length,
      active: active.length,
      inactive: accounts.length - active.length,
      byType,
      byNature,
      byLevel,
    };
  }

  async createAccount(companyId: number, data: Partial<Account>) {
    // Verificar que no exista otra cuenta con el mismo código en esta empresa
    const existing = await this.accountRepo.findOneBy({ code: data.code, companyId });
    if (existing) {
      throw new NotFoundException(`Ya existe una cuenta con el código ${data.code}`);
    }

    const account = this.accountRepo.create({ ...data, companyId });
    return this.accountRepo.save(account);
  }

  async updateAccount(companyId: number, id: string, data: Partial<Account>) {
    const account = await this.accountRepo.findOneBy({ id, companyId });
    if (!account) throw new NotFoundException(`Cuenta #${id} no encontrada`);
    Object.assign(account, data);
    return this.accountRepo.save(account);
  }

  async deleteAccount(companyId: number, id: string) {
    const account = await this.accountRepo.findOneBy({ id, companyId });
    if (!account) throw new NotFoundException(`Cuenta #${id} no encontrada`);

    // Verificar que no tenga subcuentas
    const children = await this.accountRepo.findOneBy({ parentCode: account.code, companyId });
    if (children) {
      throw new NotFoundException('No se puede eliminar: la cuenta tiene subcuentas asociadas');
    }

    await this.accountRepo.remove(account);
    return { message: 'Cuenta eliminada correctamente' };
  }
}
