/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Voucher, SourceModule, VoucherType } from '../entities/voucher.entity';
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
import { DocumentSequenceService } from '../common/sequence/document-sequence.service';

@Injectable()
export class VoucherService {
  private readonly logger = new Logger(VoucherService.name);

  /** Prefijo de la serie de comprobantes por tipo normalizado. */
  static readonly TYPE_PREFIX: Record<VoucherType, string> = {
    factura: 'FAC',
    recibo: 'REC',
    nota_debito: 'NDB',
    nota_credito: 'NCR',
    nomina: 'NOM',
    depreciacion: 'DEP',
    ajuste: 'AJU',
    apertura: 'APE',
    cierre: 'CIE',
    otro: 'COP',
  };

  /**
   * Traduce las denominaciones que usan los módulos a los tipos oficiales de
   * comprobante. Sin esta tabla, 'sales', 'payroll', 'inventory', etc. se
   * consideraban tipos distintos entre sí pero compartían el prefijo 'COP',
   * produciendo números de comprobante duplicados.
   */
  private static readonly TYPE_ALIASES: Record<string, VoucherType> = {
    sales: 'factura',
    invoice: 'factura',
    cost_of_sales: 'ajuste',
    inventory: 'ajuste',
    adjustment: 'ajuste',
    payroll: 'nomina',
    depreciation: 'depreciacion',
    receipt: 'recibo',
    payment: 'recibo',
    finance: 'recibo',
    purchase: 'ajuste',
    opening: 'apertura',
    closing: 'cierre',
  };

  static normalizeVoucherType(type?: string): VoucherType {
    if (!type) return 'otro';
    if (type in VoucherService.TYPE_PREFIX) return type as VoucherType;
    return VoucherService.TYPE_ALIASES[type] || 'otro';
  }

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
    private readonly sequenceService: DocumentSequenceService,
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
        .leftJoinAndSelect('lines.area', 'area')
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
        .leftJoinAndSelect('lines.area', 'area')
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
      relations: ['lines', 'lines.costCenter', 'lines.area'],
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

  async createVoucher(
    companyId: number,
    data: any,
    manager?: EntityManager,
  ) {
    if (manager) {
      const result = await this.createVoucherTransaction(manager, companyId, data);
      await this.invalidateReportCache(companyId);
      return result;
    }
    const result = await this.entityManager.transaction(async (m) =>
      this.createVoucherTransaction(m, companyId, data),
    );
    await this.invalidateReportCache(companyId);
    return result;
  }

