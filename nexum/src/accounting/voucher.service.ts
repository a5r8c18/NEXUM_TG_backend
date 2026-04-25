/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Voucher, SourceModule } from '../entities/voucher.entity';
import { VoucherLine } from '../entities/voucher-line.entity';
import { Account } from '../entities/account.entity';
import { Subelement } from '../entities/subelement.entity';
import { AccountingPeriod } from '../entities/accounting-period.entity';
import { EntityManager } from 'typeorm';

// Audit logging interface
interface AuditLog {
  userId?: string;
  action: string;
  entityType: 'voucher';
  entityId: string;
  timestamp: Date;
  beforeData?: any;
  afterData?: any;
  metadata?: {
    companyId: number;
    voucherNumber?: string;
    description?: string;
    amount?: number;
    userAgent?: string;
    ip?: string;
  };
}

@Injectable()
export class VoucherService {
  constructor(
    @InjectRepository(Voucher)
    private readonly voucherRepo: Repository<Voucher>,
    @InjectRepository(VoucherLine)
    private readonly voucherLineRepo: Repository<VoucherLine>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    @InjectRepository(Subelement)
    private readonly subelementRepo: Repository<Subelement>,
    @InjectRepository(AccountingPeriod)
    private readonly periodRepo: Repository<AccountingPeriod>,
    private readonly entityManager: EntityManager,
  ) {}

  // ══════════════════════════════════════════════════════════
  // ── AUDIT LOGGING ──
  // ══════════════════════════════════════════════════════════

  private logAudit(auditLog: AuditLog) {
    // For now, log to console with structured format
    // In production, this should be saved to audit_log table
    console.log('AUDIT_LOG:', {
      ...auditLog,
      timestamp: auditLog.timestamp.toISOString(),
      environment: process.env.NODE_ENV || 'development',
    });

    // TODO: Implement database logging when audit_log table is created
    // Example implementation:
    // await this.auditLogRepo.save({
    //   ...auditLog,
    //   userAgent: auditLog.metadata?.userAgent,
    //   ip: auditLog.metadata?.ip
    // });
  }

