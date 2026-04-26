/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account } from '../entities/account.entity';
import { Elemento } from '../entities/elemento.entity';
import { AccountingPeriod } from '../entities/accounting-period.entity';

@Injectable()
export class AccountService {
  constructor(
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    @InjectRepository(Elemento)
    private readonly elementoRepo: Repository<Elemento>,
    @InjectRepository(AccountingPeriod)
    private readonly periodRepo: Repository<AccountingPeriod>,
  ) {}

  // ══════════════════════════════════════════════════════════
  // ── ACCOUNTS CRUD ──
  // ══════════════════════════════════════════════════════════

  async findAllAccounts(
    companyId: number,
    filters?: {
      type?: string;
      nature?: string;
      level?: string;
      groupNumber?: string;
      parentCode?: string;
      activeOnly?: boolean;
      allowsMovements?: boolean;
      search?: string;
    },
  ) {
    const qb = this.accountRepo.createQueryBuilder('a');

    qb.where('a.companyId = :companyId', { companyId });

    if (filters?.type) qb.andWhere('a.type = :type', { type: filters.type });
    if (filters?.nature)
      qb.andWhere('a.nature = :nature', { nature: filters.nature });
    if (filters?.level)
      qb.andWhere('a.level = :level', { level: parseInt(filters.level) });
    if (filters?.groupNumber)
      qb.andWhere('a.groupNumber = :groupNumber', {
        groupNumber: filters.groupNumber,
      });
    if (filters?.parentCode)
      qb.andWhere('a.parentCode = :parentCode', {
        parentCode: filters.parentCode,
      });
    if (filters?.activeOnly)
      qb.andWhere('a.isActive = :activeOnly', { activeOnly: true });
    if (filters?.allowsMovements)
      qb.andWhere('a.allowsMovements = :allowsMovements', {
        allowsMovements: true,
      });
    if (filters?.search) {
      qb.andWhere(
        '(a.code ILIKE :search OR a.name ILIKE :search OR a.description ILIKE :search)',
        { search: `%${filters.search}%` },
      );
    }

    qb.orderBy('a.code', 'ASC');
    return qb.getMany();
  }

  async findOneAccount(companyId: number, id: string) {
    const account = await this.accountRepo.findOneBy({ id, companyId });
    if (!account) throw new NotFoundException(`Cuenta #${id} no encontrada`);
    return account;
  }

  async findAccountByCode(companyId: number, code: string) {
    const account = await this.accountRepo.findOneBy({ code, companyId });
    if (!account)
      throw new NotFoundException(`Cuenta con código ${code} no encontrada`);
    return account;
  }

  async createAccount(companyId: number, data: Partial<Account>) {
    // Validar que no exista una cuenta con el mismo código
    const existing = await this.accountRepo.findOneBy({
      code: data.code,
      companyId,
    });
    if (existing) {
      throw new BadRequestException(
        `Ya existe una cuenta con el código ${data.code}`,
      );
    }

    // Validar jerarquía si se especifica parentCode
    if (data.parentCode) {
      const parent = await this.accountRepo.findOneBy({
        code: data.parentCode,
        companyId,
      });
      if (!parent) {
        throw new BadRequestException(
          `Cuenta padre con código ${data.parentCode} no encontrada`,
        );
      }

      // Validar nivel jerárquico
      if (data.level && parent.level >= data.level) {
        throw new BadRequestException(
          'La cuenta hija debe tener un nivel mayor que la cuenta padre',
        );
      }
    }

    const account = this.accountRepo.create({
      ...data,
      companyId,
      isActive: data.isActive !== false,
      allowsMovements: data.allowsMovements !== false,
    });

    return this.accountRepo.save(account);
  }

