/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Res,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Response } from 'express';
import * as XLSX from 'xlsx';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import { Elemento } from '../entities/elemento.entity';
import { Account } from '../entities/account.entity';
import { Voucher, SourceModule } from '../entities/voucher.entity';
import { VoucherLine } from '../entities/voucher-line.entity';
import { CostCenter } from '../entities/cost-center.entity';
import { FiscalYear } from '../entities/fiscal-year.entity';
import { AccountingPeriod } from '../entities/accounting-period.entity';
import { ExpenseType } from '../entities/expense-type.entity';
import { Subelement } from '../entities/subelement.entity';
import { EntityManager } from 'typeorm';

@Injectable()
export class AccountingService {
  constructor(
    @InjectRepository(Elemento)
    private readonly elementoRepo: Repository<Elemento>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    @InjectRepository(Voucher)
    private readonly voucherRepo: Repository<Voucher>,
    @InjectRepository(VoucherLine)
    private readonly voucherLineRepo: Repository<VoucherLine>,
    @InjectRepository(CostCenter)
    private readonly costCenterRepo: Repository<CostCenter>,
    @InjectRepository(FiscalYear)
    private readonly fiscalYearRepo: Repository<FiscalYear>,
    @InjectRepository(AccountingPeriod)
    private readonly periodRepo: Repository<AccountingPeriod>,
    @InjectRepository(ExpenseType)
    private readonly expenseTypeRepo: Repository<ExpenseType>,
    @InjectRepository(Subelement)
    private readonly subelementRepo: Repository<Subelement>,
    private readonly entityManager: EntityManager,
  ) {}

  // ══════════════════════════════════════════════════════════
  // ── VOUCHERS (Comprobantes de Operación) ──
  // ══════════════════════════════════════════════════════════

  async findAllVouchers(
    companyId: number,
    filters?: {
      status?: string;
      type?: string;
      fromDate?: string;
      toDate?: string;
      sourceModule?: string;
      search?: string;
    },
  ) {
    const qb = this.voucherRepo
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.lines', 'lines')
      .leftJoinAndSelect('lines.costCenter', 'costCenter')
      .where('v.companyId = :companyId', { companyId });

    if (filters?.status)
      qb.andWhere('v.status = :status', { status: filters.status });
    if (filters?.type) qb.andWhere('v.type = :type', { type: filters.type });
    if (filters?.fromDate)
      qb.andWhere('v.date >= :fromDate', { fromDate: filters.fromDate });
    if (filters?.toDate)
      qb.andWhere('v.date <= :toDate', { toDate: filters.toDate });
    if (filters?.sourceModule)
      qb.andWhere('v.source_module = :sourceModule', {
        sourceModule: filters.sourceModule,
      });
    if (filters?.search)
      qb.andWhere(
        '(v.description ILIKE :search OR v.voucher_number ILIKE :search OR v.reference ILIKE :search)',
        { search: `%${filters.search}%` },
      );

    qb.orderBy('v.created_at', 'DESC')
      .addOrderBy('v.date', 'DESC')
      .addOrderBy('v.voucher_number', 'DESC');
    return qb.getMany();
  }

  async findOneVoucher(companyId: number, id: string) {
    const voucher = await this.voucherRepo.findOne({
      where: { id, companyId },
      relations: ['lines', 'lines.costCenter'],
    });
    if (!voucher)
      throw new NotFoundException(`Comprobante #${id} no encontrado`);
    return voucher;
  }

  async findVouchersBySourceDocumentId(
    companyId: number,
    sourceDocumentId: string,
  ) {
    const vouchers = await this.voucherRepo.find({
      where: { companyId, sourceDocumentId },
      relations: ['lines'],
      order: { createdAt: 'ASC' },
    });
    return vouchers;
  }