  private async createVoucherTransaction(
    manager: EntityManager,
    companyId: number,
    data: any,
  ) {
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

      // Serie del comprobante. El tipo se normaliza porque los módulos envían
      // denominaciones propias ('sales', 'payroll', 'inventory'…): sin esta
      // normalización todas caían en el prefijo genérico y varias series
      // paralelas emitían el mismo número.
      const normalizedType = VoucherService.normalizeVoucherType(data.type);
      const prefix = VoucherService.TYPE_PREFIX[normalizedType];

      // Consecutivo atómico por empresa y serie (no reutiliza números tras
      // anulaciones ni colisiona bajo concurrencia).
      const nextNumber = await this.sequenceService.next(
        companyId,
        `voucher:${prefix}`,
        0,
        manager,
      );
      const voucherNumber = `${prefix}-${String(nextNumber).padStart(5, '0')}`;

      // Crear voucher
      const voucher = manager.getRepository(Voucher).create({
        companyId,
        voucherNumber,
        date: data.date,
        description: data.description,
        type: normalizedType,
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
            areaId: line.areaId,
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

      // Publicar automáticamente los comprobantes de apertura y cierre del
      // ejercicio: son asientos obligatorios generados por el sistema y no
      // están sujetos a aprobación manual.
      //
      // skipBalanceUpdate se usa en el asiento de apertura generado al abrir un
      // ejercicio a continuación de otro ya cerrado: los saldos de balance ya
      // vienen arrastrados en las cuentas, de modo que el asiento se registra
      // como documento del Libro Diario del nuevo año sin volver a sumarlos.
      if (data.type === 'apertura' || data.type === 'cierre') {
        await this.postVoucherInTransaction(
          manager,
          companyId,
          saved.id,
          data.skipBalanceUpdate === true,
        );
      }

      return saved;
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
        costCenterId?: string | null;
        /** Área de AFT asociada a la partida (submayor por área) */
        areaId?: number | null;
        /** Subcuenta analítica explícita; si se indica, se usa en lugar de resolver accountCode */
        subaccountCode?: string | null;
        /** Elemento de gasto (clasificador cubano) — requerido en cuentas de gasto */
        element?: string | null;
        /** Subelemento de gasto (clasificador cubano) */
        subelement?: string | null;
        /** Identificación del tercero (cliente/proveedor/trabajador) para el submayor */
        reference?: string | null;
      }[];
    },
    manager?: EntityManager,
  ) {
    // Resolver accountId y accountName desde accountCode.
    // Las cuentas agrupadoras se redirigen a su subcuenta analítica asentable.
    const accountRepo = manager ? manager.getRepository(Account) : this.accountRepo;
    const resolvedLines: any[] = [];
    for (const line of data.lines) {
      const account = await this.resolvePostableAccount(
        accountRepo,
        companyId,
        line.accountCode,
        line.subaccountCode,
      );

      // Resolver nombres de la cuenta padre y de la subcuenta por separado
      const parentAccount = account.parentCode
        ? await accountRepo.findOneBy({ code: account.parentCode, companyId })
        : null;
      const accountCode = parentAccount?.code ?? account.code;
      const accountName = parentAccount?.name ?? account.name;
      const subaccountCode = parentAccount ? account.code : null;
      const subaccountName = parentAccount ? account.name : null;

      // El elemento/subelemento de gasto solo es aplicable a cuentas de gasto.
      // Si se recibe un subelemento sin elemento, se deriva el elemento del
      // propio subelemento (los códigos siguen el patrón "elemento.subelemento").
      const subelement = line.subelement || null;
      let element = line.element || null;
      if (!element && subelement) {
        element = this.deriveElementFromSubelement(subelement);
      }
      resolvedLines.push({
        accountId: account.id,
        accountCode,
        accountName,
        subaccountCode,
        subaccountName,
        debit: line.debit,
        credit: line.credit,
        description: line.description,
        costCenterId: line.costCenterId,
        element: account.type === 'expense' ? element : null,
        subelement: account.type === 'expense' ? subelement : null,
        reference: line.reference || null,
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
    }, manager);
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

      // Los comprobantes generados automáticamente por otros módulos
      // (inventario, facturación, activos fijos, nómina) son de solo lectura:
      // deben reflejar fielmente la operación de origen y no pueden editarse.
      if (voucher.sourceModule && voucher.sourceModule !== 'manual') {
        throw new BadRequestException(
          `Este comprobante fue generado automáticamente por el módulo "${voucher.sourceModule}" y no puede editarse. Solo puede visualizarse. Para corregirlo, ajuste la operación de origen.`,
        );
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
            areaId: line.areaId,
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

  async batchUpdateVoucherStatus(
    companyId: number,
    ids: string[],
    status: string,
  ) {
    const results: { id: string; status: string }[] = [];
    const errors: { id: string; error: string }[] = [];

    for (const id of ids) {
      try {
        await this.updateVoucherStatus(companyId, id, status);
        results.push({ id, status });
      } catch (err) {
        this.logger.error(
          `Error al actualizar comprobante ${id}: ${err.message || err}`,
          err?.stack,
        );
        errors.push({ id, error: err.message || 'Error desconocido' });
      }
    }

    return {
      processed: results.length,
      failed: errors.length,
      errors,
      status,
    };
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

      // Los comprobantes generados por otros módulos no pueden eliminarse
      // manualmente: deben anularse desde la operación de origen.
      if (voucher.sourceModule && voucher.sourceModule !== 'manual') {
        throw new BadRequestException(
          `Este comprobante fue generado automáticamente por el módulo "${voucher.sourceModule}" y no puede eliminarse. Para revertirlo, ajuste o anule la operación de origen.`,
        );
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
    skipBalanceUpdate = false,
  ) {
    const voucher = await manager.getRepository(Voucher).findOne({
      where: { id, companyId },
      relations: ['lines'],
    });

    if (!voucher) {
      throw new NotFoundException(`Voucher #${id} no encontrado`);
    }

    if (skipBalanceUpdate) {
      voucher.status = 'posted';
      return await manager.getRepository(Voucher).save(voucher);
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
        if (account.nature === 'acreedora') {
          account.balance = Number(account.balance) + credit - debit;
        } else {
          account.balance = Number(account.balance) + debit - credit;
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
        if (account.nature === 'acreedora') {
          account.balance = Number(account.balance) - credit + debit;
        } else {
          account.balance = Number(account.balance) - debit + credit;
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

  /**
   * Deriva el código de elemento de gasto a partir del subelemento.
   *
   * El clasificador cubano de gastos agrupa los subelementos (5 dígitos) bajo
   * elementos de un dígito seguido de dos ceros: 100 Materias Primas y
   * Materiales, 300 Combustibles, 400 Energía, 500 Salarios, 600 Otros Gastos
   * de la Fuerza de Trabajo, 700 Depreciación, 800 Otros Gastos Monetarios,
   * 900 Transferencias. Ej.: 11101 → 100; 50100 → 500; 70100 → 700.
   */
  private deriveElementFromSubelement(subelement: string): string | null {
    const digits = subelement.replace(/\D/g, '');
    if (!digits.length) return null;
    return `${digits[0]}00`;
  }

  /**
   * Resuelve una cuenta contable "asentable" a partir de un código.
   *
   * Conforme al Nomenclador Cubano y a los sistemas contables de referencia,
   * los asientos SOLO pueden registrarse en cuentas analíticas de último nivel
   * (allowsMovements = true). Si el código apunta a una cuenta agrupadora
   * (allowsMovements = false), se redirige automáticamente a su subcuenta de
   * contrapartida (preferentemente la terminada en "-0020", Fuera del Órgano u
   * Organismo). Si la cuenta no existe o no tiene ninguna subcuenta con
   * movimientos, se rechaza el asiento.
   */
  private async resolvePostableAccount(
    repo: Repository<Account>,
    companyId: number,
    code: string,
    subaccountCode?: string | null,
  ): Promise<Account> {
    // Si se indica subcuenta analítica explícita, resolver directamente esa
    // cuenta y no redirigir silenciosamente a otra subcuenta genérica.
    if (subaccountCode) {
      const exact = await repo.findOneBy({ code: subaccountCode, companyId });
      if (exact) {
        if (!exact.allowsMovements) {
          throw new BadRequestException(
            `La subcuenta ${subaccountCode} (${exact.name}) no admite movimientos`,
          );
        }
        return exact;
      }
      throw new BadRequestException(
        `Subcuenta ${subaccountCode} no encontrada para esta empresa`,
      );
    }

    const account = await repo.findOneBy({ code, companyId });
    if (!account) {
      throw new BadRequestException(
        `Cuenta contable ${code} no encontrada para esta empresa`,
      );
    }
    if (account.allowsMovements) {
      return account;
    }

    // La cuenta es agrupadora: buscar una subcuenta analítica con movimientos.
    const children = await repo.find({
      where: { companyId, parentCode: code, allowsMovements: true },
      order: { code: 'ASC' },
    });
    if (children.length === 0) {
      throw new BadRequestException(
        `La cuenta ${code} (${account.name}) es agrupadora y no admite movimientos. ` +
          `Configure una subcuenta analítica de contrapartida (p. ej. ${code}-0020) para poder registrar el asiento.`,
      );
    }

    const preferred =
      children.find((c) => c.code.endsWith('-0020')) || children[0];
    this.logger.warn(
      `Asiento redirigido de cuenta agrupadora ${code} a subcuenta analítica ${preferred.code} (${preferred.name})`,
    );
    return preferred;
  }

  private async resolveVoucherLines(
    manager: EntityManager,
    companyId: number,
    lines: any[],
  ) {
    return await Promise.all(
      lines.map(async (line) => {
        let accountId = line.accountId;
        let accountCode = line.accountCode;
        let accountName = line.accountName;

        if (!accountId) {
          const account = await this.resolvePostableAccount(
            manager.getRepository(Account),
            companyId,
            line.accountCode,
            line.subaccountCode,
          );
          accountId = account.id;

          // Si la cuenta resuelta tiene padre, guardar el padre en accountCode/accountName
          const parent = account.parentCode
            ? await manager
                .getRepository(Account)
                .findOneBy({ code: account.parentCode, companyId })
            : null;
          accountCode = parent?.code ?? account.code;
          accountName = parent?.name ?? account.name;
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
          accountCode: accountCode || line.accountCode,
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
          areaId: line.areaId || null,
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