  async updateAccount(companyId: number, id: string, data: Partial<Account>) {
    const account = await this.findOneAccount(companyId, id);

    // Validar código único si se está cambiando
    if (data.code && data.code !== account.code) {
      const existing = await this.accountRepo.findOneBy({
        code: data.code,
        companyId,
      });
      if (existing) {
        throw new BadRequestException(
          `Ya existe una cuenta con el código ${data.code}`,
        );
      }
    }

    // Validar jerarquía si se está cambiando parentCode
    if (data.parentCode) {
      const parent = await this.accountRepo.findOneBy({
        code: data.parentCode,
        companyId,
      });
      if (!parent) {
        throw new BadRequestException(
          `Cuenta padre con código ${data.parentCode} no encontrada`,
        );
      }

      // Validar que no se esté creando una referencia circular
      if (parent.id === account.id) {
        throw new BadRequestException(
          'Una cuenta no puede ser su propia padre',
        );
      }
    }

    Object.assign(account, data);
    return this.accountRepo.save(account);
  }

  async deleteAccount(companyId: number, id: string) {
    const account = await this.findOneAccount(companyId, id);

    // Verificar que no tenga cuentas hijas
    const childAccounts = await this.accountRepo.find({
      where: { parentCode: account.code, companyId },
    });
    if (childAccounts.length > 0) {
      throw new BadRequestException(
        'No se puede eliminar una cuenta que tiene cuentas hijas',
      );
    }

    return this.accountRepo.remove(account);
  }

  // ══════════════════════════════════════════════════════════
  // ── ACCOUNT HIERARCHY ──
  // ══════════════════════════════════════════════════════════

  async findAccountsByParentCode(companyId: number, parentCode: string) {
    // Buscar cuentas hijas directas
    const childAccounts = await this.accountRepo.find({
      where: {
        companyId,
        parentCode,
        isActive: true,
        allowsMovements: true,
      },
      order: {
        code: 'ASC',
      },
    });

    // Buscar subcuentas (cuentas con level=4 y parentCode)
    const subaccounts = await this.accountRepo.find({
      where: {
        companyId,
        level: 4,
        parentCode: parentCode,
        isActive: true,
      },
      order: {
        code: 'ASC',
      },
    });

    // Combinar resultados
    return [...childAccounts, ...subaccounts];
  }

  async getSubaccountsByAccount(companyId: number, accountId: string) {
    // Buscar subcuentas directamente usando parentAccountId
    const subaccounts = await this.accountRepo.find({
      where: {
        companyId,
        level: 4,
        parentAccountId: accountId,
        isActive: true,
      },
      order: {
        code: 'ASC',
      },
    });

    return subaccounts;
  }

  async createSubaccount(
    companyId: number,
    data: {
      accountId: string;
      subaccountCode: string;
      subaccountName: string;
      description?: string;
    },
  ) {
    // Validar que la cuenta padre exista
    const parentAccount = await this.accountRepo.findOneBy({
      id: data.accountId,
      companyId,
    });

    if (!parentAccount) {
      throw new BadRequestException('Cuenta padre no encontrada');
    }

    // Verificar que no exista una cuenta con el mismo código
    const existing = await this.accountRepo.findOneBy({
      code: data.subaccountCode,
      companyId,
    });
    if (existing) {
      throw new BadRequestException(
        `Ya existe una cuenta con el código ${data.subaccountCode}`,
      );
    }

    // Crear la subcuenta como una cuenta con level=4
    const subaccount = this.accountRepo.create({
      companyId,
      code: data.subaccountCode,
      name: data.subaccountName,
      description: data.description || null,
      type: parentAccount.type, // Heredar tipo de la cuenta padre
      nature: parentAccount.nature, // Heredar naturaleza de la cuenta padre
      level: 4, // Todas las subcuentas son nivel 4
      groupNumber: parentAccount.groupNumber, // Heredar groupNumber
      parentCode: parentAccount.code, // Código de la cuenta padre
      parentAccountId: parentAccount.id, // ID de la cuenta padre
      balance: 0, // Iniciar con balance cero
      isActive: true,
      allowsMovements: true, // Las subcuentas permiten movimientos
    });

    return this.accountRepo.save(subaccount);
  }

  // ══════════════════════════════════════════════════════════
  // ── ACCOUNT STATISTICS ──
  // ══════════════════════════════════════════════════════════