  // ══════════════════════════════════════════════════════════
  // ── VOUCHERS CRUD ──
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
    if (!voucher) throw new NotFoundException(`Voucher #${id} no encontrado`);
    return voucher;
  }

  async findVouchersBySourceDocumentId(
    companyId: number,
    sourceDocumentId: string,
  ) {
    return this.voucherRepo.find({
      where: { companyId, sourceDocumentId },
      order: { createdAt: 'ASC' },
    });
  }

  async createVoucher(companyId: number, data: any) {
    return await this.entityManager.transaction(async (manager) => {
      // Validar período contable abierto
      await this.validateOpenPeriod(companyId, data.date);

      // Validar que tenga al menos 2 líneas
      if (!data.lines || data.lines.length < 2) {
        throw new BadRequestException(
          'Un comprobante debe tener al menos 2 partidas (líneas)',
        );
      }

      // Validar partida doble
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

      // Validar que cada línea tenga solo debit o credit
      for (const line of data.lines) {
        if (Number(line.debit) > 0 && Number(line.credit) > 0) {
          throw new BadRequestException(
            `La partida de cuenta ${line.accountCode} no puede tener débito y crédito simultáneamente`,
          );
        }
      }

      // Resolver líneas
      const resolvedLines = await this.resolveVoucherLines(
        manager,
        companyId,
        data.lines,
      );

      // Generar número de comprobante
      const count = await manager
        .getRepository(Voucher)
        .count({ where: { companyId } });
      const voucherNumber = `COP-${String(count + 1).padStart(5, '0')}`;

      // Crear voucher
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
        lines: resolvedLines.map((line, index) =>
          manager.getRepository(VoucherLine).create({
            accountId: line.accountId,
            accountCode: line.accountCode,
            accountName: line.accountName,
            subaccountCode: line.subaccountCode || null,
            subaccountName: line.subaccountName,
            element: line.element || null,
            elementName: line.elementName,
            subelement: line.subelement || null,
            subelementName: line.subelementName,
            debit: line.debit,
            credit: line.credit,
            description: line.description,
            costCenterId: line.costCenterId,
            reference: line.reference,
            lineOrder: index + 1,
          }),
        ),
      });

      const saved = await manager.getRepository(Voucher).save(voucher);

      // Log audit for voucher creation
      this.logAudit({
        userId: data.createdBy,
        action: 'CREATE',
        entityType: 'voucher',
        entityId: saved.id,
        timestamp: new Date(),
        afterData: {
          voucherNumber: saved.voucherNumber,
          description: saved.description,
          status: saved.status,
          totalAmount: saved.totalAmount,
          linesCount: saved.lines?.length || 0,
        },
        metadata: {
          companyId,
          voucherNumber: saved.voucherNumber,
          description: saved.description,
          amount: saved.totalAmount,
        },
      });

      // Publicar automáticamente si es de apertura
      if (data.type === 'apertura') {
        await this.postVoucherInTransaction(manager, companyId, saved.id);
      }

      return saved;
    });
  }

  async updateVoucherStatus(companyId: number, id: string, status: string) {
    return await this.entityManager.transaction(async (manager) => {
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

      // Validar período para posting
      if (status === 'posted') {
        await this.validateOpenPeriod(companyId, voucher.date);
      }

      if (status === 'posted') {
        const result = await this.postVoucherInTransaction(
          manager,
          companyId,
          id,
        );

        // Log audit for voucher posting
        this.logAudit({
          userId: voucher.createdBy || undefined,
          action: 'POST',
          entityType: 'voucher',
          entityId: voucher.id,
          timestamp: new Date(),
          beforeData: { status: voucher.status },
          afterData: { status: 'posted' },
          metadata: {
            companyId,
            voucherNumber: voucher.voucherNumber,
            description: voucher.description,
            amount: voucher.totalAmount,
          },
        });

        return result;
      }

      if (status === 'cancelled' && voucher.status === 'posted') {
        await this.reverseVoucherBalancesInTransaction(manager, voucher);

        // Log audit for voucher cancellation
        this.logAudit({
          userId: voucher.createdBy || undefined,
          action: 'CANCEL',
          entityType: 'voucher',
          entityId: voucher.id,
          timestamp: new Date(),
          beforeData: { status: voucher.status },
          afterData: { status: 'cancelled' },
          metadata: {
            companyId,
            voucherNumber: voucher.voucherNumber,
            description: voucher.description,
            amount: voucher.totalAmount,
          },
        });
      }

      voucher.status = status as any;
      const result = await manager.getRepository(Voucher).save(voucher);

      // Log audit for status change
      this.logAudit({
        userId: voucher.createdBy || undefined,
        action: 'STATUS_CHANGE',
        entityType: 'voucher',
        entityId: voucher.id,
        timestamp: new Date(),
        beforeData: { status: voucher.status },
        afterData: { status: status },
        metadata: {
          companyId,
          voucherNumber: voucher.voucherNumber,
          description: voucher.description,
          amount: voucher.totalAmount,
        },
      });

      return result;
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

      // Log audit before deletion
      this.logAudit({
        userId: voucher.createdBy || undefined,
        action: 'DELETE',
        entityType: 'voucher',
        entityId: voucher.id,
        timestamp: new Date(),
        beforeData: {
          voucherNumber: voucher.voucherNumber,
          description: voucher.description,
          status: voucher.status,
          totalAmount: voucher.totalAmount,
          linesCount: voucher.lines?.length || 0,
        },
        metadata: {
          companyId,
          voucherNumber: voucher.voucherNumber,
          description: voucher.description,
          amount: voucher.totalAmount,
        },
      });

      await manager.getRepository(VoucherLine).remove(voucher.lines);
      return await manager.getRepository(Voucher).remove(voucher);
    });
  }

  // ══════════════════════════════════════════════════════════
  // ── VOUCHER POSTING ──
  // ══════════════════════════════════════════════════════════

  private async postVoucherInTransaction(
    manager: EntityManager,
    companyId: number,
    id: string,
  ) {
    const voucher = await manager.getRepository(Voucher).findOne({
      where: { id, companyId },
      relations: ['lines'],
    });

    if (!voucher) {
      throw new NotFoundException(`Voucher #${id} no encontrado`);
    }

    // Actualizar saldos de cuentas
    for (const line of voucher.lines) {
      const account = await manager.getRepository(Account).findOneBy({
        id: line.accountId,
        companyId,
      });
      if (account) {
        const debit = Number(line.debit) || 0;
        const credit = Number(line.credit) || 0;
        if (account.nature === 'deudora') {
          account.balance = Number(account.balance) + debit - credit;
        } else {
          account.balance = Number(account.balance) + credit - debit;
        }
        await manager.getRepository(Account).save(account);
      }
    }

    voucher.status = 'posted';
    return await manager.getRepository(Voucher).save(voucher);
  }

  private async reverseVoucherBalancesInTransaction(
    manager: EntityManager,
    voucher: Voucher,
  ) {
    const voucherWithLines = await manager.getRepository(Voucher).findOne({
      where: { id: voucher.id },
      relations: ['lines'],
    });

    if (!voucherWithLines) {
      throw new NotFoundException(`Voucher #${voucher.id} no encontrado`);
    }

    // Revertir saldos
    for (const line of voucherWithLines.lines) {
      const account = await manager.getRepository(Account).findOneBy({
        id: line.accountId,
        companyId: voucherWithLines.companyId,
      });
      if (account) {
        const debit = Number(line.debit) || 0;
        const credit = Number(line.credit) || 0;
        if (account.nature === 'deudora') {
          account.balance = Number(account.balance) - debit + credit;
        } else {
          account.balance = Number(account.balance) - credit + debit;
        }
        await manager.getRepository(Account).save(account);
      }
    }

    voucherWithLines.status = 'cancelled';
    return await manager.getRepository(Voucher).save(voucherWithLines);
  }

  // ══════════════════════════════════════════════════════════
  // ── HELPER METHODS ──
  // ══════════════════════════════════════════════════════════

  private async resolveVoucherLines(
    manager: EntityManager,
    companyId: number,
    lines: any[],
  ) {
    return await Promise.all(
      lines.map(async (line) => {
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

        // Subcuenta
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

        // Elemento
        let elementName: string | null = null;
        if (line.element) {
          const subelement = await manager.getRepository(Subelement).findOneBy({
            code: line.element,
            companyId,
          });
          if (subelement) {
            elementName = subelement.name;
          } else {
            const globalSubelement = await manager
              .getRepository(Subelement)
              .findOneBy({
                code: line.element,
              });
            if (globalSubelement) {
              elementName = globalSubelement.name;
            }
          }
        }

        // Subelemento
        let subelementName: string | null = null;
        if (line.subelement) {
          const subelement = await manager.getRepository(Subelement).findOneBy({
            code: line.subelement,
            companyId,
          });
          if (subelement) {
            subelementName = subelement.name;
          } else {
            const globalSubelement = await manager
              .getRepository(Subelement)
              .findOneBy({
                code: line.subelement,
              });
            if (globalSubelement) {
              subelementName = globalSubelement.name;
            }
          }
        }

        return {
          accountId,
          accountCode: line.accountCode,
          accountName: accountName || line.accountName,
          subaccountCode: line.subaccountCode || null,
          subaccountName,
          element: line.element || null,
          elementName,
          subelement: line.subelement || null,
          subelementName,
          debit: line.debit || 0,
          credit: line.credit || 0,
          description: line.description || null,
          costCenterId: line.costCenterId || null,
          reference: line.reference || null,
        };
      }),
    );
  }

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

  private async findPeriodByDate(
    companyId: number,
    date: string,
  ): Promise<AccountingPeriod | null> {
    const dateObj = new Date(date);
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth() + 1;

    return this.periodRepo.findOne({
      where: {
        companyId,
        year,
        month,
      },
    });
  }

  // ══════════════════════════════════════════════════════════
  // ── STATISTICS ──
  // ══════════════════════════════════════════════════════════

  async getVoucherStatistics(companyId: number) {
    const vouchers = await this.voucherRepo.find({ where: { companyId } });
    const totalAmount = vouchers
      .filter((v) => v.status === 'posted')
      .reduce((sum, v) => sum + Number(v.totalAmount), 0);

    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};

    vouchers.forEach((v) => {
      byStatus[v.status] = (byStatus[v.status] || 0) + 1;
      byType[v.type] = (byType[v.type] || 0) + 1;
    });

    return {
      total: vouchers.length,
      totalAmount,
      byStatus,
      byType,
    };
  }
}