  async createVoucher(
    companyId: number,
    data: any, // Cambiado a any para ver qué recibe realmente
  ) {
    return await this.entityManager.transaction(async (manager) => {
      // Logs para depuración
      console.log('=== BACKEND RECIBIENDO COMPROBANTE ===');
      console.log('CompanyId:', companyId);
      console.log('Data recibida:', JSON.stringify(data, null, 2));
      console.log('=====================================');

      // Validar que la fecha del voucher pertenezca a un período contable abierto
      await this.validateOpenPeriod(companyId, data.date);

      // Validar que tenga al menos 2 líneas
      if (!data.lines || data.lines.length < 2) {
        throw new BadRequestException(
          'Un comprobante debe tener al menos 2 partidas (líneas)',
        );
      }

      // Validar partida doble: SUM(debit) === SUM(credit)
      const totalDebit = data.lines.reduce(
        (sum, l) => sum + Number(l.debit || 0),
        0,
      );
      const totalCredit = data.lines.reduce(
        (sum, l) => sum + Number(l.credit || 0),
        0,
      );
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        throw new BadRequestException(
          `Partida doble no cuadra: Débito (${totalDebit.toFixed(2)}) ≠ Crédito (${totalCredit.toFixed(2)})`,
        );
      }

      // Validar que cada línea tenga solo debit o credit (no ambos > 0)
      for (const line of data.lines) {
        if (Number(line.debit) > 0 && Number(line.credit) > 0) {
          throw new BadRequestException(
            `La partida de cuenta ${line.accountCode} no puede tener débito y crédito simultáneamente`,
          );
        }
      }

      // Resolver accountId y accountName desde accountCode si no se proporciona accountId
      const resolvedLines = await Promise.all(
        data.lines.map(async (line) => {
          let accountId = line.accountId;
          let accountName = line.accountName;

          if (!accountId) {
            const account = await manager.getRepository(Account).findOneBy({
              code: line.accountCode,
              companyId,
            });
            if (!account) {
              throw new BadRequestException(
                `Cuenta contable ${line.accountCode} no encontrada para esta empresa`,
              );
            }
            accountId = account.id;
            accountName = account.name;
          }

          // Buscar nombre de la subcuenta si se proporcionó (ahora es una cuenta con level=4)
          let subaccountName: string | null = null;
          if (line.subaccountCode) {
            const account = await manager.getRepository(Account).findOneBy({
              code: line.subaccountCode,
              companyId,
            });
            if (account) {
              subaccountName = account.name;
            }
          }

          // Buscar nombre del subelemento si se proporcionó
          let elementName: string | null = null;
          if (line.element) {
            try {
              const subelement = await manager
                .getRepository(Subelement)
                .findOneBy({
                  code: line.element,
                  companyId,
                });
              if (subelement) {
                elementName = subelement.name;
              } else {
                // Si no encuentra por companyId, buscar global (subelementos pueden ser globales)
                const globalSubelement = await manager
                  .getRepository(Subelement)
                  .findOneBy({
                    code: line.element,
                  });
                if (globalSubelement) {
                  elementName = globalSubelement.name;
                }
              }
            } catch (error) {
              // Si hay error, usar el código como nombre temporalmente
              elementName = line.element;
            }
          }

          // Buscar nombre del subelemento si se proporcionó
          let subelementName: string | null = null;
          if (line.subelement) {
            try {
              const subelement = await manager
                .getRepository(Subelement)
                .findOneBy({
                  code: line.subelement,
                  companyId,
                });
              if (subelement) {
                subelementName = subelement.name;
              } else {
                // Si no encuentra por companyId, buscar global (subelementos pueden ser globales)
                const globalSubelement = await manager
                  .getRepository(Subelement)
                  .findOneBy({
                    code: line.subelement,
                  });
                if (globalSubelement) {
                  subelementName = globalSubelement.name;
                }
              }
            } catch (error) {
              // Si hay error, usar el código como nombre temporalmente
              subelementName = line.subelement;
            }
          }

          return {
            accountId,
            accountCode: line.accountCode,
            accountName: accountName || line.accountName,
            subaccountCode: line.subaccountCode || null,
            subaccountName: subaccountName,
            element: line.element || null,
            elementName: elementName,
            subelement: line.subelement || null,
            subelementName: subelementName,
            debit: line.debit || 0,
            credit: line.credit || 0,
            description: line.description || null,
            costCenterId: line.costCenterId || null,
            reference: line.reference || null,
          };
        }),
      );

      // Generar número de comprobante
      const count = await manager
        .getRepository(Voucher)
        .count({ where: { companyId } });
      const voucherNumber = `COP-${String(count + 1).padStart(5, '0')}`;

      const voucher = manager.getRepository(Voucher).create({
        companyId,
        voucherNumber,
        date: data.date,
        description: data.description,
        type: (data.type as any) || 'otro',
        status: 'draft',
        totalAmount: totalDebit,
        sourceModule: (data.sourceModule as SourceModule) || 'manual',
        sourceDocumentId: data.sourceDocumentId || null,
        reference: data.reference || null,
        createdBy: data.createdBy || null,
        lines: resolvedLines.map((line, index) => {
          // Log para ver qué se está guardando
          console.log(`Guardando línea ${index + 1}:`, {
            subaccountCode: line.subaccountCode,
            subaccountName: line.subaccountName,
            element: line.element,
            elementName: line.elementName,
          });

          return manager.getRepository(VoucherLine).create({
            accountId: line.accountId,
            accountCode: line.accountCode,
            accountName: line.accountName,
            subaccountCode: line.subaccountCode,
            subaccountName: line.subaccountName,
            element: line.element,
            elementName: line.elementName,
            debit: line.debit,
            credit: line.credit,
            description: line.description,
            costCenterId: line.costCenterId,
            reference: line.reference,
            lineOrder: index + 1,
          });
        }),
      });

      const saved = await manager.getRepository(Voucher).save(voucher);

      // Si se publica directamente, actualizar saldos dentro de la misma transacción
      if (data.type === 'apertura') {
        await this.postVoucherInTransaction(manager, companyId, saved.id);
      }

      return saved;
    });
  }

  async updateVoucherStatus(companyId: number, id: string, status: string) {
    return await this.entityManager.transaction(async (manager) => {
      // Buscar voucher dentro de la transacción
      const voucher = await manager.getRepository(Voucher).findOne({
        where: { id, companyId },
      });

      if (!voucher) {
        throw new NotFoundException(`Voucher #${id} no encontrado`);
      }

      if (voucher.status === 'posted' && status !== 'cancelled') {
        throw new BadRequestException(
          'Un comprobante contabilizado solo puede ser anulado',
        );
      }

      // Si se está intentando cambiar la fecha a un período cerrado, validar
      if (status === 'posted') {
        await this.validateOpenPeriod(companyId, voucher.date);
      }

      if (status === 'posted') {
        // Usar el método transaccional para publicar
        return await this.postVoucherInTransaction(manager, companyId, id);
      }

      if (status === 'cancelled' && voucher.status === 'posted') {
        // Revertir saldos y actualizar estado en una sola transacción
        const voucherWithLines = await manager.getRepository(Voucher).findOne({
          where: { id, companyId },
          relations: ['lines'],
        });

        if (!voucherWithLines) {
          throw new NotFoundException(`Voucher #${id} no encontrado`);
        }

        // Revertir saldos de cuentas
        for (const line of voucherWithLines.lines) {
          const account = await manager.getRepository(Account).findOneBy({
            id: line.accountId,
            companyId,
          });
          if (account) {
            const debit = Number(line.debit) || 0;
            const credit = Number(line.credit) || 0;
            // Revertir el impacto en el balance
            if (account.nature === 'deudora') {
              account.balance = Number(account.balance) - debit + credit;
            } else {
              account.balance = Number(account.balance) - credit + debit;
            }
            await manager.getRepository(Account).save(account);
          }
        }

        // Actualizar estado del voucher
        voucherWithLines.status = 'cancelled';
        return await manager.getRepository(Voucher).save(voucherWithLines);
      }

      // Para otros cambios de estado (draft -> otros que no sean posted/cancelled)
      voucher.status = status as any;
      return await manager.getRepository(Voucher).save(voucher);
    });
  }

  private async postVoucher(companyId: number, id: string) {
    return await this.entityManager.transaction(async (manager) => {
      return await this.postVoucherInTransaction(manager, companyId, id);
    });
  }

  private async postVoucherInTransaction(
    manager: EntityManager,
    companyId: number,
    id: string,
  ) {
    // Buscar voucher con líneas dentro de la transacción
    const voucher = await manager.getRepository(Voucher).findOne({
      where: { id, companyId },
      relations: ['lines'],
    });

    if (!voucher) {
      throw new NotFoundException(`Voucher #${id} no encontrado`);
    }

    // Actualizar saldos de cuentas dentro de la misma transacción
    for (const line of voucher.lines) {
      const account = await manager.getRepository(Account).findOneBy({
        id: line.accountId,
        companyId,
      });
      if (account) {
        const debit = Number(line.debit) || 0;
        const credit = Number(line.credit) || 0;
        // Naturaleza deudora: saldo aumenta con débito, disminuye con crédito
        // Naturaleza acreedora: saldo aumenta con crédito, disminuye con débito
        if (account.nature === 'deudora') {
          account.balance = Number(account.balance) + debit - credit;
        } else {
          account.balance = Number(account.balance) + credit - debit;
        }
        await manager.getRepository(Account).save(account);
      }
    }

    // Actualizar estado del voucher dentro de la misma transacción
    voucher.status = 'posted';
    return await manager.getRepository(Voucher).save(voucher);
  }

  private async reverseVoucherBalances(voucher: Voucher) {
    return await this.entityManager.transaction(async (manager) => {
      // Buscar voucher con líneas para tener acceso a companyId
      const voucherWithLines = await manager.getRepository(Voucher).findOne({
        where: { id: voucher.id },
        relations: ['lines'],
      });

      if (!voucherWithLines) {
        throw new NotFoundException(`Voucher #${voucher.id} no encontrado`);
      }

      // Revertir saldos de cuentas dentro de la misma transacción
      for (const line of voucherWithLines.lines) {
        const account = await manager.getRepository(Account).findOneBy({
          id: line.accountId,
          companyId: voucherWithLines.companyId,
        });
        if (account) {
          const debit = Number(line.debit) || 0;
          const credit = Number(line.credit) || 0;
          // Revertir el impacto en el balance
          if (account.nature === 'deudora') {
            account.balance = Number(account.balance) - debit + credit;
          } else {
            account.balance = Number(account.balance) - credit + debit;
          }
          await manager.getRepository(Account).save(account);
        }
      }

      // Actualizar estado del voucher a cancelled dentro de la misma transacción
      voucherWithLines.status = 'cancelled';
      return await manager.getRepository(Voucher).save(voucherWithLines);
    });
  }

  async deleteVoucher(companyId: number, id: string) {
    return await this.entityManager.transaction(async (manager) => {
      const voucher = await manager.getRepository(Voucher).findOne({
        where: { id, companyId },
        relations: ['lines'],
      });

      if (!voucher) {
        throw new NotFoundException(`Voucher #${id} no encontrado`);
      }

      if (voucher.status === 'posted') {
        throw new BadRequestException(
          'No se puede eliminar un comprobante contabilizado. Anúlelo primero.',
        );
      }

      // Eliminar líneas primero (debido a restricciones de clave foránea)
      await manager.getRepository(VoucherLine).remove(voucher.lines);

      // Luego eliminar el voucher
      return await manager.getRepository(Voucher).remove(voucher);
    });
  }

  async getVoucherStatistics(companyId: number) {
    const vouchers = await this.voucherRepo.find({ where: { companyId } });
    const totalAmount = vouchers
      .filter((v) => v.status === 'posted')
      .reduce((sum, v) => sum + Number(v.totalAmount), 0);

    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const bySource: Record<string, number> = {};

    for (const v of vouchers) {
      byStatus[v.status] = (byStatus[v.status] || 0) + 1;
      byType[v.type] = (byType[v.type] || 0) + 1;
      bySource[v.sourceModule] = (bySource[v.sourceModule] || 0) + 1;
    }

    return {
      total: vouchers.length,
      totalAmount,
      byStatus,
      byType,
      bySource,
    };
  }

  // ══════════════════════════════════════════════════════════
  // ── VOUCHER LINES (Partidas) ──
  // ══════════════════════════════════════════════════════════

  async findAllVoucherLines(
    companyId: number,
    filters?: {
      accountCode?: string;
      costCenterId?: string;
      fromDate?: string;
      toDate?: string;
      voucherId?: string;
      search?: string;
    },
  ) {
    const qb = this.voucherLineRepo
      .createQueryBuilder('vl')
      .innerJoinAndSelect('vl.voucher', 'v')
      .leftJoinAndSelect('vl.costCenter', 'cc')
      .where('v.companyId = :companyId', { companyId });

    if (filters?.accountCode)
      qb.andWhere('vl.account_code = :accountCode', {
        accountCode: filters.accountCode,
      });
    if (filters?.costCenterId)
      qb.andWhere('vl.cost_center_id = :costCenterId', {
        costCenterId: filters.costCenterId,
      });
    if (filters?.fromDate)
      qb.andWhere('v.date >= :fromDate', { fromDate: filters.fromDate });
    if (filters?.toDate)
      qb.andWhere('v.date <= :toDate', { toDate: filters.toDate });
    if (filters?.voucherId)
      qb.andWhere('vl.voucher_id = :voucherId', {
        voucherId: filters.voucherId,
      });
    if (filters?.search)
      qb.andWhere(
        '(vl.account_name ILIKE :search OR vl.account_code ILIKE :search OR vl.description ILIKE :search)',
        { search: `%${filters.search}%` },
      );

    qb.orderBy('v.date', 'DESC').addOrderBy('vl.line_order', 'ASC');
    return qb.getMany();
  }

  async getVoucherLineStatistics(companyId: number) {
    const lines = await this.voucherLineRepo
      .createQueryBuilder('vl')
      .innerJoin('vl.voucher', 'v')
      .where('v.companyId = :companyId', { companyId })
      .andWhere('v.status = :status', { status: 'posted' })
      .getMany();

    const totalDebit = lines.reduce((sum, l) => sum + Number(l.debit), 0);
    const totalCredit = lines.reduce((sum, l) => sum + Number(l.credit), 0);

    return {
      totalLines: lines.length,
      totalDebit,
      totalCredit,
      balance: totalDebit - totalCredit,
    };
  }

  // ══════════════════════════════════════════════════════════
  // ── COST CENTERS (Centros de Costo) ──
  // ══════════════════════════════════════════════════════════

  async findAllCostCenters(
    companyId: number,
    filters?: {
      type?: string;
      search?: string;
      activeOnly?: string;
    },
  ) {
    const qb = this.costCenterRepo
      .createQueryBuilder('cc')
      .where('cc.companyId = :companyId', { companyId });

    if (filters?.type) qb.andWhere('cc.type = :type', { type: filters.type });
    if (filters?.activeOnly === 'true') qb.andWhere('cc.is_active = true');
    if (filters?.search)
      qb.andWhere('(cc.name ILIKE :search OR cc.code ILIKE :search)', {
        search: `%${filters.search}%`,
      });

    qb.orderBy('cc.code', 'ASC');
    return qb.getMany();
  }

  async getCostCenterStatistics(companyId: number) {
    const centers = await this.costCenterRepo.find({
      where: { companyId },
    });
    const active = centers.filter((c) => c.isActive);
    const byType: Record<string, number> = {};
    const totalBudget = centers.reduce((sum, c) => sum + Number(c.budget), 0);

    for (const c of active) {
      byType[c.type] = (byType[c.type] || 0) + 1;
    }

    return {
      total: centers.length,
      active: active.length,
      inactive: centers.length - active.length,
      totalBudget,
      byType,
    };
  }

  async findOneCostCenter(companyId: number, id: string) {
    const center = await this.costCenterRepo.findOneBy({ id, companyId });
    if (!center)
      throw new NotFoundException(`Centro de costo #${id} no encontrado`);
    return center;
  }

  async createCostCenter(companyId: number, data: Partial<CostCenter>) {
    const existing = await this.costCenterRepo.findOneBy({
      code: data.code,
      companyId,
    });
    if (existing) {
      throw new BadRequestException(
        `Ya existe un centro de costo con el código ${data.code}`,
      );
    }

    // Set default values for fields not sent by frontend
    const centerData = {
      ...data,
      companyId,
      description: data.description || null,
      type: data.type || 'general',
      budget: data.budget || 0,
    };

    const center = this.costCenterRepo.create(centerData);
    return this.costCenterRepo.save(center);
  }

  async updateCostCenter(
    companyId: number,
    id: string,
    data: Partial<CostCenter>,
  ) {
    const center = await this.findOneCostCenter(companyId, id);

    // Only update fields that are actually sent, preserve others
    const updateData = {
      ...data,
      // Ensure required fields have default values if not provided
      description:
        data.description !== undefined ? data.description : center.description,
      type: data.type !== undefined ? data.type : center.type,
      budget: data.budget !== undefined ? data.budget : center.budget,
    };

    Object.assign(center, updateData);
    return this.costCenterRepo.save(center);
  }

  async deleteCostCenter(companyId: number, id: string) {
    const center = await this.findOneCostCenter(companyId, id);

    // Verificar que no tenga partidas asociadas
    const usedInLines = await this.voucherLineRepo.findOneBy({
      costCenterId: id,
    });
    if (usedInLines) {
      throw new BadRequestException(
        'No se puede eliminar: el centro de costo tiene partidas contables asociadas',
      );
    }

    await this.costCenterRepo.remove(center);
    return { message: 'Centro de costo eliminado correctamente' };
  }

  // ══════════════════════════════════════════════════════════
  // ── FISCAL YEARS (Años Fiscales) ──
  // ══════════════════════════════════════════════════════════

  async findAllFiscalYears(companyId: number) {
    return this.fiscalYearRepo.find({
      where: { companyId },
      relations: ['periods'],
      order: { startDate: 'DESC' },
    });
  }

  async findOneFiscalYear(companyId: number, id: string) {
    const fy = await this.fiscalYearRepo.findOne({
      where: { id, companyId },
      relations: ['periods'],
    });
    if (!fy) throw new NotFoundException(`Año fiscal #${id} no encontrado`);
    return fy;
  }

  async createFiscalYear(
    companyId: number,
    data: { name: string; startDate: string; endDate: string },
  ) {
    // Verificar que no se traslape con otro año fiscal
    const overlapping = await this.fiscalYearRepo
      .createQueryBuilder('fy')
      .where('fy.companyId = :companyId', { companyId })
      .andWhere('fy.status = :status', { status: 'open' })
      .andWhere('(fy.start_date <= :endDate AND fy.end_date >= :startDate)', {
        startDate: data.startDate,
        endDate: data.endDate,
      })
      .getOne();

    if (overlapping) {
      throw new BadRequestException(
        `El período se traslapa con el año fiscal "${overlapping.name}"`,
      );
    }

    const fy = this.fiscalYearRepo.create({
      companyId,
      name: data.name,
      startDate: data.startDate,
      endDate: data.endDate,
      status: 'open',
    });

    const savedFy = await this.fiscalYearRepo.save(fy);

    // Crear 12 períodos mensuales automáticamente
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    const months = [
      'Enero',
      'Febrero',
      'Marzo',
      'Abril',
      'Mayo',
      'Junio',
      'Julio',
      'Agosto',
      'Septiembre',
      'Octubre',
      'Noviembre',
      'Diciembre',
    ];

    const periods: AccountingPeriod[] = [];
    const current = new Date(start);
    while (current <= end) {
      const m = current.getMonth();
      const y = current.getFullYear();
      const lastDay = new Date(y, m + 1, 0).getDate();
      const periodStart = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const periodEnd = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      periods.push(
        this.periodRepo.create({
          companyId,
          fiscalYearId: savedFy.id,
          name: `${months[m]} ${y}`,
          month: m + 1,
          year: y,
          startDate: periodStart,
          endDate: periodEnd,
          status: 'open',
        }),
      );

      current.setMonth(current.getMonth() + 1);
    }

    await this.periodRepo.save(periods);

    return this.findOneFiscalYear(companyId, savedFy.id);
  }

  async closeFiscalYear(companyId: number, id: string) {
    const fy = await this.findOneFiscalYear(companyId, id);

    // Cerrar todos los períodos abiertos
    for (const period of fy.periods) {
      if (period.status === 'open') {
        period.status = 'closed';
        period.closedAt = new Date();
        await this.periodRepo.save(period);
      }
    }

    fy.status = 'closed';
    return this.fiscalYearRepo.save(fy);
  }

  // ══════════════════════════════════════════════════════════
  // ── ACCOUNTING PERIODS (Períodos Contables) ──
  // ══════════════════════════════════════════════════════════

  async findAllPeriods(companyId: number, fiscalYearId?: string) {
    const where: any = { companyId };
    if (fiscalYearId) where.fiscalYearId = fiscalYearId;
    return this.periodRepo.find({
      where,
      order: { year: 'ASC', month: 'ASC' },
    });
  }

  async closePeriod(companyId: number, id: string, closedBy: string) {
    const period = await this.periodRepo.findOneBy({ id, companyId });
    if (!period) throw new NotFoundException(`Período #${id} no encontrado`);
    if (period.status === 'closed')
      throw new BadRequestException('El período ya está cerrado');

    period.status = 'closed';
    period.closedAt = new Date();
    period.closedBy = closedBy;
    return this.periodRepo.save(period);
  }

  async reopenPeriod(companyId: number, id: string) {
    const period = await this.periodRepo.findOneBy({ id, companyId });
    if (!period) throw new NotFoundException(`Período #${id} no encontrado`);

    period.status = 'open';
    period.closedAt = null;
    period.closedBy = null;
    return this.periodRepo.save(period);
  }

  // ══════════════════════════════════════════════════════════
  // ── INTER-MODULE INTEGRATION (Fase 2) ──
  // ══════════════════════════════════════════════════════════

  async createVoucherFromModule(
    companyId: number,
    source: SourceModule,
    sourceDocumentId: string,
    data: {
      date: string;
      description: string;
      type: string;
      reference?: string;
      createdBy?: string;
      lines: {
        accountCode: string;
        debit: number;
        credit: number;
        description?: string;
        costCenterId?: string;
      }[];
    },
  ) {
    // Resolver accountId y accountName desde accountCode
    const resolvedLines: {
      accountId: string;
      accountCode: string;
      accountName: string;
      debit: number;
      credit: number;
      description?: string;
      costCenterId?: string;
    }[] = [];
    for (const line of data.lines) {
      const account = await this.accountRepo.findOneBy({
        code: line.accountCode,
        companyId,
      });
      if (!account) {
        throw new BadRequestException(
          `Cuenta contable ${line.accountCode} no encontrada para esta empresa`,
        );
      }
      resolvedLines.push({
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        debit: line.debit,
        credit: line.credit,
        description: line.description,
        costCenterId: line.costCenterId,
      });
    }

    return this.createVoucher(companyId, {
      date: data.date,
      description: data.description,
      type: data.type,
      reference: data.reference,
      sourceModule: source,
      sourceDocumentId,
      createdBy: data.createdBy || 'Sistema',
      lines: resolvedLines,
    });
  }

  // ══════════════════════════════════════════════════════════
  // ── REPORTS (Informes Contables - Fase 3) ──
  // ══════════════════════════════════════════════════════════

  async getTrialBalance(companyId: number, fromDate?: string, toDate?: string) {
    // Optimized single query to eliminate N+1 problem
    const trialBalanceQuery = this.voucherLineRepo
      .createQueryBuilder('vl')
      .select('vl.account_code', 'accountCode')
      .addSelect('vl.account_name', 'accountName')
      .addSelect('a.nature', 'nature')
      .addSelect('a.type', 'accountType')
      // Opening balance calculation (movimientos antes del período)
      .addSelect(
        `CASE 
          WHEN a.nature = 'deudora'
          THEN COALESCE(SUM(CASE WHEN v.date < :fromDate THEN vl.debit ELSE 0 END), 0) - 
               COALESCE(SUM(CASE WHEN v.date < :fromDate THEN vl.credit ELSE 0 END), 0)
          ELSE COALESCE(SUM(CASE WHEN v.date < :fromDate THEN vl.credit ELSE 0 END), 0) - 
               COALESCE(SUM(CASE WHEN v.date < :fromDate THEN vl.debit ELSE 0 END), 0)
        END`,
        'openingBalance',
      )
      // Period debit
      .addSelect(
        `COALESCE(SUM(CASE 
          WHEN (:fromDate IS NULL OR v.date >= :fromDate) AND (:toDate IS NULL OR v.date <= :toDate) 
          THEN vl.debit ELSE 0 END), 0)`,
        'periodDebit',
      )
      // Period credit
      .addSelect(
        `COALESCE(SUM(CASE 
          WHEN (:fromDate IS NULL OR v.date >= :fromDate) AND (:toDate IS NULL OR v.date <= :toDate) 
          THEN vl.credit ELSE 0 END), 0)`,
        'periodCredit',
      )
      // Closing balance calculation
      .addSelect(
        `CASE 
          WHEN a.nature = 'deudora'
          THEN (COALESCE(SUM(CASE WHEN v.date < :fromDate THEN vl.debit ELSE 0 END), 0) - 
                COALESCE(SUM(CASE WHEN v.date < :fromDate THEN vl.credit ELSE 0 END), 0)) +
               (COALESCE(SUM(CASE 
                 WHEN (:fromDate IS NULL OR v.date >= :fromDate) AND (:toDate IS NULL OR v.date <= :toDate) 
                 THEN vl.debit ELSE 0 END), 0) - 
                COALESCE(SUM(CASE 
                 WHEN (:fromDate IS NULL OR v.date >= :fromDate) AND (:toDate IS NULL OR v.date <= :toDate) 
                 THEN vl.credit ELSE 0 END), 0))
          ELSE (COALESCE(SUM(CASE WHEN v.date < :fromDate THEN vl.credit ELSE 0 END), 0) - 
                COALESCE(SUM(CASE WHEN v.date < :fromDate THEN vl.debit ELSE 0 END), 0)) +
               (COALESCE(SUM(CASE 
                 WHEN (:fromDate IS NULL OR v.date >= :fromDate) AND (:toDate IS NULL OR v.date <= :toDate) 
                 THEN vl.credit ELSE 0 END), 0) - 
                COALESCE(SUM(CASE 
                 WHEN (:fromDate IS NULL OR v.date >= :fromDate) AND (:toDate IS NULL OR v.date <= :toDate) 
                 THEN vl.debit ELSE 0 END), 0))
        END`,
        'closingBalance',
      )
      .innerJoin('vl.voucher', 'v')
      .innerJoin('vl.account', 'a')
      .where('v.companyId = :companyId', { companyId })
      .andWhere('v.status = :status', { status: 'posted' })
      .andWhere(
        `(:fromDate IS NULL OR v.date <= :toDate) AND (:toDate IS NULL OR v.date >= :fromDate)`,
      )
      .groupBy('vl.account_code')
      .addGroupBy('vl.account_name')
      .addGroupBy('a.nature')
      .addGroupBy('a.type')
      .having(
        `COALESCE(SUM(vl.debit), 0) > 0 OR COALESCE(SUM(vl.credit), 0) > 0`,
      )
      .orderBy('vl.account_code', 'ASC');

    // Set parameters for the query
    trialBalanceQuery.setParameters({
      companyId,
      fromDate: fromDate || null,
      toDate: toDate || null,
    });

    const results = await trialBalanceQuery.getRawMany();

    // Transform results to match expected interface
    return results.map((row: any) => ({
      accountCode: row.accountCode,
      accountName: row.accountName,
      nature: row.nature || 'deudora',
      accountType: row.accountType || '',
      openingBalance: Number(row.openingBalance || 0),
      periodDebit: Number(row.periodDebit || 0),
      periodCredit: Number(row.periodCredit || 0),
      closingBalance: Number(row.closingBalance || 0),
    }));
  }

  async getBalanceSheet(companyId: number, asOfDate?: string) {
    const qb = this.voucherLineRepo
      .createQueryBuilder('vl')
      .select('a.type', 'accountType')
      .addSelect('vl.account_code', 'accountCode')
      .addSelect('vl.account_name', 'accountName')
      .addSelect('SUM(vl.debit) - SUM(vl.credit)', 'balance')
      .innerJoin('vl.voucher', 'v')
      .innerJoin('vl.account', 'a')
      .where('v.companyId = :companyId', { companyId })
      .andWhere('v.status = :status', { status: 'posted' })
      .andWhere('a.type IN (:...types)', {
        types: ['asset', 'liability', 'equity'],
      });

    if (asOfDate) qb.andWhere('v.date <= :asOfDate', { asOfDate });

    const rows = await qb
      .groupBy('a.type')
      .addGroupBy('vl.account_code')
      .addGroupBy('vl.account_name')
      .orderBy('a.type', 'ASC')
      .addOrderBy('vl.account_code', 'ASC')
      .getRawMany();

    const assets = rows.filter((r: any) => r.accountType === 'asset');
    const liabilities = rows.filter((r: any) => r.accountType === 'liability');
    const equity = rows.filter((r: any) => r.accountType === 'equity');

    const totalAssets = assets.reduce(
      (sum: number, r: any) => sum + Number(r.balance),
      0,
    );
    const totalLiabilities = liabilities.reduce(
      (sum: number, r: any) => sum + Math.abs(Number(r.balance)),
      0,
    );
    const totalEquity = equity.reduce(
      (sum: number, r: any) => sum + Math.abs(Number(r.balance)),
      0,
    );

    return {
      assets: { items: assets, total: totalAssets },
      liabilities: { items: liabilities, total: totalLiabilities },
      equity: { items: equity, total: totalEquity },
      balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
    };
  }

  async getIncomeStatement(
    companyId: number,
    fromDate?: string,
    toDate?: string,
  ) {
    const qb = this.voucherLineRepo
      .createQueryBuilder('vl')
      .select('a.type', 'accountType')
      .addSelect('vl.account_code', 'accountCode')
      .addSelect('vl.account_name', 'accountName')
      .addSelect('SUM(vl.debit)', 'totalDebit')
      .addSelect('SUM(vl.credit)', 'totalCredit')
      .innerJoin('vl.voucher', 'v')
      .innerJoin('vl.account', 'a')
      .where('v.companyId = :companyId', { companyId })
      .andWhere('v.status = :status', { status: 'posted' })
      .andWhere('a.type IN (:...types)', {
        types: ['income', 'expense'],
      });

    if (fromDate) qb.andWhere('v.date >= :fromDate', { fromDate });
    if (toDate) qb.andWhere('v.date <= :toDate', { toDate });

    const rows = await qb
      .groupBy('a.type')
      .addGroupBy('vl.account_code')
      .addGroupBy('vl.account_name')
      .orderBy('a.type', 'ASC')
      .addOrderBy('vl.account_code', 'ASC')
      .getRawMany();

    const incomeRows = rows.filter((r: any) => r.accountType === 'income');
    const expenseRows = rows.filter((r: any) => r.accountType === 'expense');

    const totalIncome = incomeRows.reduce(
      (sum: number, r: any) =>
        sum + Math.abs(Number(r.totalCredit) - Number(r.totalDebit)),
      0,
    );
    const totalExpenses = expenseRows.reduce(
      (sum: number, r: any) =>
        sum + Math.abs(Number(r.totalDebit) - Number(r.totalCredit)),
      0,
    );

    return {
      income: { items: incomeRows, total: totalIncome },
      expenses: { items: expenseRows, total: totalExpenses },
      netProfit: totalIncome - totalExpenses,
    };
  }

  async getExpenseBreakdown(
    companyId: number,
    fromDate?: string,
    toDate?: string,
  ) {
    // Obtener elementos con sus subelementos y totales de gastos
    const elementosQuery = this.voucherLineRepo
      .createQueryBuilder('vl')
      .select('vl.element', 'elementCode')
      .addSelect('vl.elementName', 'elementName')
      .addSelect('COALESCE(SUM(vl.debit), 0)', 'totalDebit')
      .addSelect('COALESCE(SUM(vl.credit), 0)', 'totalCredit')
      .innerJoin('vl.voucher', 'v')
      .where('v.companyId = :companyId', { companyId })
      .andWhere('v.status = :status', { status: 'posted' })
      .andWhere('vl.element IS NOT NULL');

    if (fromDate) elementosQuery.andWhere('v.date >= :fromDate', { fromDate });
    if (toDate) elementosQuery.andWhere('v.date <= :toDate', { toDate });

    const elementos = await elementosQuery
      .groupBy('vl.element')
      .addGroupBy('vl.elementName')
      .orderBy('vl.element', 'ASC')
      .getRawMany();

    const result: any[] = [];

    for (const elem of elementos) {
      const totalElemento = Math.abs(
        Number(elem.totalDebit) - Number(elem.totalCredit),
      );

      // Obtener subelementos
      const subelementosQuery = this.voucherLineRepo
        .createQueryBuilder('vl')
        .select('vl.subelement', 'subelementCode')
        .addSelect('vl.subelementName', 'subelementName')
        .addSelect('COALESCE(SUM(vl.debit), 0)', 'totalDebit')
        .addSelect('COALESCE(SUM(vl.credit), 0)', 'totalCredit')
        .innerJoin('vl.voucher', 'v')
        .where('v.companyId = :companyId', { companyId })
        .andWhere('v.status = :status', { status: 'posted' })
        .andWhere('vl.element = :elementCode', {
          elementCode: elem.elementCode,
        })
        .andWhere('vl.subelement IS NOT NULL');

      if (fromDate)
        subelementosQuery.andWhere('v.date >= :fromDate', { fromDate });
      if (toDate) subelementosQuery.andWhere('v.date <= :toDate', { toDate });

      const subelementos = await subelementosQuery
        .groupBy('vl.subelement')
        .addGroupBy('vl.subelementName')
        .orderBy('vl.subelement', 'ASC')
        .getRawMany();

      result.push({
        elementCode: elem.elementCode,
        elementName: elem.elementName,
        total: totalElemento,
        subelements: subelementos.map((sub: any) => ({
          subelementCode: sub.subelementCode,
          subelementName: sub.subelementName,
          total: Math.abs(Number(sub.totalDebit) - Number(sub.totalCredit)),
        })),
      });
    }

    return {
      elements: result,
      grandTotal: (result as any[]).reduce(
        (s: number, e: any) => s + e.total,
        0,
      ),
    };
  }

  async getGeneralLedger(
    companyId: number,
    accountCode: string,
    fromDate?: string,
    toDate?: string,
  ) {
    const qb = this.voucherLineRepo
      .createQueryBuilder('vl')
      .innerJoinAndSelect('vl.voucher', 'v')
      .leftJoinAndSelect('vl.costCenter', 'cc')
      .where('v.companyId = :companyId', { companyId })
      .andWhere('v.status = :status', { status: 'posted' })
      .andWhere('vl.account_code = :accountCode', { accountCode });

    if (fromDate) qb.andWhere('v.date >= :fromDate', { fromDate });
    if (toDate) qb.andWhere('v.date <= :toDate', { toDate });

    const lines = await qb
      .orderBy('v.date', 'ASC')
      .addOrderBy('v.voucher_number', 'ASC')
      .getMany();

    // Calcular saldo acumulado
    let runningBalance = 0;
    const account = await this.accountRepo.findOneBy({
      code: accountCode,
      companyId,
    });
    const isDeudora = account?.nature === 'deudora';

    const entries = lines.map((l) => {
      const debit = Number(l.debit);
      const credit = Number(l.credit);
      if (isDeudora) {
        runningBalance += debit - credit;
      } else {
        runningBalance += credit - debit;
      }
      return {
        ...l,
        runningBalance,
      };
    });

    return {
      accountCode,
      accountName: account?.name || accountCode,
      nature: account?.nature || 'deudora',
      entries,
      finalBalance: runningBalance,
    };
  }

  async getGeneralJournal(
    companyId: number,
    fromDate?: string,
    toDate?: string,
  ) {
    return this.findAllVouchers(companyId, {
      status: 'posted',
      fromDate,
      toDate,
    });
  }

  async getCostCenterAnalysis(
    companyId: number,
    fromDate?: string,
    toDate?: string,
  ) {
    const qb = this.voucherLineRepo
      .createQueryBuilder('vl')
      .select('cc.code', 'costCenterCode')
      .addSelect('cc.name', 'costCenterName')
      .addSelect('SUM(vl.debit)', 'totalDebit')
      .addSelect('SUM(vl.credit)', 'totalCredit')
      .innerJoin('vl.voucher', 'v')
      .innerJoin('vl.costCenter', 'cc')
      .where('v.companyId = :companyId', { companyId })
      .andWhere('v.status = :status', { status: 'posted' });

    if (fromDate) qb.andWhere('v.date >= :fromDate', { fromDate });
    if (toDate) qb.andWhere('v.date <= :toDate', { toDate });

    return qb
      .groupBy('cc.code')
      .addGroupBy('cc.name')
      .orderBy('cc.code', 'ASC')
      .getRawMany();
  }

  // ══════════════════════════════════════════════════════════
  // ── ELEMENTOS (Agrupación de Cuentas por Tipo) ──
  // ══════════════════════════════════════════════════════════

  async getAccountElements(companyId: number) {
    const accounts = await this.accountRepo.find({
      where: { companyId },
      order: { code: 'ASC' },
    });

    // Agrupar por tipo (asset, liability, equity, income, expense)
    const elements: Record<
      string,
      {
        type: string;
        label: string;
        nature: string;
        accountCount: number;
        activeCount: number;
        totalBalance: number;
        accounts: any[];
      }
    > = {};

    const typeLabels: Record<string, string> = {
      asset: 'Activos',
      liability: 'Pasivos',
      equity: 'Patrimonio',
      income: 'Ingresos',
      expense: 'Gastos',
    };

    const typeNature: Record<string, string> = {
      asset: 'deudora',
      liability: 'acreedora',
      equity: 'acreedora',
      income: 'acreedora',
      expense: 'deudora',
    };

    for (const a of accounts) {
      if (!elements[a.type]) {
        elements[a.type] = {
          type: a.type,
          label: typeLabels[a.type] || a.type,
          nature: typeNature[a.type] || 'deudora',
          accountCount: 0,
          activeCount: 0,
          totalBalance: 0,
          accounts: [],
        };
      }
      elements[a.type].accountCount++;
      if (a.isActive) elements[a.type].activeCount++;
      elements[a.type].totalBalance += Number(a.balance);
      elements[a.type].accounts.push(a);
    }

    return Object.values(elements);
  }

  // ══════════════════════════════════════════════════════════
  // ── LEGACY: Journal Entries (backward compatibility) ──
  // ══════════════════════════════════════════════════════════

  async findAllEntries(
    companyId: number,
    filters?: {
      status?: string;
      fromDate?: string;
      toDate?: string;
      accountCode?: string;
    },
  ) {
    // Entries functionality removed - return empty array
    return [];
  }

  async getAccountingStatistics(companyId: number) {
    const [accounts, vouchers, costCenters] = await Promise.all([
      this.accountRepo.find({ where: { companyId } }),
      this.voucherRepo.find({ where: { companyId } }),
      this.costCenterRepo.find({ where: { companyId } }),
    ]);

    return {
      totalAccounts: accounts.length,
      totalVouchers: vouchers.length,
      totalCostCenters: costCenters.length,
      activeVouchers: vouchers.filter((v) => v.status === 'posted').length,
      draftVouchers: vouchers.filter((v) => v.status === 'draft').length,
    };
  }

  async getFinancialKPIs(companyId: number) {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const lastMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const lastYear = currentMonth === 1 ? currentYear - 1 : currentYear;

    // Get vouchers for current and last month
    const [currentMonthVouchers, lastMonthVouchers] = await Promise.all([
      this.findAllVouchers(companyId, {
        fromDate: `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`,
        toDate: `${currentYear}-${String(currentMonth).padStart(2, '0')}-31`,
      }),
      this.findAllVouchers(companyId, {
        fromDate: `${lastYear}-${String(lastMonth).padStart(2, '0')}-01`,
        toDate: `${lastYear}-${String(lastMonth).padStart(2, '0')}-31`,
      }),
    ]);

    // Get all accounts for balance calculations
    const accounts = await this.accountRepo.find({
      where: { companyId },
      relations: ['voucherLines'],
    });

    // Calculate current month totals by account type
    const currentMonthTotals = currentMonthVouchers.reduce(
      (acc, voucher) => {
        voucher.lines.forEach((line) => {
          const account = accounts.find((a) => a.id === line.accountId);
          if (account) {
            if (account.type === 'asset' || account.type === 'expense') {
              acc.debits += Number(line.debit || 0);
            } else {
              acc.credits += Number(line.credit || 0);
            }
          }
        });
        return acc;
      },
      { debits: 0, credits: 0 },
    );

    // Calculate last month totals
    const lastMonthTotals = lastMonthVouchers.reduce(
      (acc, voucher) => {
        voucher.lines.forEach((line) => {
          const account = accounts.find((a) => a.id === line.accountId);
          if (account) {
            if (account.type === 'asset' || account.type === 'expense') {
              acc.debits += Number(line.debit || 0);
            } else {
              acc.credits += Number(line.credit || 0);
            }
          }
        });
        return acc;
      },
      { debits: 0, credits: 0 },
    );

    // Calculate account balances
    const assetAccounts = accounts.filter((a) => a.type === 'asset');
    const liabilityAccounts = accounts.filter((a) => a.type === 'liability');
    const equityAccounts = accounts.filter((a) => a.type === 'equity');
    const revenueAccounts = accounts.filter((a) => a.type === 'income');
    const expenseAccounts = accounts.filter((a) => a.type === 'expense');

    const totalAssets = assetAccounts.reduce(
      (sum, a) => sum + Number(a.balance || 0),
      0,
    );
    const totalLiabilities = liabilityAccounts.reduce(
      (sum, a) => sum + Number(a.balance || 0),
      0,
    );
    const totalEquity = equityAccounts.reduce(
      (sum, a) => sum + Number(a.balance || 0),
      0,
    );
    const totalRevenue = revenueAccounts.reduce(
      (sum, a) => sum + Number(a.balance || 0),
      0,
    );
    const totalExpenses = expenseAccounts.reduce(
      (sum, a) => sum + Number(a.balance || 0),
      0,
    );

    const netIncome = totalRevenue - totalExpenses;

    // Calculate trends
    const revenueTrend =
      lastMonthTotals.credits > 0
        ? ((currentMonthTotals.credits - lastMonthTotals.credits) /
            lastMonthTotals.credits) *
          100
        : 0;
    const expenseTrend =
      lastMonthTotals.debits > 0
        ? ((currentMonthTotals.debits - lastMonthTotals.debits) /
            lastMonthTotals.debits) *
          100
        : 0;

    return {
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalRevenue,
      totalExpenses,
      netIncome,
      currentMonthRevenue: currentMonthTotals.credits,
      currentMonthExpenses: currentMonthTotals.debits,
      revenueTrend,
      expenseTrend,
      totalVouchers: currentMonthVouchers.length + lastMonthVouchers.length,
      currentMonthVouchers: currentMonthVouchers.length,
    };
  }

  // Export methods
  async exportTrialBalanceExcel(
    companyId: number,
    fromDate?: string,
    toDate?: string,
    res?: Response,
  ) {
    const data = await this.getTrialBalance(companyId, fromDate, toDate);

    // Validar que haya datos
    if (!data || data.length === 0) {
      // Crear Excel con mensaje de no datos
      const ws = XLSX.utils.json_to_sheet([
        {
          Código: '',
          Cuenta: 'No hay datos para el período seleccionado',
          'Saldo Inicial': 0,
          'Débitos del Período': 0,
          'Créditos del Período': 0,
          'Saldo Final': 0,
        },
      ]);

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Balance de Comprobación');

      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      if (res) {
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader(
          'Content-Disposition',
          'attachment; filename=balance-comprobacion.xlsx',
        );
        return res.send(buffer);
      }

      return buffer;
    }

    const ws = XLSX.utils.json_to_sheet(
      data.map((item: any) => ({
        Código: item.accountCode,
        Cuenta: item.accountName,
        'Saldo Inicial': item.openingBalance || 0,
        'Débitos del Período': item.periodDebit || 0,
        'Créditos del Período': item.periodCredit || 0,
        'Saldo Final': item.closingBalance || 0,
      })),
    );

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Balance de Comprobación');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    if (res) {
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename=balance-comprobacion.xlsx',
      );
      return res.send(buffer);
    }

    return buffer;
  }

  async exportTrialBalancePDF(
    companyId: number,
    fromDate?: string,
    toDate?: string,
    res?: Response,
  ) {
    // Simple PDF implementation - for now return placeholder
    const html = `
      <html>
        <body>
          <h1>Balance de Comprobación</h1>
          <p>Período: ${fromDate || 'Inicio'} - ${toDate || 'Fin'}</p>
          <table border="1">
            <tr><th>Código</th><th>Cuenta</th><th>Débitos</th><th>Créditos</th><th>Saldo</th></tr>
            <!-- Data would be populated here -->
          </table>
        </body>
      </html>
    `;

    if (res) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename=balance-comprobacion.pdf',
      );
      res.send(Buffer.from('PDF placeholder for trial balance'));
    }

    return Buffer.from('PDF placeholder');
  }

  async exportBalanceSheetExcel(
    companyId: number,
    asOfDate?: string,
    res?: Response,
  ) {
    const data = await this.getBalanceSheet(companyId, asOfDate);

    const rows: any[] = [];
    rows.push({ Categoría: 'ACTIVOS', Código: '', Cuenta: '', Saldo: '' });
    data.assets.items.forEach((item: any) => {
      rows.push({
        Categoría: '',
        Código: item.accountCode,
        Cuenta: item.accountName,
        Saldo: Number(item.balance || 0),
      });
    });
    rows.push({
      Categoría: '',
      Código: '',
      Cuenta: 'Total Activos',
      Saldo: data.assets.total,
    });

    rows.push({ Categoría: 'PASIVOS', Código: '', Cuenta: '', Saldo: '' });
    data.liabilities.items.forEach((item: any) => {
      rows.push({
        Categoría: '',
        Código: item.accountCode,
        Cuenta: item.accountName,
        Saldo: Math.abs(Number(item.balance || 0)),
      });
    });
    rows.push({
      Categoría: '',
      Código: '',
      Cuenta: 'Total Pasivos',
      Saldo: data.liabilities.total,
    });

    rows.push({ Categoría: 'PATRIMONIO', Código: '', Cuenta: '', Saldo: '' });
    data.equity.items.forEach((item: any) => {
      rows.push({
        Categoría: '',
        Código: item.accountCode,
        Cuenta: item.accountName,
        Saldo: Math.abs(Number(item.balance || 0)),
      });
    });
    rows.push({
      Categoría: '',
      Código: '',
      Cuenta: 'Total Patrimonio',
      Saldo: data.equity.total,
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Estado de Situación');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    if (res) {
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename=estado-situacion.xlsx',
      );
      return res.send(buffer);
    }

    return buffer;
  }

  async exportBalanceSheetPDF(
    companyId: number,
    asOfDate?: string,
    res?: Response,
  ) {
    // PDF generation handled on frontend with jsPDF
    if (res) {
      res.status(501).json({ message: 'PDF se genera desde el frontend' });
    }
  }

  async exportIncomeStatementExcel(
    companyId: number,
    fromDate?: string,
    toDate?: string,
    res?: Response,
  ) {
    const data = await this.getIncomeStatement(companyId, fromDate, toDate);

    const rows: any[] = [];
    rows.push({ Tipo: 'INGRESOS', Código: '', Cuenta: '', Importe: '' });
    data.income.items.forEach((item: any) => {
      rows.push({
        Tipo: '',
        Código: item.accountCode,
        Cuenta: item.accountName,
        Importe: Math.abs(
          Number(item.totalCredit || 0) - Number(item.totalDebit || 0),
        ),
      });
    });
    rows.push({
      Tipo: '',
      Código: '',
      Cuenta: 'Total Ingresos',
      Importe: data.income.total,
    });

    rows.push({ Tipo: 'GASTOS', Código: '', Cuenta: '', Importe: '' });
    data.expenses.items.forEach((item: any) => {
      rows.push({
        Tipo: '',
        Código: item.accountCode,
        Cuenta: item.accountName,
        Importe: Math.abs(
          Number(item.totalDebit || 0) - Number(item.totalCredit || 0),
        ),
      });
    });
    rows.push({
      Tipo: '',
      Código: '',
      Cuenta: 'Total Gastos',
      Importe: data.expenses.total,
    });
    rows.push({
      Tipo: '',
      Código: '',
      Cuenta: 'RESULTADO NETO',
      Importe: data.netProfit,
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Estado de Rendimiento');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    if (res) {
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename=estado-rendimiento.xlsx',
      );
      return res.send(buffer);
    }

    return buffer;
  }

  async exportIncomeStatementPDF(
    companyId: number,
    fromDate?: string,
    toDate?: string,
    res?: Response,
  ) {
    // PDF generation handled on frontend with jsPDF
    if (res) {
      res.status(501).json({ message: 'PDF se genera desde el frontend' });
    }
  }

  // ── Modelo 5920-04 / 5921-04 (SIEN) ──

  private async getAccountRangeBalance(
    companyId: number,
    codeRanges: string[],
    asOfDate?: string,
  ): Promise<number> {
    const qb = this.voucherLineRepo
      .createQueryBuilder('vl')
      .select('SUM(vl.debit) - SUM(vl.credit)', 'balance')
      .innerJoin('vl.voucher', 'v')
      .where('v.companyId = :companyId', { companyId })
      .andWhere('v.status = :status', { status: 'posted' });

    if (asOfDate) qb.andWhere('v.date <= :asOfDate', { asOfDate });

    const conditions: string[] = [];
    const params: Record<string, any> = {};
    codeRanges.forEach((range, i) => {
      if (range.includes('-')) {
        const [from, to] = range.split('-').map((s) => s.trim());
        // Usar LPAD para comparación lexicográfica segura (soporta códigos no numéricos)
        conditions.push(
          `(LPAD(vl.account_code, 10, '0') >= LPAD(:from${i}, 10, '0') AND LPAD(vl.account_code, 10, '0') <= LPAD(:to${i}, 10, '0'))`,
        );
        params[`from${i}`] = from;
        params[`to${i}`] = to;
      } else {
        conditions.push(`vl.account_code = :code${i}`);
        params[`code${i}`] = range.trim();
      }
    });

    if (conditions.length > 0) {
      qb.andWhere(`(${conditions.join(' OR ')})`, params);
    }

    const result = await qb.getRawOne();
    return Number(result?.balance || 0);
  }

  private async getAccountRangeBalanceCredit(
    companyId: number,
    codeRanges: string[],
    asOfDate?: string,
  ): Promise<number> {
    const balance = await this.getAccountRangeBalance(
      companyId,
      codeRanges,
      asOfDate,
    );
    return Math.abs(balance);
  }

  private async getAccountRangePeriodAmount(
    companyId: number,
    codeRanges: string[],
    fromDate?: string,
    toDate?: string,
  ): Promise<{ debit: number; credit: number }> {
    const qb = this.voucherLineRepo
      .createQueryBuilder('vl')
      .select('COALESCE(SUM(vl.debit), 0)', 'totalDebit')
      .addSelect('COALESCE(SUM(vl.credit), 0)', 'totalCredit')
      .innerJoin('vl.voucher', 'v')
      .where('v.companyId = :companyId', { companyId })
      .andWhere('v.status = :status', { status: 'posted' });

    if (fromDate) qb.andWhere('v.date >= :fromDate', { fromDate });
    if (toDate) qb.andWhere('v.date <= :toDate', { toDate });

    const conditions: string[] = [];
    const params: Record<string, any> = {};
    codeRanges.forEach((range, i) => {
      if (range.includes('-')) {
        const [from, to] = range.split('-').map((s) => s.trim());
        conditions.push(
          `(LPAD(vl.account_code, 10, '0') >= LPAD(:from${i}, 10, '0') AND LPAD(vl.account_code, 10, '0') <= LPAD(:to${i}, 10, '0'))`,
        );
        params[`from${i}`] = from;
        params[`to${i}`] = to;
      } else {
        conditions.push(`vl.account_code = :code${i}`);
        params[`code${i}`] = range.trim();
      }
    });

    if (conditions.length > 0) {
      qb.andWhere(`(${conditions.join(' OR ')})`, params);
    }

    const result = await qb.getRawOne();
    return {
      debit: Number(result?.totalDebit || 0),
      credit: Number(result?.totalCredit || 0),
    };
  }

  private async getSubelementPeriodAmount(
    companyId: number,
    elementCode?: string,
    subelementCode?: string,
    fromDate?: string,
    toDate?: string,
  ): Promise<{ debit: number; credit: number }> {
    const qb = this.voucherLineRepo
      .createQueryBuilder('vl')
      .select('COALESCE(SUM(vl.debit), 0)', 'totalDebit')
      .addSelect('COALESCE(SUM(vl.credit), 0)', 'totalCredit')
      .innerJoin('vl.voucher', 'v')
      .where('v.companyId = :companyId', { companyId })
      .andWhere('v.status = :status', { status: 'posted' });

    if (fromDate) qb.andWhere('v.date >= :fromDate', { fromDate });
    if (toDate) qb.andWhere('v.date <= :toDate', { toDate });

    if (elementCode) {
      qb.andWhere('vl.element = :elementCode', { elementCode });
    }

    if (subelementCode) {
      qb.andWhere('vl.subelement = :subelementCode', { subelementCode });
    }

    const result = await qb.getRawOne();
    return {
      debit: Number(result?.totalDebit || 0),
      credit: Number(result?.totalCredit || 0),
    };
  }

  async exportModelo5920Excel(
    companyId: number,
    asOfDate?: string,
    res?: Response,
  ) {
    const templatePath = path.join(__dirname, 'templates', '5920.xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(templatePath);
    const ws = wb.worksheets[0];

    // Fetch balances for data cells (column K = 11)
    const efectivoCaja = await this.getAccountRangeBalance(
      companyId,
      ['101-108'],
      asOfDate,
    );
    const efectivoBanco = await this.getAccountRangeBalance(
      companyId,
      ['109-119'],
      asOfDate,
    );
    const cxcCorto = await this.getAccountRangeBalance(
      companyId,
      ['135-139', '154'],
      asOfDate,
    );
    const pagosAnticipadosSumin = await this.getAccountRangeBalance(
      companyId,
      ['146-149'],
      asOfDate,
    );
    const adeudosPresupuesto = await this.getAccountRangeBalance(
      companyId,
      ['164-166'],
      asOfDate,
    );
    const materiasPrimas = await this.getAccountRangeBalance(
      companyId,
      ['183'],
      asOfDate,
    );
    const utilesHerramientas = await this.getAccountRangeBalance(
      companyId,
      ['187'],
      asOfDate,
    );
    const alimentos = await this.getAccountRangeBalance(
      companyId,
      ['193'],
      asOfDate,
    );
    const aftTangibles = await this.getAccountRangeBalance(
      companyId,
      ['240-251'],
      asOfDate,
    );
    const depreciacionAft = await this.getAccountRangeBalanceCredit(
      companyId,
      ['375-388'],
      asOfDate,
    );
    const gastosDeficit = await this.getAccountRangeBalance(
      companyId,
      ['312'],
      asOfDate,
    );
    const cxcDiversas = await this.getAccountRangeBalance(
      companyId,
      ['334-341'],
      asOfDate,
    );

    const cxpCorto = await this.getAccountRangeBalanceCredit(
      companyId,
      ['405-415'],
      asOfDate,
    );
    const dividendosPagar = await this.getAccountRangeBalanceCredit(
      companyId,
      ['417'],
      asOfDate,
    );
    const obligPresupuesto = await this.getAccountRangeBalanceCredit(
      companyId,
      ['440-449'],
      asOfDate,
    );
    const nominasPagar = await this.getAccountRangeBalanceCredit(
      companyId,
      ['455-459'],
      asOfDate,
    );
    const gastosAcumulados = await this.getAccountRangeBalanceCredit(
      companyId,
      ['480-489'],
      asOfDate,
    );
    const provVacaciones = await this.getAccountRangeBalanceCredit(
      companyId,
      ['492'],
      asOfDate,
    );
    const provSubsidiosSS = await this.getAccountRangeBalanceCredit(
      companyId,
      ['500'],
      asOfDate,
    );
    const cxpDiversas = await this.getAccountRangeBalanceCredit(
      companyId,
      ['565-569'],
      asOfDate,
    );

    const inversionEstatal = await this.getAccountRangeBalanceCredit(
      companyId,
      ['600-612'],
      asOfDate,
    );
    const reservasContingencias = await this.getAccountRangeBalanceCredit(
      companyId,
      ['645'],
      asOfDate,
    );
    const otrasReservas = await this.getAccountRangeBalanceCredit(
      companyId,
      ['646-654'],
      asOfDate,
    );
    const pagoCuentaUtilidades = await this.getAccountRangeBalance(
      companyId,
      ['690'],
      asOfDate,
    );
    const pagoCuentaDividendos = await this.getAccountRangeBalance(
      companyId,
      ['691'],
      asOfDate,
    );
    const resultadoPeriodo = await this.getAccountRangeBalanceCredit(
      companyId,
      ['800-899'],
      asOfDate,
    );

    // Fill ONLY data cells in column K (col 11) — formulas are preserved from template
    // ACTIVO
    ws.getCell('K11').value = efectivoCaja; // Efectivo en Caja (101-108)
    ws.getCell('K12').value = efectivoBanco; // Efectivo en Banco (109-119)
    ws.getCell('K13').value = cxcCorto; // CxC Corto Plazo (135-139, 154)
    ws.getCell('K14').value = pagosAnticipadosSumin; // Pagos Anticipados (146-149)
    ws.getCell('K15').value = adeudosPresupuesto; // Adeudos Presupuesto (164-166)
    ws.getCell('K17').value = materiasPrimas; // Materias Primas (183)
    ws.getCell('K18').value = utilesHerramientas; // Útiles, Herramientas (187)
    ws.getCell('K19').value = alimentos; // Alimentos (193)
    ws.getCell('K21').value = aftTangibles; // AFT (240-251)
    ws.getCell('K22').value = depreciacionAft; // Depreciación AFT (375-388)
    ws.getCell('K23').value = gastosDeficit; // Activos Diferidos
    ws.getCell('K24').value = gastosDeficit; // Gastos Faltantes (312)
    ws.getCell('K25').value = cxcDiversas; // Otros Activos
    ws.getCell('K26').value = cxcDiversas; // CxC Diversas (334-341)
    // PASIVO
    ws.getCell('K30').value = cxpCorto; // CxP Corto Plazo (405-415)
    ws.getCell('K31').value = dividendosPagar; // Dividendos por Pagar (417)
    ws.getCell('K32').value = obligPresupuesto; // Obligaciones Presupuesto (440-449)
    ws.getCell('K33').value = nominasPagar; // Nóminas por Pagar (455-459)
    ws.getCell('K34').value = gastosAcumulados; // Gastos Acumulados (480-489)
    ws.getCell('K35').value = provVacaciones; // Provisión Vacaciones (492)
    ws.getCell('K36').value = provSubsidiosSS; // Provisión Subsidios SS (500)
    ws.getCell('K39').value = cxpDiversas; // CxP Diversas (565-569)
    // PATRIMONIO
    ws.getCell('K42').value = inversionEstatal; // Inversión Estatal (600-612)
    ws.getCell('K43').value = reservasContingencias; // Reservas Contingencias (645)
    ws.getCell('K44').value = otrasReservas; // Otras Reservas (646-654)
    ws.getCell('K45').value = pagoCuentaUtilidades; // Pago a Cuenta Utilidades (690)
    ws.getCell('K46').value = pagoCuentaDividendos; // Pago a Cuenta Dividendos (691)
    ws.getCell('K47').value = resultadoPeriodo; // Resultado del Período

    const buffer = await wb.xlsx.writeBuffer();

    if (res) {
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename=Modelo_5920-04.xlsx',
      );
      res.send(Buffer.from(buffer as ArrayBuffer));
    }

    return Buffer.from(buffer as ArrayBuffer);
  }

  async exportModelo5921Excel(
    companyId: number,
    fromDate?: string,
    toDate?: string,
    res?: Response,
  ) {
    const templatePath = path.join(__dirname, 'templates', '5921.xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(templatePath);
    const ws = wb.worksheets[0];

    // Fetch amounts for data cells (column K = 11) — formulas preserved from template
    const ventas = await this.getAccountRangePeriodAmount(
      companyId,
      ['900-913'],
      fromDate,
      toDate,
    );
    const ventasVal = Math.abs(ventas.credit - ventas.debit);

    const impVentas = await this.getAccountRangePeriodAmount(
      companyId,
      ['805-809'],
      fromDate,
      toDate,
    );
    const impVentasVal = Math.abs(impVentas.debit - impVentas.credit);

    const costoVentas = await this.getAccountRangePeriodAmount(
      companyId,
      ['810-813'],
      fromDate,
      toDate,
    );
    const costoVentasVal = Math.abs(costoVentas.debit - costoVentas.credit);

    const gastosAdmin = await this.getAccountRangePeriodAmount(
      companyId,
      ['822-824'],
      fromDate,
      toDate,
    );
    const gastosAdminVal = Math.abs(gastosAdmin.debit - gastosAdmin.credit);

    const gastosOper = await this.getAccountRangePeriodAmount(
      companyId,
      ['826-833'],
      fromDate,
      toDate,
    );
    const gastosOperVal = Math.abs(gastosOper.debit - gastosOper.credit);

    const gastosFinancieros = await this.getAccountRangePeriodAmount(
      companyId,
      ['835-838'],
      fromDate,
      toDate,
    );
    const gastosFinancierosVal = Math.abs(
      gastosFinancieros.debit - gastosFinancieros.credit,
    );

    const gastosPerdidas = await this.getAccountRangePeriodAmount(
      companyId,
      ['845-848'],
      fromDate,
      toDate,
    );
    const gastosPerdidasVal = Math.abs(
      gastosPerdidas.debit - gastosPerdidas.credit,
    );

    const gastosPerdidasDesastres = await this.getAccountRangePeriodAmount(
      companyId,
      ['849'],
      fromDate,
      toDate,
    );
    const gastosPerdidasDesastresVal = Math.abs(
      gastosPerdidasDesastres.debit - gastosPerdidasDesastres.credit,
    );

    const otrosImpuestos = await this.getAccountRangePeriodAmount(
      companyId,
      ['855-864'],
      fromDate,
      toDate,
    );
    const otrosImpuestosVal = Math.abs(
      otrosImpuestos.debit - otrosImpuestos.credit,
    );

    const otrosGastos = await this.getAccountRangePeriodAmount(
      companyId,
      ['865-866'],
      fromDate,
      toDate,
    );
    const otrosGastosVal = Math.abs(otrosGastos.debit - otrosGastos.credit);

    const gastosRecupDesastres = await this.getAccountRangePeriodAmount(
      companyId,
      ['873'],
      fromDate,
      toDate,
    );
    const gastosRecupDesastresVal = Math.abs(
      gastosRecupDesastres.debit - gastosRecupDesastres.credit,
    );

    const ingresosFinancieros = await this.getAccountRangePeriodAmount(
      companyId,
      ['920-922'],
      fromDate,
      toDate,
    );
    const ingresosFinancierosVal = Math.abs(
      ingresosFinancieros.credit - ingresosFinancieros.debit,
    );

    const otrosIngresos = await this.getAccountRangePeriodAmount(
      companyId,
      ['950-952'],
      fromDate,
      toDate,
    );
    const otrosIngresosVal = Math.abs(
      otrosIngresos.credit - otrosIngresos.debit,
    );

    // Fill ONLY data cells in column K — formula cells are preserved from template
    ws.getCell('K9').value = ventasVal; // Ventas (900-913)
    ws.getCell('K10').value = impVentasVal; // Impuesto Ventas (805-809)
    ws.getCell('K12').value = costoVentasVal; // Costo de Ventas (810-813)
    ws.getCell('K15').value = gastosAdminVal; // Gastos Admin (822-824)
    ws.getCell('K16').value = gastosOperVal; // Gastos Operación (826-833)
    ws.getCell('K18').value = gastosFinancierosVal; // Gastos Financieros (835-838)
    ws.getCell('K19').value = gastosPerdidasVal; // Gastos Pérdidas (845-848)
    ws.getCell('K20').value = gastosPerdidasDesastresVal; // Pérdidas Desastres (849)
    ws.getCell('K21').value = otrosImpuestosVal; // Otros Impuestos (855-864)
    ws.getCell('K22').value = otrosGastosVal; // Otros Gastos (865-866)
    ws.getCell('K23').value = gastosRecupDesastresVal; // Gastos Recup. Desastres (873)
    ws.getCell('K24').value = ingresosFinancierosVal; // Ingresos Financieros (920-922)
    ws.getCell('K25').value = otrosIngresosVal; // Otros Ingresos (950-952)

    const buffer = await wb.xlsx.writeBuffer();

    if (res) {
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename=Modelo_5921-04.xlsx',
      );
      res.send(Buffer.from(buffer as ArrayBuffer));
    }

    return Buffer.from(buffer as ArrayBuffer);
  }

  async exportModelo5924Excel(
    companyId: number,
    fromDate?: string,
    toDate?: string,
    res?: Response,
  ) {
    const templatePath = path.join(__dirname, 'templates', '5924.xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(templatePath);
    const ws = wb.worksheets[0];

    // Obtener todos los elementos únicos de los vouchers en el período
    const elementosQuery = this.voucherLineRepo
      .createQueryBuilder('vl')
      .select('vl.element', 'elementCode')
      .addSelect('vl.elementName', 'elementName')
      .innerJoin('vl.voucher', 'v')
      .where('v.companyId = :companyId', { companyId })
      .andWhere('v.status = :status', { status: 'posted' })
      .andWhere('vl.element IS NOT NULL')
      .groupBy('vl.element, vl.elementName');

    if (fromDate) elementosQuery.andWhere('v.date >= :fromDate', { fromDate });
    if (toDate) elementosQuery.andWhere('v.date <= :toDate', { toDate });

    const elementos = await elementosQuery.getRawMany();

    // Obtener datos para cada elemento
    let currentRow = 10; // Suponiendo que los datos empiezan en fila 10

    for (const elemento of elementos) {
      // Obtener total del elemento
      const totalElemento = await this.getSubelementPeriodAmount(
        companyId,
        elemento.elementCode,
        undefined,
        fromDate,
        toDate,
      );
      const totalElementoVal = Math.abs(
        totalElemento.debit - totalElemento.credit,
      );

      // Escribir datos del elemento
      ws.getCell(`A${currentRow}`).value = elemento.elementCode;
      ws.getCell(`B${currentRow}`).value = elemento.elementName;
      ws.getCell(`C${currentRow}`).value = totalElementoVal;

      currentRow++;

      // Obtener subelementos de este elemento
      const subelementosQuery = this.voucherLineRepo
        .createQueryBuilder('vl')
        .select('vl.subelement', 'subelementCode')
        .addSelect('vl.subelementName', 'subelementName')
        .innerJoin('vl.voucher', 'v')
        .where('v.companyId = :companyId', { companyId })
        .andWhere('v.status = :status', { status: 'posted' })
        .andWhere('vl.element = :elementCode', {
          elementCode: elemento.elementCode,
        })
        .andWhere('vl.subelement IS NOT NULL')
        .groupBy('vl.subelement, vl.subelementName');

      if (fromDate)
        subelementosQuery.andWhere('v.date >= :fromDate', { fromDate });
      if (toDate) subelementosQuery.andWhere('v.date <= :toDate', { toDate });

      const subelementos = await subelementosQuery.getRawMany();

      // Escribir datos de cada subelemento
      for (const subelemento of subelementos) {
        const totalSubelemento = await this.getSubelementPeriodAmount(
          companyId,
          elemento.elementCode,
          subelemento.subelementCode,
          fromDate,
          toDate,
        );
        const totalSubelementoVal = Math.abs(
          totalSubelemento.debit - totalSubelemento.credit,
        );

        ws.getCell(`B${currentRow}`).value = subelemento.subelementCode;
        ws.getCell(`C${currentRow}`).value = subelemento.subelementName;
        ws.getCell(`D${currentRow}`).value = totalSubelementoVal;

        currentRow++;
      }
    }

    const buffer = await wb.xlsx.writeBuffer();

    if (res) {
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename=Modelo_5924.xlsx',
      );
      res.send(Buffer.from(buffer as ArrayBuffer));
    }

    return Buffer.from(buffer as ArrayBuffer);
  }

  // Accounts (Chart of Accounts) ──

  async findAllAccounts(
    companyId: number,
    filters?: {
      type?: string;
      search?: string;
      nature?: string;
      level?: string;
      groupNumber?: string;
      activeOnly?: string;
      allowsMovements?: string;
    },
  ) {
    const qb = this.accountRepo.createQueryBuilder('acc');

    qb.where('acc.companyId = :companyId', { companyId });

    if (filters?.type) qb.andWhere('acc.type = :type', { type: filters.type });
    if (filters?.search)
      qb.andWhere('(acc.code ILIKE :search OR acc.name ILIKE :search)', {
        search: `%${filters.search}%`,
      });
    if (filters?.nature)
      qb.andWhere('acc.nature = :nature', { nature: filters.nature });
    if (filters?.level)
      qb.andWhere('acc.level = :level', { level: parseInt(filters.level) });
    if (filters?.groupNumber)
      qb.andWhere('acc.groupNumber = :groupNumber', {
        groupNumber: filters.groupNumber,
      });
    if (filters?.activeOnly === 'true') qb.andWhere('acc.isActive = true');
    if (filters?.allowsMovements === 'true')
      qb.andWhere('acc.allowsMovements = true');

    qb.orderBy('acc.code', 'ASC');
    return qb.getMany();
  }

  async findAccountsByParentCode(companyId: number, parentCode: string) {
    // Primero buscar cuentas hijas (legacy)
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

    // Buscar subcuentas (ahora cuentas con level=4 y parentCode)
    try {
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

      // Convertir al formato que espera el frontend
      const formattedSubaccounts = subaccounts.map((sa) => ({
        id: sa.id,
        code: sa.code,
        name: sa.name,
        description: sa.description,
        type: sa.type,
        nature: sa.nature,
        level: sa.level,
        parentCode: sa.parentCode,
        parentAccountId: sa.parentAccountId,
        balance: sa.balance,
        isActive: sa.isActive,
        allowsMovements: sa.allowsMovements,
        createdAt: sa.createdAt,
        updatedAt: sa.updatedAt,
      }));

      // Combinar resultados
      return [...childAccounts, ...formattedSubaccounts];
    } catch (error) {
      // Si hay error, devolver solo cuentas hijas
      return childAccounts;
    }
  }

  async getSubaccountsByAccount(companyId: number, accountId: string) {
    try {
      // Buscar la cuenta padre para obtener su código
      const parentAccount = await this.accountRepo.findOneBy({
        id: accountId,
        companyId,
      });

      if (!parentAccount) {
        return [];
      }

      // Buscar subcuentas (cuentas con level=4 y parentCode igual al código de la cuenta padre)
      return this.accountRepo.find({
        where: {
          companyId,
          level: 4,
          parentCode: parentAccount.code,
          isActive: true,
        },
        order: {
          code: 'ASC',
        },
      });
    } catch (error) {
      return [];
    }
  }

  async getAccountStatistics(companyId: number) {
    const accounts = await this.accountRepo.find({ where: { companyId } });
    const active = accounts.filter((a) => a.isActive);
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
    const existing = await this.accountRepo.findOneBy({
      code: data.code,
      companyId,
    });
    if (existing) {
      throw new BadRequestException(
        `Ya existe una cuenta con el código ${data.code}`,
      );
    }

    const account = this.accountRepo.create({ ...data, companyId });
    return this.accountRepo.save(account);
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

  async updateAccount(companyId: number, id: string, data: Partial<Account>) {
    const account = await this.accountRepo.findOneBy({ id, companyId });
    if (!account) throw new NotFoundException(`Cuenta #${id} no encontrada`);
    Object.assign(account, data);
    return this.accountRepo.save(account);
  }

  async deleteAccount(companyId: number, id: string) {
    const account = await this.accountRepo.findOneBy({ id, companyId });
    if (!account) throw new NotFoundException(`Cuenta #${id} no encontrada`);

    const children = await this.accountRepo.findOneBy({
      parentCode: account.code,
      companyId,
    });
    if (children) {
      throw new BadRequestException(
        'No se puede eliminar: la cuenta tiene subcuentas asociadas',
      );
    }

    await this.accountRepo.remove(account);
    return { message: 'Cuenta eliminada correctamente' };
  }

  // ================================
  // JOURNAL ENTRIES (Partidas Independientes)
  // ================================

  async findAllJournalEntries(
    companyId: number,
    filters?: {
      status?: string;
      type?: string;
      fromDate?: string;
      toDate?: string;
      accountCode?: string;
      search?: string;
    },
  ) {
    // JournalEntry functionality removed
    return [];
  }

  // ══════════════════════════════════════════════════════════
  // ── ELEMENTOS (Elementos de Gastos) ──
  // ══════════════════════════════════════════════════════════

  async findAllElementos(
    companyId: number,
    filters?: {
      status?: string;
      fromDate?: string;
      toDate?: string;
      accountCode?: string;
      search?: string;
    },
  ) {
    const qb = this.elementoRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.account', 'account')
      .leftJoinAndSelect('e.costCenter', 'costCenter')
      .where('e.companyId = :companyId', { companyId });

    if (filters?.status)
      qb.andWhere('e.status = :status', { status: filters.status });
    if (filters?.fromDate)
      qb.andWhere('e.date >= :fromDate', { fromDate: filters.fromDate });
    if (filters?.toDate)
      qb.andWhere('e.date <= :toDate', { toDate: filters.toDate });
    if (filters?.accountCode)
      qb.andWhere('e.accountCode = :accountCode', {
        accountCode: filters.accountCode,
      });
    if (filters?.search)
      qb.andWhere(
        '(e.description ILIKE :search OR e.entryNumber ILIKE :search OR e.accountName ILIKE :search OR e.element ILIKE :search)',
        { search: `%${filters.search}%` },
      );

    qb.orderBy('e.date', 'DESC').addOrderBy('e.entryNumber', 'DESC');
    return qb.getMany();
  }

  async findOneElemento(companyId: number, id: string) {
    const elemento = await this.elementoRepo.findOne({
      where: { id, companyId },
      relations: ['account', 'costCenter'],
    });
    if (!elemento) throw new NotFoundException(`Elemento #${id} no encontrado`);
    return elemento;
  }

  async createElemento(
    companyId: number,
    data: {
      date?: string;
      description?: string;
      accountCode: string;
      subaccountCode?: string;
      entryNumber?: string;
      element: string;
      elementDescription?: string;
      debit?: number;
      credit?: number;
      lineDescription?: string;
      costCenterId?: string;
      reference?: string;
      type?: string;
      createdBy?: string;
    },
  ) {
    // Validar que exista la cuenta y que sea de gasto
    const account = await this.accountRepo.findOneBy({
      code: data.accountCode,
      companyId,
    });
    if (!account) {
      throw new NotFoundException(`Cuenta ${data.accountCode} no encontrada`);
    }
    if (account.type !== 'expense') {
      throw new BadRequestException(
        `La cuenta ${data.accountCode} no es una cuenta de gasto`,
      );
    }

    // Buscar subcuenta si se proporcionó
    let subaccountName: string | null = null;
    if (data.subaccountCode) {
      const subaccount = await this.accountRepo.findOneBy({
        code: data.subaccountCode,
        companyId,
      });
      subaccountName = subaccount?.name || null;
    }

    // Usar entryNumber personalizado o generar uno automático
    let entryNumber = data.entryNumber;
    if (!entryNumber) {
      const today = new Date().toISOString().split('T')[0];
      const count = await this.elementoRepo.count({
        where: {
          companyId,
          date: today,
        },
      });
      entryNumber = `EL-${today.replace(/-/g, '')}-${String(count + 1).padStart(4, '0')}`;
    }

    const elemento = new Elemento();
    elemento.companyId = companyId;
    elemento.entryNumber = entryNumber;
    elemento.date = data.date || new Date().toISOString().split('T')[0];
    elemento.description = data.description || entryNumber;
    elemento.accountId = account.id;
    elemento.accountCode = account.code;
    elemento.accountName = account.name;
    elemento.subaccountCode = data.subaccountCode || null;
    elemento.subaccountName = subaccountName;
    elemento.element = data.element;
    elemento.elementDescription = data.elementDescription || null;
    elemento.debit = data.debit || 0;
    elemento.credit = data.credit || 0;
    elemento.lineDescription = data.lineDescription || null;
    elemento.costCenterId = data.costCenterId || null;
    elemento.reference = data.reference || null;
    elemento.type = data.type || 'manual';
    elemento.createdBy = data.createdBy || null;

    return this.elementoRepo.save(elemento);
  }

  async updateElemento(
    companyId: number,
    id: string,
    data: {
      date?: string;
      description?: string;
      accountCode?: string;
      subaccountCode?: string;
      entryNumber?: string;
      element?: string;
      elementDescription?: string;
      debit?: number;
      credit?: number;
      lineDescription?: string;
      costCenterId?: string;
      reference?: string;
    },
  ) {
    const elemento = await this.findOneElemento(companyId, id);

    // No permitir editar si ya está contabilizado
    if (elemento.status === 'posted') {
      throw new BadRequestException(
        'No se puede editar un elemento contabilizado',
      );
    }

    if (data.accountCode) {
      const account = await this.accountRepo.findOneBy({
        code: data.accountCode,
        companyId,
      });
      if (account) {
        if (account.type !== 'expense') {
          throw new BadRequestException(
            `La cuenta ${data.accountCode} no es una cuenta de gasto`,
          );
        }
        elemento.accountId = account.id;
        elemento.accountCode = account.code;
        elemento.accountName = account.name;
      }
    }

    if (data.subaccountCode !== undefined) {
      elemento.subaccountCode = data.subaccountCode || null;
      if (data.subaccountCode) {
        const subaccount = await this.accountRepo.findOneBy({
          code: data.subaccountCode,
          companyId,
        });
        elemento.subaccountName = subaccount?.name || null;
      } else {
        elemento.subaccountName = null;
      }
    }

    if (data.entryNumber) elemento.entryNumber = data.entryNumber;
    if (data.date) elemento.date = data.date;
    if (data.description) elemento.description = data.description;
    if (data.element !== undefined) elemento.element = data.element;
    if (data.elementDescription !== undefined)
      elemento.elementDescription = data.elementDescription;
    if (data.debit !== undefined) elemento.debit = data.debit;
    if (data.credit !== undefined) elemento.credit = data.credit;
    if (data.lineDescription !== undefined)
      elemento.lineDescription = data.lineDescription;
    if (data.costCenterId !== undefined)
      elemento.costCenterId = data.costCenterId;
    if (data.reference !== undefined) elemento.reference = data.reference;

    return this.elementoRepo.save(elemento);
  }

  async deleteElemento(companyId: number, id: string) {
    const elemento = await this.findOneElemento(companyId, id);

    // No permitir eliminar si ya está contabilizado
    if (elemento.status === 'posted') {
      throw new BadRequestException(
        'No se puede eliminar un elemento contabilizado',
      );
    }

    await this.elementoRepo.remove(elemento);
    return { message: 'Elemento eliminado correctamente' };
  }

  async updateElementoStatus(
    companyId: number,
    id: string,
    status: 'posted' | 'cancelled',
  ) {
    const elemento = await this.findOneElemento(companyId, id);
    elemento.status = status;
    return this.elementoRepo.save(elemento);
  }

  async getElementoStatistics(companyId: number) {
    const stats = await this.elementoRepo
      .createQueryBuilder('e')
      .select('COUNT(*)', 'total')
      .addSelect(
        'SUM(CASE WHEN e.status = :posted THEN 1 ELSE 0 END)',
        'posted',
      )
      .addSelect('SUM(CASE WHEN e.status = :draft THEN 1 ELSE 0 END)', 'draft')
      .addSelect(
        'SUM(CASE WHEN e.status = :cancelled THEN 1 ELSE 0 END)',
        'cancelled',
      )
      .addSelect('SUM(e.debit)', 'totalDebit')
      .addSelect('SUM(e.credit)', 'totalCredit')
      .where('e.companyId = :companyId', { companyId })
      .setParameter('posted', 'posted')
      .setParameter('draft', 'draft')
      .setParameter('cancelled', 'cancelled')
      .getRawOne();

    return {
      total: parseInt(stats.total) || 0,
      posted: parseInt(stats.posted) || 0,
      draft: parseInt(stats.draft) || 0,
      cancelled: parseInt(stats.cancelled) || 0,
      totalDebit: parseFloat(stats.totalDebit) || 0,
      totalCredit: parseFloat(stats.totalCredit) || 0,
    };
  }

  // ================================
  // EXPENSE TYPES (Tipos de Partidas)
  // ================================

  async findAllExpenseTypes(companyId: number) {
    return this.expenseTypeRepo.find({
      where: { companyId, isActive: true },
      order: { code: 'ASC' },
    });
  }

  async createExpenseType(
    companyId: number,
    data: { code: string; name: string; description?: string },
  ) {
    const existing = await this.expenseTypeRepo.findOneBy({
      code: data.code,
      companyId,
    });

    if (existing) {
      throw new BadRequestException(
        `Tipo de partida con código ${data.code} ya existe`,
      );
    }

    const expenseType = new ExpenseType();
    expenseType.companyId = companyId;
    expenseType.code = data.code;
    expenseType.name = data.name;
    expenseType.description = data.description || null;

    return this.expenseTypeRepo.save(expenseType);
  }

  // ══════════════════════════════════════════════════════════
  // ── PERIOD VALIDATION HELPERS ──
  // ══════════════════════════════════════════════════════════

  /**
   * Valida que una fecha pertenezca a un período contable abierto para la empresa
   * @param companyId ID de la empresa
   * @param date Fecha a validar (formato YYYY-MM-DD)
   * @throws BadRequestException si el período está cerrado o no existe
   */
  private async validateOpenPeriod(
    companyId: number,
    date: string,
  ): Promise<void> {
    const period = await this.findPeriodByDate(companyId, date);

    if (!period) {
      throw new BadRequestException(
        `No existe un período contable para la fecha ${date}. Debe crear un año fiscal con períodos para esta empresa.`,
      );
    }

    if (period.status !== 'open') {
      throw new BadRequestException(
        'No se puede registrar comprobantes en un período cerrado',
      );
    }
  }

  /**
   * Busca un período contable por fecha y empresa
   * @param companyId ID de la empresa
   * @param date Fecha a buscar (formato YYYY-MM-DD)
   * @returns Período encontrado o null
   */
  private async findPeriodByDate(
    companyId: number,
    date: string,
  ): Promise<AccountingPeriod | null> {
    // Extraer año y mes de la fecha para buscar en el rango del período
    const dateObj = new Date(date);
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth() + 1; // JavaScript months are 0-indexed

    return this.periodRepo.findOne({
      where: {
        companyId,
        year,
        month,
      },
    });
  }

  async seedExpenseTypes(companyId: number) {
    const defaultTypes = [
      {
        code: '11',
        name: 'Materia prima y Materiales',
        description: 'Materia prima y materiales utilizados en producción',
      },
      {
        code: '30',
        name: 'Combustibles y lubricantes',
        description: 'Combustibles y lubricantes para operaciones',
      },
      {
        code: '40',
        name: 'Energia',
        description: 'Consumo de energía eléctrica y otros',
      },
      {
        code: '50',
        name: 'Gastos de personal',
        description: 'Salarios y beneficios del personal',
      },
      {
        code: '70',
        name: 'Depreciacion y Amortizacion',
        description: 'Depreciación de activos fijos',
      },
      {
        code: '80',
        name: 'Otros gastos monetarios',
        description: 'Otros gastos monetarios diversos',
      },
      {
        code: '81',
        name: 'Gastos por importacion de servicios',
        description: 'Servicios importados',
      },
      {
        code: '82',
        name: 'Del presupuesto de de la seguridad social',
        description: 'Aportes y contribuciones a la seguridad social',
      },
      {
        code: '83',
        name: 'De la asistencia social',
        description: 'Gastos de asistencia social',
      },
      {
        code: '84',
        name: 'Transferencias , subsidios y subvenciones',
        description: 'Transferencias y subsidios otorgados',
      },
      {
        code: '90',
        name: 'Otras transferencias corrientes',
        description: 'Otras transferencias corrientes',
      },
    ];

    for (const typeData of defaultTypes) {
      const existing = await this.expenseTypeRepo.findOneBy({
        code: typeData.code,
        companyId,
      });

      if (!existing) {
        await this.createExpenseType(companyId, typeData);
      }
    }

    return { message: 'Tipos de partida predefinidos creados exitosamente' };
  }
}