  async getAccountStatistics(companyId: number) {
    const accounts = await this.accountRepo.find({ where: { companyId } });
    const active = accounts.filter((a) => a.isActive);
    const byType: Record<string, number> = {};
    const byNature: Record<string, number> = {};
    const byLevel: Record<number, number> = {};

    accounts.forEach((account) => {
      byType[account.type] = (byType[account.type] || 0) + 1;
      byNature[account.nature] = (byNature[account.nature] || 0) + 1;
      byLevel[account.level] = (byLevel[account.level] || 0) + 1;
    });

    return {
      total: accounts.length,
      active: active.length,
      inactive: accounts.length - active.length,
      byType,
      byNature,
      byLevel,
    };
  }

  // ══════════════════════════════════════════════════════════
  // ── CHART OF ACCOUNTS ──
  // ══════════════════════════════════════════════════════════

  async getChartOfAccounts(companyId: number) {
    const accounts = await this.accountRepo.find({
      where: { companyId, isActive: true },
      order: { code: 'ASC' },
    });

    // Construir jerarquía
    const hierarchy = this.buildAccountHierarchy(accounts);

    return {
      accounts,
      hierarchy,
      total: accounts.length,
    };
  }

  private buildAccountHierarchy(accounts: Account[]): Account[] {
    const accountMap = new Map<string, Account>();
    const rootAccounts: Account[] = [];

    // Crear mapa de cuentas
    accounts.forEach((account) => {
      accountMap.set(account.id, { ...account } as Account & {
        children: Account[];
      });
    });

    // Construir jerarquía
    accounts.forEach((account) => {
      if (account.parentCode) {
        const parent = accounts.find((a) => a.code === account.parentCode);
        if (parent) {
          const parentAccount = accountMap.get(parent.id);
          const childAccount = accountMap.get(account.id);
          if (parentAccount && childAccount) {
            (parentAccount as any).children =
              (parentAccount as any).children || [];
            (parentAccount as any).children.push(childAccount);
          }
        }
      } else {
        rootAccounts.push(accountMap.get(account.id)!);
      }
    });

    return rootAccounts;
  }

  // ══════════════════════════════════════════════════════════
  // ── ELEMENTS (Catalogo de Cuentas) ──
  // ══════════════════════════════════════════════════════════

  async findAllElements(companyId: number) {
    return this.elementoRepo.find({
      where: { companyId },
      order: { entryNumber: 'ASC' },
    });
  }

  async findOneElement(companyId: number, id: string) {
    const element = await this.elementoRepo.findOneBy({ id, companyId });
    if (!element) throw new NotFoundException(`Elemento #${id} no encontrado`);
    return element;
  }

  async createElement(companyId: number, data: Partial<Elemento>) {
    const existing = await this.elementoRepo.findOneBy({
      entryNumber: data.entryNumber,
      companyId,
    });
    if (existing) {
      throw new BadRequestException(
        `Ya existe un elemento con el número ${data.entryNumber}`,
      );
    }

    const element = this.elementoRepo.create({
      ...data,
      companyId,
    });

    return this.elementoRepo.save(element);
  }

  async updateElement(companyId: number, id: string, data: Partial<Elemento>) {
    const element = await this.findOneElement(companyId, id);

    if (data.entryNumber && data.entryNumber !== element.entryNumber) {
      const existing = await this.elementoRepo.findOneBy({
        entryNumber: data.entryNumber,
        companyId,
      });
      if (existing) {
        throw new BadRequestException(
          `Ya existe un elemento con el número ${data.entryNumber}`,
        );
      }
    }

    Object.assign(element, data);
    return this.elementoRepo.save(element);
  }

  async deleteElement(companyId: number, id: string) {
    const element = await this.findOneElement(companyId, id);
    return this.elementoRepo.remove(element);
  }

  async getElementStatistics(companyId: number) {
    const elements = await this.findAllElements(companyId);
    return {
      total: elements.length,
      active: elements.filter((e) => e.status !== 'cancelled').length,
      draft: elements.filter((e) => e.status === 'draft').length,
    };
  }

