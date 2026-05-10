/* eslint-disable prettier/prettier */
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
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Voucher, SourceModule } from '../entities/voucher.entity';
import { VoucherLine } from '../entities/voucher-line.entity';
import { Account } from '../entities/account.entity';
import { Subelement } from '../entities/subelement.entity';
import { AccountingPeriod } from '../entities/accounting-period.entity';
import { EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditResource } from '../entities/audit-log.entity';
import { PaginationService } from '../common/pagination/pagination.service';
import { PaginationResult, SearchPaginationDto } from '../common/pagination/pagination.dto';
import { CacheService } from '../cache/cache.service';

@Injectable()
export class VoucherService {
  private readonly logger = new Logger(VoucherService.name);

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
    private readonly auditService: AuditService,
    private readonly paginationService: PaginationService,
    private readonly cacheService: CacheService,
  ) {}

  private async invalidateReportCache(companyId: number): Promise<void> {
    await this.cacheService.invalidatePattern(`reports:${companyId}:*`);
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
    try {
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

      qb.orderBy('v.createdAt', 'DESC')
        .addOrderBy('v.date', 'DESC')
        .addOrderBy('v.voucherNumber', 'DESC');
      const results = await qb.getMany();
      return results;
    } catch (error) {
      this.logger.error(`Error in findAllVouchers: ${error?.message || error}`, error?.stack);
      throw error;
    }
  }

  async findAllVouchersPaginated(
    companyId: number,
    filters: SearchPaginationDto & {
      status?: string;
      type?: string;
      fromDate?: string;
      toDate?: string;
      sourceModule?: string;
    },
  ): Promise<PaginationResult<Voucher>> {
    const qb = this.voucherRepo
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.lines', 'lines')
      .leftJoinAndSelect('lines.costCenter', 'costCenter')
      .where('v.companyId = :companyId', { companyId });

    if (filters.status)
      qb.andWhere('v.status = :status', { status: filters.status });
    if (filters.type) qb.andWhere('v.type = :type', { type: filters.type });
    if (filters.fromDate)
      qb.andWhere('v.date >= :fromDate', { fromDate: filters.fromDate });
    if (filters.toDate)
      qb.andWhere('v.date <= :toDate', { toDate: filters.toDate });
    if (filters.sourceModule)
      qb.andWhere('v.source_module = :sourceModule', {
        sourceModule: filters.sourceModule,
      });

    // Apply search and sorting using pagination service
    this.paginationService.applySearchAndSort(qb, filters, [
      'v.description',
      'v.voucher_number',
      'v.reference',
    ]);

    return this.paginationService.paginate(qb, filters);
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
    const result = await this.entityManager.transaction(async (manager) => {
      // Validar período contable abierto y obtener su ID
      const period = await this.findPeriodByDate(companyId, data.date);
      if (!period) {
        throw new BadRequestException(
          `No existe un período contable para la fecha ${data.date}. Debe crear un año fiscal con períodos para esta empresa.`,
        );
      }
      if (period.status !== 'open') {
        throw new BadRequestException(
          'No se puede registrar comprobantes en un período cerrado',
        );
      }

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
        periodId: period.id,
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
      await this.auditService.log({
        companyId,
        userId: data.createdBy,
        action: AuditAction.CREATE,
        resource: AuditResource.VOUCHER,
        resourceId: saved.id,
        resourceName: saved.voucherNumber,
        newValues: {
          voucherNumber: saved.voucherNumber,
          description: saved.description,
          status: saved.status,
          totalAmount: saved.totalAmount,
          linesCount: saved.lines?.length || 0,
        },
      });

      // Publicar automáticamente si es de apertura
      if (data.type === 'apertura') {
        await this.postVoucherInTransaction(manager, companyId, saved.id);
      }

      return saved;
    });
    await this.invalidateReportCache(companyId);
    return result;
  }

  /**
   * Crea un comprobante contable desde otro módulo (inventario, compras, facturación, etc.)
   * Resuelve accountCode → accountId + accountName antes de crear el voucher.
   */
  async createVoucherFromModule(
    companyId: number,
    source: SourceModule | string,
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
    const resolvedLines: any[] = [];
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

  async updateVoucher(companyId: number, id: string, data: any) {
    const result = await this.entityManager.transaction(async (manager) => {
      const voucher = await manager.getRepository(Voucher).findOne({
        where: { id, companyId },
        relations: ['lines'],
      });

      if (!voucher) {
        throw new NotFoundException(`Voucher #${id} no encontrado`);
      }

      if (voucher.status !== 'draft') {
        throw new BadRequestException(
          'Solo se pueden editar comprobantes en estado borrador',
        );
      }

      // Validar período contable abierto
      const date = data.date || voucher.date;
      const period = await this.findPeriodByDate(companyId, date);
      if (!period) {
        throw new BadRequestException(
          `No existe un período contable para la fecha ${date}.`,
        );
      }
      if (period.status !== 'open') {
        throw new BadRequestException(
          'No se puede modificar comprobantes en un período cerrado',
        );
      }

      // Validar líneas si se proporcionan
      if (data.lines) {
        if (data.lines.length < 2) {
          throw new BadRequestException(
            'Un comprobante debe tener al menos 2 partidas (líneas)',
          );
        }

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

        for (const line of data.lines) {
          if (Number(line.debit) > 0 && Number(line.credit) > 0) {
            throw new BadRequestException(
              `La partida de cuenta ${line.accountCode} no puede tener débito y crédito simultáneamente`,
            );
          }
        }

        // Delete old lines
        await manager
          .getRepository(VoucherLine)
          .delete({ voucherId: voucher.id });

        // Resolve and create new lines
        const resolvedLines = await this.resolveVoucherLines(
          manager,
          companyId,
          data.lines,
        );

        const newLines = resolvedLines.map((line, index) =>
          manager.getRepository(VoucherLine).create({
            voucherId: voucher.id,
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
        );

        await manager.getRepository(VoucherLine).save(newLines);

        voucher.totalAmount = data.lines.reduce(
          (sum, l) => sum + Number(l.debit || 0),
          0,
        );
      }

      // Update voucher fields
      if (data.description !== undefined)
        voucher.description = data.description;
      if (data.date !== undefined) {
        voucher.date = data.date;
        voucher.periodId = period.id;
      }
      if (data.type !== undefined) voucher.type = data.type;
      if (data.reference !== undefined) voucher.reference = data.reference;

      const saved = await manager.getRepository(Voucher).save(voucher);

      await this.auditService.log({
        companyId,
        userId: data.createdBy,
        action: AuditAction.UPDATE,
        resource: AuditResource.VOUCHER,
        resourceId: saved.id,
        resourceName: saved.voucherNumber,
        oldValues: {
          voucherNumber: voucher.voucherNumber,
          description: voucher.description,
          status: voucher.status,
          totalAmount: voucher.totalAmount,
        },
        newValues: {
          voucherNumber: saved.voucherNumber,
          description: saved.description,
          status: saved.status,
          totalAmount: saved.totalAmount,
        },
      });

      return this.findOneVoucher(companyId, saved.id);
    });
    await this.invalidateReportCache(companyId);
    return result;
  }

  async updateVoucherStatus(companyId: number, id: string, status: string) {
    const statusResult = await this.entityManager.transaction(async (manager) => {
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
        await this.auditService.log({
          companyId,
          userId: voucher.createdBy || undefined,
          action: AuditAction.UPDATE,
          resource: AuditResource.VOUCHER,
          resourceId: voucher.id,
          resourceName: voucher.voucherNumber,
          oldValues: { status: voucher.status },
          newValues: { status: 'posted' },
        });

        return result;
      }

      if (status === 'cancelled' && voucher.status === 'posted') {
        await this.reverseVoucherBalancesInTransaction(manager, voucher);

        // Log audit for voucher cancellation
        await this.auditService.log({
          companyId,
          userId: voucher.createdBy || undefined,
          action: AuditAction.UPDATE,
          resource: AuditResource.VOUCHER,
          resourceId: voucher.id,
          resourceName: voucher.voucherNumber,
          oldValues: { status: voucher.status },
          newValues: { status: 'cancelled' },
        });
      }

      voucher.status = status as any;
      const result = await manager.getRepository(Voucher).save(voucher);

      // Log audit for status change
      await this.auditService.log({
        companyId,
        userId: voucher.createdBy || undefined,
        action: AuditAction.UPDATE,
        resource: AuditResource.VOUCHER,
        resourceId: voucher.id,
        resourceName: voucher.voucherNumber,
        oldValues: { status: voucher.status },
        newValues: { status: status },
      });

      return result;
    });
    await this.invalidateReportCache(companyId);
    return statusResult;
  }

  async deleteVoucher(companyId: number, id: string) {
    const deleteResult = await this.entityManager.transaction(async (manager) => {
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
      await this.auditService.log({
        companyId,
        userId: voucher.createdBy || undefined,
        action: AuditAction.DELETE,
        resource: AuditResource.VOUCHER,
        resourceId: voucher.id,
        resourceName: voucher.voucherNumber,
        oldValues: {
          voucherNumber: voucher.voucherNumber,
          description: voucher.description,
          status: voucher.status,
          totalAmount: voucher.totalAmount,
          linesCount: voucher.lines?.length || 0,
        },
      });

      await manager.getRepository(VoucherLine).remove(voucher.lines);
      return await manager.getRepository(Voucher).remove(voucher);
    });
    await this.invalidateReportCache(companyId);
    return deleteResult;
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