  async updateElementStatus(companyId: number, id: string, status: string) {
    const element = await this.findOneElement(companyId, id);
    element.status = status as any;
    return this.elementoRepo.save(element);
  }

  // ══════════════════════════════════════════════════════════
  // ── BALANCE OPERATIONS ──
  // ══════════════════════════════════════════════════════════

  async updateAccountBalance(
    companyId: number,
    accountCode: string,
    amount: number,
  ) {
    const account = await this.findAccountByCode(companyId, accountCode);
    account.balance = Number(account.balance) + amount;
    return this.accountRepo.save(account);
  }

  async resetAccountBalances(companyId: number) {
    await this.accountRepo
      .createQueryBuilder()
      .update(Account)
      .set({ balance: 0 })
      .where('companyId = :companyId', { companyId })
      .execute();
  }

  async getAccountElements(companyId: number) {
    const accounts = await this.accountRepo.find({
      where: { companyId, isActive: true },
    });
    const typeLabels: Record<string, string> = {
      asset: 'Activos',
      liability: 'Pasivos',
      equity: 'Patrimonio',
      income: 'Ingresos',
      expense: 'Gastos',
    };
    const elements: any[] = [];
    for (const [type, label] of Object.entries(typeLabels)) {
      const filtered = accounts.filter((a) => a.type === type);
      if (filtered.length > 0) {
        elements.push({
          type,
          label,
          totalBalance: filtered.reduce((sum, a) => sum + Number(a.balance), 0),
          accountCount: filtered.length,
          accounts: filtered,
        });
      }
    }
    return elements;
  }

  // Métodos de períodos (delegar a FiscalYearService, pero por ahora implementarlos aquí)
  async findAllPeriods(companyId: number, fiscalYearId?: string) {
    // Esto debería estar en FiscalYearService, pero lo ponemos temporalmente
    const qb = this.periodRepo
      .createQueryBuilder('p')
      .where('p.companyId = :companyId', { companyId });
    if (fiscalYearId)
      qb.andWhere('p.fiscalYearId = :fiscalYearId', { fiscalYearId });
    return qb.orderBy('p.year', 'ASC').addOrderBy('p.month', 'ASC').getMany();
  }

  async closePeriod(companyId: number, id: string, closedBy: string) {
    const period = await this.periodRepo.findOneBy({ id, companyId });
    if (!period) throw new NotFoundException('Período no encontrado');
    period.status = 'closed';
    period.closedAt = new Date();
    period.closedBy = closedBy;
    return this.periodRepo.save(period);
  }

  async reopenPeriod(companyId: number, id: string) {
    const period = await this.periodRepo.findOneBy({ id, companyId });
    if (!period) throw new NotFoundException('Período no encontrado');
    period.status = 'open';
    period.closedAt = null;
    period.closedBy = null;
    return this.periodRepo.save(period);
  }

  // ══════════════════════════════════════════════════════════
  // ── LEGACY SUBACCOUNT METHODS (for compatibility) ──
  // ══════════════════════════════════════════════════════════

  async findOne(id: string) {
    return await this.accountRepo.findOneBy({ id });
  }

  async update(id: string, data: Partial<Account>) {
    await this.accountRepo.update(id, data);
    return await this.findOne(id);
  }

  async toggleActive(id: string) {
    const account = await this.findOne(id);
    if (!account) return null;

    account.isActive = !account.isActive;
    account.updatedAt = new Date();

    return await this.accountRepo.save(account);
  }

  async getStatistics(companyId: number) {
    const total = await this.accountRepo.count({
      where: { companyId, level: 4 },
    });

    const active = await this.accountRepo.count({
      where: { companyId, level: 4, isActive: true },
    });

    const inactive = total - active;

    return {
      total,
      active,
      inactive,
      allowsMovements: await this.accountRepo.count({
        where: { companyId, level: 4, isActive: true, allowsMovements: true },
      }),
    };
  }

  async delete(id: string) {
    const result = await this.accountRepo.delete(id);
    return (result.affected ?? 0) > 0;
  }
}
