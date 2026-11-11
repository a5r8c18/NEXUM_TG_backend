import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Invoice } from '../entities/invoice.entity';
import { AccountReceivable } from '../entities/account-receivable.entity';
import { AccountPayable } from '../entities/account-payable.entity';
import { BankAccount } from '../entities/bank-account.entity';
import { BankTransaction } from '../entities/bank-transaction.entity';
import { Payment } from '../entities/payment.entity';
import { CashRegister } from '../entities/cash-register.entity';
import { CashMovement } from '../entities/cash-movement.entity';
import { BankReconciliation } from '../entities/bank-reconciliation.entity';
import { Customer } from '../entities/customer.entity';
import { CounterpartConcept } from '../entities/counterpart-concept.entity';
import { Account } from '../entities/account.entity';
import { VoucherService } from '../accounting/voucher.service';
import { AccountMappingService } from '../accounting/account-mapping.service';
import { MappingType } from '../entities/account-mapping.entity';
import { DocumentSequenceService } from '../common/sequence/document-sequence.service';

/**
 * Campos que el cliente puede escribir en cada recurso. Todo lo demás
 * (saldos, estados, numeradores, companyId, vínculos de origen) lo calcula
 * el backend — jamás se acepta del body.
 */
const RECEIVABLE_FIELDS = [
  'invoiceId',
  'invoiceNumber', 'customerName', 'customerId', 'customerAddress',
  'customerPhone', 'customerEmail', 'customerNit', 'originalAmount',
  'dueDate', 'priority', 'creditLimit', 'availableCredit',
  'collectionNotes', 'disputeReason', 'disputeDate',
] as const;

const PAYABLE_FIELDS = [
  'purchaseId', 'purchaseNumber', 'supplierId', 'supplierName', 'supplierNit',
  'supplierAddress', 'supplierPhone', 'supplierEmail', 'invoiceNumber',
  'invoiceDate', 'originalAmount', 'dueDate', 'accountCode', 'priority',
  'paymentTerms', 'earlyPaymentDiscount', 'latePaymentPenalty', 'paymentNotes',
  'disputeReason', 'disputeDate', 'currency', 'exchangeRate', 'notes',
  'createdBy',
] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PAYABLE_UPDATE_FIELDS = PAYABLE_FIELDS.filter(
  (f) => f !== 'purchaseId' && f !== 'purchaseNumber' && f !== 'createdBy',
);

const BANK_ACCOUNT_FIELDS = [
  'accountNumber', 'accountName', 'bankName', 'bankCode', 'accountType',
  'fondo', 'accountingAccount',
  'currency', 'balance', 'overdraftLimit', 'creditLimit', 'interestRate',
  'openingDate', 'holderName', 'holderDocument', 'contactPhone',
  'contactEmail', 'branchName', 'branchAddress', 'isDefault', 'notes',
] as const;

const BANK_ACCOUNT_UPDATE_FIELDS = [
  'accountNumber', 'accountName', 'bankName', 'bankCode', 'accountType',
  'fondo', 'accountingAccount',
  'currency', 'overdraftLimit', 'creditLimit', 'interestRate', 'openingDate',
  'closingDate', 'status', 'isDefault', 'holderName', 'holderDocument',
  'contactPhone', 'contactEmail', 'branchName', 'branchAddress', 'notes',
] as const;

const BANK_TRANSACTION_FIELDS = [
  'transactionNumber', 'transactionDate', 'transactionType', 'amount',
  'currency', 'exchangeRate', 'description', 'referenceNumber',
  'counterpartyName', 'counterpartyAccount', 'category', 'transactionCode', 'notes',
] as const;

const PAYMENT_FIELDS = [
  'paymentDate', 'paymentType', 'paymentMethod', 'amount', 'currency',
  'exchangeRate', 'description', 'referenceNumber', 'checkNumber',
  'checkDate', 'bankName', 'bankAccountId', 'authorizationCode',
  'cardLastFour', 'paidBy', 'receivedBy', 'notes', 'accountReceivableId',
  'accountPayableId', 'performedBy',
] as const;

const CASH_REGISTER_FIELDS = [
  'registerName', 'responsibleName', 'responsibleId', 'location', 'currency',
  'maxRetentionLimit', 'isDefault', 'notes',
] as const;

/** Código del comprobante que usa cuenta contable en vez de concepto. */
const OPENING_ENTRY_CODE = 'Carga Inicial';

/** Concepto de contrapartida: Ingresos por Pago en Línea (ingreso bruto - comisión = neto al banco). */
const ONLINE_PAYMENT_CONCEPT = '19';

/** Conceptos que piden una cuenta de ingreso del nomenclador: 19 (con comisión), 22 y 23 (sin comisión). */
const INCOME_ACCOUNT_CONCEPTS = new Set([ONLINE_PAYMENT_CONCEPT, '22', '23']);

/** Cuenta de ingreso por defecto de cada concepto sin cuenta fija (22 Ingresos de comedores → 950). */
const DEFAULT_INCOME_ACCOUNT: Record<string, string> = { '22': '950' };

/** Cuenta fija del concepto 19 (Pago en Línea): el usuario elige su subcuenta. */
const ONLINE_PAYMENT_INCOME_ACCOUNT = '900';
const ONLINE_PAYMENT_FEE_ACCOUNT = '835';

/** Subcuenta de la 835 para la comisión bancaria cuando no se elige otra. */
const ONLINE_PAYMENT_DEFAULT_FEE_SUBACCOUNT = '835-0010';

/** Concepto 38: transferencias entre cuentas bancarias propias. */
const BANK_TRANSFER_CONCEPT = '38';
/** 26 Cobros anticipados (acredita la contrapartida, p. ej. 430) y 27 Pagos anticipados (la debita). */
const ADVANCE_CONCEPTS = new Set(['26', '27']);

/**
 * Conceptos que exigen el cliente/proveedor: liquidaciones de CxC/CxP (20/21)
 * y anticipos (26/27), cuyo tercero vincula el movimiento con la obligación.
 */
const THIRD_PARTY_REQUIRED_CONCEPTS = new Set(['20', '21', '26', '27']);

/**
 * Conceptos de ingreso que no se registran en Banco: 28 (los cobros
 * anticipados se liquidan desde su vista) y 80/81 (efectivo, va por Caja).
 */
const BANK_INCOME_EXCLUDED_CONCEPTS = new Set(['28', '80', '81']);

/** Conceptos disponibles en Caja - Ingreso. */
export const CASH_INCOME_CONCEPTS = ['24', '80', '81'];

/** Concepto del comprobante Banco - Ingreso que genera un depósito desde Caja. */
const CASH_DEPOSIT_CONCEPT = '24';

/** Tipos de comprobante de caja que el usuario puede registrar, por sentido. */
export const CASH_DOCUMENT_TYPES: Record<'income' | 'expense', Record<string, string>> = {
  income: {
    carga_inicial: 'Carga inicial',
    recibo_ingreso: 'Recibo de ingresos',
    liquidacion_cobro: 'Liquidación de documentos de cobro',
    otros_cobros: 'Otros cobros',
  },
  expense: {
    liquidacion_pago: 'Liquidación de documento de pago',
    deposito_cuenta: 'Modelo de depósito en cuenta',
    modelo_dieta: 'Modelo de dieta',
    otros_pagos: 'Otros pagos',
  },
};

/** Valores válidos de `source_module` en comprobantes bancarios. */
const BANK_TX_SOURCE_MODULES = new Set<string>([
  'manual',
  'payment',
  'payroll',
  'fixed-assets',
  'transfer',
  'reversal',
  'cash',
]);

/** Devuelve solo las propiedades permitidas presentes en `data`. */
function pick(data: any, fields: readonly string[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const field of fields) {
    if (data?.[field] !== undefined) out[field] = data[field];
  }
  return out;
}

@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);

  constructor(
    @InjectRepository(AccountReceivable)
    private readonly arRepo: Repository<AccountReceivable>,
    @InjectRepository(AccountPayable)
    private readonly apRepo: Repository<AccountPayable>,
    @InjectRepository(BankAccount)
    private readonly bankRepo: Repository<BankAccount>,
    @InjectRepository(BankTransaction)
    private readonly txRepo: Repository<BankTransaction>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(CashRegister)
    private readonly cashRegisterRepo: Repository<CashRegister>,
    @InjectRepository(CashMovement)
    private readonly cashMovementRepo: Repository<CashMovement>,
    @InjectRepository(BankReconciliation)
    private readonly reconciliationRepo: Repository<BankReconciliation>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(CounterpartConcept)
    private readonly counterpartConceptRepo: Repository<CounterpartConcept>,
    private readonly voucherService: VoucherService,
    private readonly accountMappingService: AccountMappingService,
    private readonly sequenceService: DocumentSequenceService,
    private readonly entityManager: EntityManager,
    private readonly dataSource: DataSource,
  ) {}

  // ════════════════════════════════════════════════════════
  // ── ANTIGÜEDAD DE SALDOS ──
  // ════════════════════════════════════════════════════════

  private static agingCategoryFor(
    days: number,
  ): 'current' | '1-30' | '31-60' | '61-90' | '91-120' | 'over-120' {
    if (days <= 0) return 'current';
    if (days <= 30) return '1-30';
    if (days <= 60) return '31-60';
    if (days <= 90) return '61-90';
    if (days <= 120) return '91-120';
    return 'over-120';
  }

  async recalculateAging(companyId?: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayMs = 24 * 60 * 60 * 1000;

    let updated = 0;

    for (const repo of [this.arRepo, this.apRepo] as Array<
      Repository<AccountReceivable | AccountPayable>
    >) {
      const where: any = { };
      if (companyId) where.companyId = companyId;
      const records = await repo.find({ where });

      for (const record of records as Array<AccountReceivable | AccountPayable>) {
        if (['paid', 'written_off'].includes(record.status)) continue;
        if (Number(record.balanceAmount) <= 0) continue;
        if (!record.dueDate) continue;

        const due = new Date(record.dueDate);
        due.setHours(0, 0, 0, 0);
        const days = Math.floor((today.getTime() - due.getTime()) / dayMs);
        const agingDays = days > 0 ? days : 0;
        const agingCategory = FinanceService.agingCategoryFor(days);
        const status =
          days > 0 && record.status === 'pending' ? 'overdue' : record.status;

        if (
          record.agingDays !== agingDays ||
          record.agingCategory !== agingCategory ||
          record.status !== status
        ) {
          record.agingDays = agingDays;
          record.agingCategory = agingCategory as any;
          record.status = status as any;
          await repo.save(record as any);
          updated++;
        }
      }
    }

    this.logger.log(`Antigüedad de saldos recalculada: ${updated} documento(s)`);
    return { updated };
  }

  // ══════════════════════════════════════════════════════════
  // ── CUENTAS POR COBRAR (CxC) ──
  // ══════════════════════════════════════════════════════════

  async findAllReceivables(companyId: number, filters?: any) {
    const qb = this.arRepo
      .createQueryBuilder('ar')
      .where('ar.company_id = :companyId', { companyId })
      .leftJoinAndSelect('ar.payments', 'payments')
      .orderBy('ar.created_at', 'DESC')
      .addOrderBy('ar.ar_number', 'DESC');

    if (filters?.status) qb.andWhere('ar.status = :status', { status: filters.status });
    if (filters?.customerName) qb.andWhere('ar.customer_name ILIKE :name', { name: `%${filters.customerName}%` });
    if (filters?.agingCategory) qb.andWhere('ar.aging_category = :aging', { aging: filters.agingCategory });

    return qb.getMany();
  }

  async findOneReceivable(companyId: number, id: string) {
    const ar = await this.arRepo.findOne({
      where: { id, companyId },
      relations: ['payments', 'invoice'],
    });
    if (!ar) throw new NotFoundException(`CxC ${id} no encontrada`);

    const vouchers = await this.voucherService.findVouchersBySourceDocumentId(
      companyId,
      `AR-${ar.id}`,
      'finance',
    );

    return {
      ...ar,
      vouchers: vouchers.sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1)),
    };
  }

  async createReceivable(companyId: number, data: any) {
    const arNumber = await this.sequenceService.nextFormatted(
      companyId,
      'account-receivable-manual',
      'CXC',
    );
    const fields = pick(data, RECEIVABLE_FIELDS);
    if (!String(fields.customerName ?? '').trim()) {
      throw new BadRequestException('El cliente es obligatorio');
    }
    if (!(Number(fields.originalAmount) > 0)) {
      throw new BadRequestException('El monto debe ser mayor que cero');
    }
    const ar = this.arRepo.create({
      ...fields,
      // Una CxC manual no proviene de una factura: la columna es obligatoria.
      invoiceNumber: fields.invoiceNumber || '',
      collectionNotes: fields.collectionNotes ?? data.description ?? null,
      companyId,
      arNumber,
      balanceAmount: fields.originalAmount,
    });
    return this.arRepo.save(ar);
  }

  async updateReceivable(companyId: number, id: string, data: any) {
    const ar = await this.findOneReceivable(companyId, id);
    const fields = pick(data, RECEIVABLE_FIELDS);
    Object.assign(ar, fields);
    if (fields.originalAmount !== undefined) {
      ar.balanceAmount =
        Math.round(
          (Number(fields.originalAmount) - Number(ar.paidAmount)) * 100,
        ) / 100;
    }
    return this.arRepo.save(ar);
  }

  async getReceivableStatistics(companyId: number) {
    const all = await this.arRepo.find({ where: { companyId } });
    const totalPending = all.filter(a => a.status !== 'paid').reduce((s, a) => s + Number(a.balanceAmount), 0);
    const totalOverdue = all.filter(a => a.status === 'overdue').reduce((s, a) => s + Number(a.balanceAmount), 0);
    const agingBreakdown = {
      current: all.filter(a => a.agingCategory === 'current').reduce((s, a) => s + Number(a.balanceAmount), 0),
      '1-30': all.filter(a => a.agingCategory === '1-30').reduce((s, a) => s + Number(a.balanceAmount), 0),
      '31-60': all.filter(a => a.agingCategory === '31-60').reduce((s, a) => s + Number(a.balanceAmount), 0),
      '61-90': all.filter(a => a.agingCategory === '61-90').reduce((s, a) => s + Number(a.balanceAmount), 0),
      '91-120': all.filter(a => a.agingCategory === '91-120').reduce((s, a) => s + Number(a.balanceAmount), 0),
      'over-120': all.filter(a => a.agingCategory === 'over-120').reduce((s, a) => s + Number(a.balanceAmount), 0),
    };
    return { total: all.length, totalPending, totalOverdue, agingBreakdown };
  }

  // ══════════════════════════════════════════════════════════
  // ── CUENTAS POR PAGAR (CxP) ──
  // ══════════════════════════════════════════════════════════

  async findAllPayables(companyId: number, filters?: any) {
    const qb = this.apRepo
      .createQueryBuilder('ap')
      .where('ap.company_id = :companyId', { companyId })
      .leftJoinAndSelect('ap.payments', 'payments')
      .orderBy('ap.created_at', 'DESC')
      .addOrderBy('ap.ap_number', 'DESC');

    if (filters?.status) qb.andWhere('ap.status = :status', { status: filters.status });
    if (filters?.supplierName) qb.andWhere('ap.supplier_name ILIKE :name', { name: `%${filters.supplierName}%` });

    return qb.getMany();
  }

  async findOnePayable(companyId: number, id: string) {
    const ap = await this.apRepo.findOne({
      where: { id, companyId },
      relations: ['payments'],
    });
    if (!ap) throw new NotFoundException(`CxP ${id} no encontrada`);

    const vouchersByObligation =
      await this.voucherService.findVouchersBySourceDocumentId(
        companyId,
        `AP-${ap.id}`,
      );
    const vouchersByPurchase = ap.purchaseId
      ? await this.voucherService.findVouchersBySourceDocumentId(
          companyId,
          ap.purchaseId,
          'inventory',
        )
      : [];

    const seen = new Set<string>();
    const vouchers = [...vouchersByObligation, ...vouchersByPurchase]
      .filter((v) => {
        if (seen.has(v.id)) return false;
        seen.add(v.id);
        return true;
      })
      .sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));

    return { ...ap, vouchers };
  }

  async createPayable(companyId: number, data: any, manager?: EntityManager) {
    const { transitAccountCode } = data;
    const payableData = pick(data, PAYABLE_FIELDS);
    if (!String(payableData.supplierName ?? '').trim()) {
      throw new BadRequestException('El proveedor es obligatorio');
    }
    if (!(Number(payableData.originalAmount) > 0)) {
      throw new BadRequestException('El monto debe ser mayor que cero');
    }
    // El NIT del proveedor es opcional en el catálogo, pero la columna de la
    // CxP es obligatoria; `supplier_id` es uuid, así que un código no vale.
    payableData.supplierNit = payableData.supplierNit || '';
    if (payableData.supplierId && !UUID_RE.test(String(payableData.supplierId))) {
      payableData.supplierId = null;
    }
    if (payableData.notes == null && data.description) {
      payableData.notes = data.description;
    }
    const apNumber = await this.sequenceService.nextFormatted(
      companyId,
      'account-payable',
      'CXP',
      { manager },
    );
    const apRepo = manager ? manager.getRepository(AccountPayable) : this.apRepo;
    const ap = apRepo.create({
      ...payableData,
      companyId,
      apNumber,
      balanceAmount: payableData.originalAmount,
    });
    const saved = (await apRepo.save(ap)) as unknown as AccountPayable;

    const amount = Number(payableData.originalAmount);
    if (transitAccountCode && payableData.accountCode && amount > 0) {
      const description =
        `Obligación por pagar ${saved.apNumber} — ` +
        `${payableData.notes || payableData.supplierName || ''}`.trim();
      await this.voucherService.createVoucherFromModule(
        companyId,
        'finance',
        `AP-${saved.id}`,
        {
          date: payableData.invoiceDate || new Date().toISOString().split('T')[0],
          description,
          type: 'otro',
          reference: payableData.invoiceNumber || saved.apNumber,
          createdBy: payableData.createdBy || 'Sistema',
          lines: [
            {
              accountCode: transitAccountCode,
              debit: amount,
              credit: 0,
              description: `Cancelación de transitoria ${saved.apNumber}`,
            },
            {
              accountCode: payableData.accountCode,
              subaccountCode: payableData.accountCode,
              debit: 0,
              credit: amount,
              description,
              reference: payableData.supplierName || null,
            },
          ],
        },
        manager,
      );
      this.logger.log(`Voucher de obligación generado para CxP ${saved.apNumber}`);
    }

    return saved;
  }

  async cancelPayablesByInvoiceNumber(
    companyId: number,
    invoiceNumber: string,
    reason?: string,
    manager?: EntityManager,
  ) {
    const apRepo = manager
      ? manager.getRepository(AccountPayable)
      : this.apRepo;
    const payables = await apRepo.find({
      where: { companyId, invoiceNumber },
    });
    let cancelled = 0;
    const blocked: string[] = [];
    for (const ap of payables) {
      if (ap.status === 'cancelled') continue;
      if (ap.status === 'paid' || Number(ap.paidAmount) > 0) {
        this.logger.warn(
          `CxP ${ap.apNumber} está ${ap.status === 'paid' ? 'saldada' : 'parcialmente pagada'}; no se anula automáticamente`,
        );
        blocked.push(ap.apNumber);
        continue;
      }
      ap.status = 'cancelled';
      ap.balanceAmount = 0;
      ap.notes = reason ? `${ap.notes ? ap.notes + ' | ' : ''}${reason}` : ap.notes;
      await apRepo.save(ap);
      cancelled++;

      const vouchers = await this.voucherService.findVouchersBySourceDocumentId(
        companyId,
        `AP-${ap.id}`,
      );
      for (const voucher of vouchers) {
        if (voucher.status === 'cancelled') continue;
        await this.voucherService.updateVoucherStatus(
          companyId,
          voucher.id,
          'cancelled',
          manager,
        );
      }
    }
    return { cancelled, blocked };
  }

  async updatePayable(companyId: number, id: string, data: any) {
    const ap = await this.findOnePayable(companyId, id);
    const fields = pick(data, PAYABLE_UPDATE_FIELDS);
    Object.assign(ap, fields);
    if (fields.originalAmount !== undefined) {
      ap.balanceAmount =
        Math.round(
          (Number(fields.originalAmount) - Number(ap.paidAmount)) * 100,
        ) / 100;
    }
    return this.apRepo.save(ap);
  }

  async getPayableStatistics(companyId: number) {
    const all = await this.apRepo.find({ where: { companyId } });
    const totalPending = all.filter(a => a.status !== 'paid').reduce((s, a) => s + Number(a.balanceAmount), 0);
    const totalOverdue = all.filter(a => a.status === 'overdue').reduce((s, a) => s + Number(a.balanceAmount), 0);
    return { total: all.length, totalPending, totalOverdue };
  }

  // ══════════════════════════════════════════════════════════
  // ── CUENTAS BANCARIAS ──
  // ══════════════════════════════════════════════════════════

  async findAllBankAccounts(companyId: number, filters?: any) {
    const qb = this.bankRepo
      .createQueryBuilder('ba')
      .where('ba.company_id = :companyId', { companyId })
      .orderBy('ba.account_name', 'ASC');

    if (filters?.status) qb.andWhere('ba.status = :status', { status: filters.status });
    if (filters?.accountType) qb.andWhere('ba.account_type = :type', { type: filters.accountType });

    return qb.getMany();
  }

  /**
   * La cuenta contable de un banco la elige siempre el usuario: debe venir
   * informada y existir en el nomenclador de la empresa.
   */
  private async validateBankAccountingAccount(companyId: number, code: string | null | undefined) {
    const value = String(code ?? '').trim();
    if (!value) {
      throw new BadRequestException('Seleccione la cuenta contable a la que se vincula la cuenta bancaria');
    }
    const exists = await this.dataSource.getRepository(Account).findOneBy({ companyId, code: value });
    if (!exists) {
      throw new BadRequestException(`La cuenta contable ${value} no existe en el nomenclador de la empresa`);
    }
    return value;
  }

  /** Cuenta contable vinculada por el usuario al banco; sin cuenta por defecto. */
  private bankAccountingCode(ba: BankAccount): string {
    if (!ba.accountingAccount?.trim()) {
      throw new BadRequestException(
        `La cuenta bancaria ${ba.bankName} - ${ba.accountNumber} no tiene cuenta contable vinculada. ` +
          'Asígnela en Finanzas > Bancos antes de registrar operaciones.',
      );
    }
    return ba.accountingAccount.trim();
  }

  async findOneBankAccount(companyId: number, id: string, manager?: EntityManager) {
    const bankRepo = manager ? manager.getRepository(BankAccount) : this.bankRepo;
    const ba = await bankRepo.findOne({
      where: { id, companyId },
      relations: ['transactions'],
    });
    if (!ba) throw new NotFoundException(`Cuenta bancaria ${id} no encontrada`);
    return ba;
  }

  async createBankAccount(companyId: number, data: any) {
    const fields = pick(data, BANK_ACCOUNT_FIELDS);
    fields.accountingAccount = await this.validateBankAccountingAccount(companyId, fields.accountingAccount);
    const ba = this.bankRepo.create({
      ...fields,
      accountName: (fields.accountName ?? fields.bankName ?? '').trim(),
      openingDate: fields.openingDate ?? new Date().toISOString().split('T')[0],
      companyId,
      availableBalance: Number(fields.balance ?? 0),
    });
    return this.bankRepo.save(ba);
  }

  async updateBankAccount(companyId: number, id: string, data: any) {
    const ba = await this.findOneBankAccount(companyId, id);
    Object.assign(ba, pick(data, BANK_ACCOUNT_UPDATE_FIELDS));
    ba.accountingAccount = await this.validateBankAccountingAccount(companyId, ba.accountingAccount);
    if (!ba.accountName?.trim()) ba.accountName = ba.bankName;
    if (!ba.openingDate) ba.openingDate = new Date().toISOString().split('T')[0];
    return this.bankRepo.save(ba);
  }

  async getBankStatistics(companyId: number) {
    const all = await this.bankRepo.find({ where: { companyId } });
    const totalBalance = all.reduce((s, a) => s + Number(a.balance), 0);
    const totalAvailable = all.reduce((s, a) => s + Number(a.availableBalance), 0);
    const activeAccounts = all.filter(a => a.status === 'active').length;
    return { total: all.length, activeAccounts, totalBalance, totalAvailable };
  }

  // ══════════════════════════════════════════════════════════
  // ── TRANSACCIONES BANCARIAS ──
  // ══════════════════════════════════════════════════════════

  async findBankTransactions(companyId: number, bankAccountId: string, filters?: any) {
    const qb = this.txRepo
      .createQueryBuilder('tx')
      .innerJoin('tx.bankAccount', 'ba')
      .where('ba.company_id = :companyId', { companyId })
      .andWhere('tx.bank_account_id = :bankAccountId', { bankAccountId })
      .orderBy('tx.transaction_date', 'DESC');

    if (filters?.fromDate) qb.andWhere('tx.transaction_date >= :from', { from: filters.fromDate });
    if (filters?.toDate) qb.andWhere('tx.transaction_date <= :to', { to: filters.toDate });
    if (filters?.type) qb.andWhere('tx.transaction_type = :type', { type: filters.type });

    return qb.getMany();
  }

  async findAllBankTransactions(companyId: number, type?: string) {
    const qb = this.txRepo
      .createQueryBuilder('tx')
      .innerJoin('tx.bankAccount', 'ba')
      .addSelect(['ba.accountNumber', 'ba.bankName'])
      .where('ba.company_id = :companyId', { companyId })
      .orderBy('tx.transaction_date', 'DESC');
    if (type) qb.andWhere('tx.transaction_type = :type', { type });
    return qb.getMany();
  }

  private async applyBankBalanceDelta(
    companyId: number,
    bankAccountId: string,
    delta: number,
    manager?: EntityManager,
  ): Promise<void> {
    if (manager) {
      await manager.query(
        `UPDATE bank_accounts
          SET balance = balance + $1,
              available_balance = balance + $1
        WHERE id = $2 AND company_id = $3`,
        [delta, bankAccountId, companyId],
      );
      return;
    }
    await this.bankRepo.query(
      `UPDATE bank_accounts
          SET balance = balance + $1,
              available_balance = balance + $1
        WHERE id = $2 AND company_id = $3`,
      [delta, bankAccountId, companyId],
    );
  }

  /**
   * Concepto 38: cuenta contraria de la transferencia en la misma moneda.
   * Con dos cuentas en esa moneda es la otra; con más de dos, el movimiento
   * solo corre entre la corriente (`checking`) y la de gastos mayorista
   * (`expenses`). Devuelve null si no hay contraria válida.
   */
  private async findTransferCounterpart(
    companyId: number,
    bank: BankAccount,
    manager?: EntityManager,
  ): Promise<BankAccount | null> {
    const bankRepo = manager ? manager.getRepository(BankAccount) : this.bankRepo;
    const sameCurrency = await bankRepo.find({
      where: { companyId, currency: bank.currency, status: 'active' },
      order: { isDefault: 'DESC', createdAt: 'ASC' },
    });
    const others = sameCurrency.filter((b) => b.id !== bank.id);
    if (!others.length) return null;
    if (sameCurrency.length <= 2) return others[0];

    const target =
      bank.accountType === 'checking'
        ? 'expenses'
        : bank.accountType === 'expenses'
          ? 'checking'
          : null;
    if (!target) return null;
    return others.find((b) => b.accountType === target) ?? null;
  }

  /**
   * Resuelve la cuenta contraria de una transferencia ya registrada: primero
   * por `counterpartyBank` (número de cuenta guardado al crearla) y, si ya no
   * existe, por la regla corriente ↔ gastos vigente.
   */
  private async resolveStoredTransferCounterpart(
    companyId: number,
    counterpartyBank: string | null,
    bankAccountId: string,
    manager?: EntityManager,
  ): Promise<BankAccount | null> {
    const bankRepo = manager ? manager.getRepository(BankAccount) : this.bankRepo;
    if (counterpartyBank) {
      const stored = await bankRepo.findOneBy({
        companyId,
        accountNumber: counterpartyBank,
      });
      if (stored) return stored;
    }
    const bank = await bankRepo.findOneBy({ id: bankAccountId, companyId });
    return bank ? this.findTransferCounterpart(companyId, bank, manager) : null;
  }

  /** Tipo de comprobante del espejo: el equivalente de sentido opuesto. */
  private mirrorTransactionCode(code: string | null): string {
    const map: Record<string, string> = {
      'Transferencia Electrónica Recibida': 'Transferencia Electrónica Emitida',
      'Otros cobros': 'Otros pagos',
      'Transferencia Electrónica Emitida': 'Transferencia Electrónica Recibida',
      'Otros pagos': 'Otros cobros',
    };
    return map[code ?? ''] ?? 'Transferencia entre cuentas';
  }

  /** Busca el comprobante espejo vinculado a `tx` (concepto 38), en cualquier sentido. */
  private async findTransferLinked(
    companyId: number,
    tx: BankTransaction,
    manager?: EntityManager,
  ): Promise<BankTransaction | null> {
    const txRepo = manager ? manager.getRepository(BankTransaction) : this.txRepo;
    if (tx.linkedTransactionId) {
      const linked = await txRepo.findOneBy({ id: tx.linkedTransactionId, companyId });
      if (linked) return linked;
    }
    return txRepo.findOneBy({ linkedTransactionId: tx.id, companyId });
  }

  /**
   * Crea el comprobante espejo del concepto 38 en la cuenta contraria:
   * mismo monto, tipo opuesto y enlace mutuo con el original.
   */
  private async createTransferMirror(
    companyId: number,
    tx: BankTransaction,
    txBank: BankAccount,
    counterpart: BankAccount,
    manager?: EntityManager,
  ): Promise<BankTransaction> {
    const txRepo = manager ? manager.getRepository(BankTransaction) : this.txRepo;
    const prefix = tx.transactionType === 'credit' ? 'TEE' : 'TER';
    const transactionNumber = await this.sequenceService.nextFormatted(
      companyId,
      `bank-transaction-${prefix}`,
      prefix,
      { manager },
    );
    const mirror = txRepo.create({
      companyId,
      bankAccountId: counterpart.id,
      transactionNumber,
      transactionDate: tx.transactionDate,
      transactionType: tx.transactionType === 'credit' ? 'debit' : 'credit',
      amount: tx.amount,
      currency: tx.currency,
      exchangeRate: tx.exchangeRate,
      description: `Transferencia ${tx.transactionNumber}`,
      referenceNumber: tx.transactionNumber,
      transactionCode: this.mirrorTransactionCode(tx.transactionCode),
      counterpartConceptCode: BANK_TRANSFER_CONCEPT,
      counterpartyBank: txBank.accountNumber,
      counterpartyName: tx.counterpartyName,
      notes: tx.notes,
      linkedTransactionId: tx.id,
      sourceModule: 'transfer',
    });
    return txRepo.save(mirror);
  }

  /** Alinea el espejo con los datos vigentes del comprobante original. */
  private async updateTransferMirror(
    mirror: BankTransaction,
    tx: BankTransaction,
    txBank: BankAccount,
    counterpart: BankAccount,
    manager: EntityManager,
  ): Promise<void> {
    const txRepo = manager.getRepository(BankTransaction);
    mirror.bankAccountId = counterpart.id;
    mirror.transactionType = tx.transactionType === 'credit' ? 'debit' : 'credit';
    mirror.transactionCode = this.mirrorTransactionCode(tx.transactionCode);
    mirror.transactionDate = tx.transactionDate;
    mirror.amount = tx.amount;
    mirror.currency = tx.currency;
    mirror.exchangeRate = tx.exchangeRate;
    mirror.description = `Transferencia ${tx.transactionNumber}`;
    mirror.referenceNumber = tx.transactionNumber;
    mirror.counterpartyBank = txBank.accountNumber;
    mirror.counterpartyName = tx.counterpartyName;
    mirror.notes = tx.notes;
    mirror.operationStatus = 'edited';
    await txRepo.save(mirror);
  }

  /**
   * Crea una transacción bancaria.
   *
   * Dependiendo del `transactionCode`:
   *   - 'Carga Inicial' → exige `counterpartyAccount` (cuenta contable del
   *     nomenclador) y no usa conceptos.
   *   - Otros (TER, OC, TEE, OP) → exigen `counterpartConceptCode` del
   *     catálogo de conceptos y validan la dirección contra `transactionType`.
   *
   * Si llega `accountReceivableId`, además se liquida la obligación de cobro
   * (se crea el `Payment` y se actualiza la CxC + la factura origen) dentro de
   * la misma transacción de BD.
   */
  /**
   * Los conceptos 28, 80 y 81 no se usan en ingresos bancarios. Solo se
   * valida al elegir el concepto, así los comprobantes antiguos que ya lo
   * tienen siguen pudiéndose editar.
   */
  private assertConceptAllowedInBank(
    concept: CounterpartConcept,
    transactionType: string,
  ): void {
    if (transactionType === 'credit' && BANK_INCOME_EXCLUDED_CONCEPTS.has(concept.code)) {
      throw new BadRequestException(
        `El concepto ${concept.code} — ${concept.name} no se registra en Banco - Ingreso` +
          (concept.code === '28' ? '; liquide el anticipo desde Cobros anticipados.' : '; regístrelo en Caja.'),
      );
    }
  }

  async createBankTransaction(companyId: number, data: any, manager?: EntityManager) {
    if (manager) {
      return this.createBankTransactionInTx(companyId, data, manager);
    }
    return this.dataSource.transaction((mgr) =>
      this.createBankTransactionInTx(companyId, data, mgr),
    );
  }

  private async createBankTransactionInTx(
    companyId: number,
    data: any,
    manager: EntityManager,
  ) {
    const ba = await this.findOneBankAccount(companyId, data.bankAccountId, manager);

    const transactionCode = data.transactionCode as string | undefined;
    const isOpeningEntry = transactionCode === OPENING_ENTRY_CODE;

    let concept: CounterpartConcept | null = null;

    if (isOpeningEntry) {
      // Carga Inicial: se elige cuenta contable del nomenclador.
      if (!data.counterpartyAccount || !String(data.counterpartyAccount).trim()) {
        throw new BadRequestException(
          'Seleccione una cuenta contable para la Carga Inicial',
        );
      }
    } else {
      // Otros comprobantes: se elige concepto de contrapartida.
      const conceptCode: string | undefined = data.counterpartConceptCode;
      if (!conceptCode) {
        throw new BadRequestException('Debe seleccionar un concepto de contrapartida');
      }
      concept = await this.findOneCounterpartConcept(conceptCode);
      if (!concept) {
        throw new BadRequestException(
          `El concepto de contrapartida "${conceptCode}" no existe o no está activo`,
        );
      }
      const expectedDirection = data.transactionType === 'credit' ? 'income' : 'expense';
      if (concept.direction !== 'both' && concept.direction !== expectedDirection) {
        throw new BadRequestException(
          `El concepto "${concept.name}" no aplica a este tipo de comprobante`,
        );
      }
      this.assertConceptAllowedInBank(concept, data.transactionType);
      if (
        THIRD_PARTY_REQUIRED_CONCEPTS.has(concept.code) &&
        !String(data.counterpartyName ?? '').trim()
      ) {
        throw new BadRequestException(
          `El concepto "${concept.name}" requiere indicar el ${concept.requiresSupplier ? 'proveedor' : 'cliente'}`,
        );
      }
    }

    const VOUCHER_PREFIXES: Record<string, string> = {
      'Carga Inicial': 'CI',
      'Transferencia Electrónica Recibida': 'TER',
      'Otros cobros': 'OC',
      'Transferencia Electrónica Emitida': 'TEE',
      'Otros pagos': 'OP',
    };
    const prefix = VOUCHER_PREFIXES[transactionCode || ''] || 'TXB';
    const transactionNumber =
      data.transactionNumber ||
      (await this.sequenceService.nextFormatted(
        companyId,
        `bank-transaction-${prefix}`,
        prefix,
        { manager },
      ));

    const isIncomeAccount = INCOME_ACCOUNT_CONCEPTS.has(concept?.code ?? '');
    const online = isIncomeAccount
      ? await this.validateOnlinePayment(companyId, data, concept?.code ?? '')
      : { incomeAccount: null, incomeAmount: null, feeAccount: null, feeAmount: null, incomeSubaccount: null, feeSubaccount: null };
    // El monto que entra al banco es el neto: ingreso menos comisión (concepto 19).
    if (isIncomeAccount) {
      data.amount = Math.round((Number(online.incomeAmount) - Number(online.feeAmount)) * 100) / 100;
    }

    // Concepto 38: la cuenta contraria en la misma moneda se mueve en
    // sentido opuesto (corriente ↔ gastos cuando hay más de dos cuentas).
    let transferCounterpart: BankAccount | null = null;
    if (concept?.code === BANK_TRANSFER_CONCEPT) {
      transferCounterpart = await this.findTransferCounterpart(companyId, ba, manager);
      if (!transferCounterpart) {
        throw new BadRequestException(
          'El concepto 38 transfiere entre cuentas propias en la misma moneda; si hay más de dos, solo entre la corriente y la de gastos',
        );
      }
    }

    const txRepo = manager.getRepository(BankTransaction);
    const tx = txRepo.create({
      ...pick(data, BANK_TRANSACTION_FIELDS),
      ...online,
      counterpartConceptCode: concept?.code ?? null,
      counterpartyAccount: data.counterpartyAccount ?? null,
      counterpartyName: data.counterpartyName ?? null,
      counterpartyBank: transferCounterpart?.accountNumber ?? null,
      transactionNumber,
      description: data.description || transactionCode || data.transactionType,
      transactionDate: data.transactionDate || new Date().toISOString().split('T')[0],
      currency: data.currency || 'CUP',
      exchangeRate: data.exchangeRate ?? 1,
      companyId,
      bankAccountId: ba.id,
      sourceModule: BANK_TX_SOURCE_MODULES.has(data.sourceModule)
        ? data.sourceModule
        : 'manual',
    });
    const saved = await txRepo.save(tx);

    await this.applyBankBalanceDelta(
      companyId,
      ba.id,
      data.transactionType === 'credit'
        ? Number(data.amount)
        : -Number(data.amount),
      manager,
    );

    if (transferCounterpart) {
      await this.applyBankBalanceDelta(
        companyId,
        transferCounterpart.id,
        data.transactionType === 'credit'
          ? -Number(data.amount)
          : Number(data.amount),
        manager,
      );
      const mirror = await this.createTransferMirror(
        companyId,
        saved,
        ba,
        transferCounterpart,
        manager,
      );
      saved.linkedTransactionId = mirror.id;
      await txRepo.save(saved);
      await this.createBankTransferVoucher(companyId, saved, ba, transferCounterpart, manager);
    }

    if (isOpeningEntry) {
      await this.createOpeningEntryVoucher(companyId, saved, manager);
    }
    if (isIncomeAccount) {
      await this.createOnlinePaymentVoucher(companyId, saved, manager);
    }
    if (saved.counterpartConceptCode && ADVANCE_CONCEPTS.has(saved.counterpartConceptCode)) {
      await this.createAdvanceVoucher(companyId, saved, manager);
    }

    if (data.accountReceivableId) {
      await this.settleReceivableFromBankTransaction(companyId, saved, data, manager);
    }
    if (data.accountPayableId) {
      await this.settlePayableFromBankTransaction(companyId, saved, data, manager);
    }

    return saved;
  }

  /**
   * Liquida una CxC a partir de un comprobante bancario de ingreso.
   *
   * - Valida que la obligación exista, pertenezca a la empresa y esté pendiente.
   * - Valida que el monto no exceda el saldo pendiente.
   * - Crea el `Payment` (ligado por `referenceNumber` al comprobante).
   * - Actualiza paidAmount / balanceAmount / status / lastPaymentDate.
   * - Sincroniza el estado de la factura origen (la marca como pagada).
   * - Genera el voucher contable (Débito Banco / Crédito CxC).
   *
   * Todo dentro del `manager` de la transacción del llamador.
   */
  private async settleReceivableFromBankTransaction(
    companyId: number,
    bankTx: BankTransaction,
    data: any,
    manager: EntityManager,
  ): Promise<void> {
    const arRepo = manager.getRepository(AccountReceivable);
    const paymentRepo = manager.getRepository(Payment);

    const ar = await arRepo.findOne({
      where: { id: data.accountReceivableId, companyId },
    });
    if (!ar) {
      throw new NotFoundException('Obligación de cobro no encontrada');
    }
    if (['paid', 'written_off', 'cancelled'].includes(ar.status)) {
      const label =
        ar.status === 'paid'
          ? 'cobrada'
          : ar.status === 'written_off'
            ? 'dada de baja'
            : 'cancelada';
      throw new BadRequestException(`La obligación ${ar.arNumber} ya está ${label}`);
    }

    const amount = Number(bankTx.amount);
    if (amount - Number(ar.balanceAmount) > 0.01) {
      throw new BadRequestException(
        `El monto (${amount.toFixed(2)}) excede el saldo pendiente de ` +
          `${ar.arNumber} (${Number(ar.balanceAmount).toFixed(2)})`,
      );
    }

    const paymentNumber = await this.sequenceService.nextFormatted(
      companyId,
      'payment',
      'PAG',
      { manager },
    );

    const payment = paymentRepo.create({
      companyId,
      paymentNumber,
      paymentDate: bankTx.transactionDate,
      paymentType: 'receivable' as any,
      paymentMethod: 'bank_transfer' as any,
      amount,
      currency: bankTx.currency,
      exchangeRate: bankTx.exchangeRate,
      description: `Cobro desde comprobante ${bankTx.transactionNumber}`,
      referenceNumber: bankTx.transactionNumber,
      bankAccountId: bankTx.bankAccountId,
      accountReceivableId: ar.id,
      status: 'completed' as any,
    } as Partial<Payment>);
    await paymentRepo.save(payment);

    ar.paidAmount = Math.round((Number(ar.paidAmount) + amount) * 100) / 100;
    ar.balanceAmount =
      Math.round((Number(ar.originalAmount) - Number(ar.paidAmount)) * 100) / 100;
    ar.lastPaymentDate = bankTx.transactionDate;
    ar.lastPaymentAmount = amount;
    ar.status = (ar.balanceAmount <= 0.009 ? 'paid' : 'partial') as any;
    await arRepo.save(ar);

    await this.syncInvoiceStatusFromReceivable(companyId, ar, manager);

    try {
      await this.createPaymentVoucher(
        companyId,
        payment,
        {
          paymentType: 'receivable',
          paymentMethod: 'bank_transfer',
          amount,
          paymentDate: bankTx.transactionDate,
          description: this.receivablePaymentDescription(ar, bankTx.transactionNumber),
          counterpartReference: this.receivableReference(ar),
          performedBy: 'Sistema',
        },
        manager,
      );
    } catch (error) {
      this.logger.error(
        `Error generando voucher para Payment ${payment.paymentNumber}: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }

    this.logger.log(
      `CxC ${ar.arNumber} liquidada por $${amount.toFixed(2)} desde ` +
        `BankTransaction ${bankTx.transactionNumber}`,
    );
  }

  /**
   * Liquida una CxP a partir de un comprobante bancario de egreso
   * (concepto 21). Es el equivalente de
   * {@link settleReceivableFromBankTransaction} para obligaciones de pago:
   * crea el `Payment` ligado por `referenceNumber` al comprobante, rebaja la
   * obligación y genera el voucher contable (Débito CxP / Crédito Banco).
   */
  private async settlePayableFromBankTransaction(
    companyId: number,
    bankTx: BankTransaction,
    data: any,
    manager: EntityManager,
  ): Promise<void> {
    const apRepo = manager.getRepository(AccountPayable);
    const paymentRepo = manager.getRepository(Payment);

    const ap = await apRepo.findOne({
      where: { id: data.accountPayableId, companyId },
    });
    if (!ap) {
      throw new NotFoundException('Obligación de pago no encontrada');
    }
    if (['paid', 'cancelled'].includes(ap.status)) {
      throw new BadRequestException(
        `La obligación ${ap.apNumber} ya está ${ap.status === 'paid' ? 'saldada' : 'anulada'}`,
      );
    }

    const amount = Number(bankTx.amount);
    if (amount - Number(ap.balanceAmount) > 0.01) {
      throw new BadRequestException(
        `El monto (${amount.toFixed(2)}) excede el saldo pendiente de ` +
          `${ap.apNumber} (${Number(ap.balanceAmount).toFixed(2)})`,
      );
    }

    const paymentNumber = await this.sequenceService.nextFormatted(
      companyId,
      'payment',
      'PAG',
      { manager },
    );

    const payment = paymentRepo.create({
      companyId,
      paymentNumber,
      paymentDate: bankTx.transactionDate,
      paymentType: 'payable' as any,
      paymentMethod: 'bank_transfer' as any,
      amount,
      currency: bankTx.currency,
      exchangeRate: bankTx.exchangeRate,
      description: `Pago desde comprobante ${bankTx.transactionNumber}`,
      referenceNumber: bankTx.transactionNumber,
      bankAccountId: bankTx.bankAccountId,
      accountPayableId: ap.id,
      status: 'completed' as any,
    } as Partial<Payment>);
    await paymentRepo.save(payment);

    ap.paidAmount = Math.round((Number(ap.paidAmount) + amount) * 100) / 100;
    ap.balanceAmount =
      Math.round((Number(ap.originalAmount) - Number(ap.paidAmount)) * 100) / 100;
    ap.lastPaymentDate = bankTx.transactionDate;
    ap.lastPaymentAmount = amount;
    ap.status = (ap.balanceAmount <= 0.009 ? 'paid' : 'partial') as any;
    await apRepo.save(ap);

    try {
      await this.createPaymentVoucher(
        companyId,
        payment,
        {
          paymentType: 'payable',
          paymentMethod: 'bank_transfer',
          amount,
          paymentDate: bankTx.transactionDate,
          description: `Pago CxP ${ap.apNumber} (comp. ${bankTx.transactionNumber})`,
          counterpartAccount: ap.accountCode || undefined,
          counterpartReference: ap.supplierNit || ap.supplierName,
          bankAccountId: bankTx.bankAccountId,
          performedBy: 'Sistema',
        },
        manager,
      );
    } catch (error) {
      this.logger.error(
        `Error generando voucher para Payment ${payment.paymentNumber}: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }

    this.logger.log(
      `CxP ${ap.apNumber} liquidada por $${amount.toFixed(2)} desde ` +
        `BankTransaction ${bankTx.transactionNumber}`,
    );
  }

  /**
   * Comprobante contable de una Carga Inicial: lleva a Contabilidad el saldo
   * que el negocio ya tenía en el banco antes de comenzar a usar el sistema.
   *   Ingreso → Débito: cuenta contable del banco · Crédito: contrapartida.
   */
  private async createOpeningEntryVoucher(
    companyId: number,
    tx: BankTransaction,
    manager: EntityManager,
  ): Promise<void> {
    if (!tx.counterpartyAccount) {
      throw new BadRequestException('Seleccione una cuenta contable para la Carga Inicial');
    }
    const ba = await manager.getRepository(BankAccount).findOneBy({ id: tx.bankAccountId, companyId });
    if (!ba) throw new NotFoundException('Cuenta bancaria no encontrada');

    const bankAccountCode = this.bankAccountingCode(ba);

    // Contabilidad se lleva en CUP: las cuentas en USD se convierten a la tasa
    // indicada en la Carga Inicial.
    const isUsd = ba.currency === 'USD';
    const rate = isUsd ? Number(tx.exchangeRate) : 1;
    if (isUsd && !(rate > 1)) {
      throw new BadRequestException(
        `La Carga Inicial ${tx.transactionNumber} es de una cuenta en USD: indique la tasa de cambio`,
      );
    }
    const amount = Math.round(Number(tx.amount) * rate * 100) / 100;
    const isCredit = tx.transactionType === 'credit';
    const bankLabel = `${ba.bankName} - ${ba.accountNumber}`;
    const bankLine = {
      accountCode: bankAccountCode,
      debit: isCredit ? amount : 0,
      credit: isCredit ? 0 : amount,
      description: isUsd
        ? `Carga inicial ${bankLabel} (${Number(tx.amount).toFixed(2)} USD x ${rate})`
        : `Carga inicial ${bankLabel}`,
    };
    const counterpartLine = {
      accountCode: tx.counterpartyAccount,
      debit: isCredit ? 0 : amount,
      credit: isCredit ? amount : 0,
      description: tx.notes || `Carga inicial ${bankLabel}`,
      ...(tx.incomeSubaccount ? { subaccountCode: tx.incomeSubaccount, subaccountName: tx.incomeSubaccountName } : {}),
    };

    await this.voucherService.createVoucherFromModule(
      companyId,
      'finance',
      tx.id,
      {
        date: tx.transactionDate,
        description: `Carga inicial ${tx.transactionNumber} - ${bankLabel}`,
        type: 'ajuste',
        reference: tx.transactionNumber,
        createdBy: 'Sistema',
        lines: isCredit ? [bankLine, counterpartLine] : [counterpartLine, bankLine],
      },
      manager,
    );
  }

  /**
   * Valida los conceptos con cuenta de ingreso del nomenclador: el 19
   * (Ingresos por Pago en Línea) pide además la cuenta de gasto de la
   * comisión; el 22 (Ingresos de comedores) y el 23 (Ingresos de cafetería)
   * solo la cuenta de ingreso y, opcionalmente, su subcuenta.
   */
  private async validateOnlinePayment(companyId: number, data: any, conceptCode: string) {
    // Concepto 19 (Pago en Línea): la cuenta de ingreso queda fijada en la
    // 900 y la de gasto (comisión) en la 835; el usuario elige las
    // subcuentas de ambas. El 22 propone la 950 y el 23 deja libre la
    // cuenta de ingreso; en ambos se puede elegir su subcuenta.
    const requireFee = conceptCode === ONLINE_PAYMENT_CONCEPT;
    const incomeAccount = requireFee
      ? ONLINE_PAYMENT_INCOME_ACCOUNT
      : String(data.incomeAccount ?? '').trim() || DEFAULT_INCOME_ACCOUNT[conceptCode] || '';
    const incomeSubaccount = String(data.incomeSubaccount ?? '').trim() || null;
    const feeAccount = requireFee ? ONLINE_PAYMENT_FEE_ACCOUNT : null;
    let feeSubaccount = requireFee ? String(data.feeSubaccount ?? '').trim() || null : null;
    const incomeAmount = Math.round(Number(data.incomeAmount) * 100) / 100;
    const feeAmount = requireFee ? Math.round(Number(data.feeAmount || 0) * 100) / 100 : 0;

    if (!incomeAccount) throw new BadRequestException('Seleccione la cuenta de ingreso');
    if (!(incomeAmount > 0)) throw new BadRequestException('Indique el importe del ingreso');
    if (requireFee) {
      if (!feeAccount) throw new BadRequestException('Seleccione la cuenta de gasto de la comisión');
      if (feeAmount < 0) throw new BadRequestException('La comisión no puede ser negativa');
      if (feeAmount >= incomeAmount) {
        throw new BadRequestException('La comisión debe ser menor que el importe del ingreso');
      }
    }

    const accountRepo = this.dataSource.getRepository(Account);
    const checks: [string, string, string][] = [[incomeAccount, 'income', 'de ingreso']];
    if (feeAccount) checks.push([feeAccount, 'expense', 'de gasto']);
    for (const [code, type, label] of checks) {
      const account = await accountRepo.findOneBy({ companyId, code });
      if (!account) {
        throw new BadRequestException(`La cuenta ${code} no existe en el nomenclador de la empresa`);
      }
      if (account.type !== type) {
        throw new BadRequestException(`La cuenta ${code} - ${account.name} no es una cuenta ${label}`);
      }
    }

    // Las subcuentas son cuentas de nivel 4 del nomenclador (`<cuenta>-<sufijo>`).
    const subaccountName = async (subCode: string | null, parentCode: string) => {
      if (!subCode) return null;
      const sub = await accountRepo.findOneBy({ companyId, code: subCode });
      if (!sub || sub.parentCode !== parentCode) {
        throw new BadRequestException(`La subcuenta ${subCode} no existe o no pertenece a la ${parentCode}`);
      }
      return sub.name;
    };

    // Si la 835 está subdividida y no se eligió subcuenta, la comisión va a
    // la 835-0010 (Gastos por comisiones bancarias).
    if (feeAccount && !feeSubaccount) {
      const defaultFee = await accountRepo.findOneBy({ companyId, code: ONLINE_PAYMENT_DEFAULT_FEE_SUBACCOUNT });
      if (defaultFee) feeSubaccount = defaultFee.code;
    }

    const incomeSubaccountName = await subaccountName(incomeSubaccount, incomeAccount);
    const feeSubaccountName = feeAccount ? await subaccountName(feeSubaccount, feeAccount) : null;

    return { incomeAccount, incomeAmount, feeAccount, feeAmount, incomeSubaccount, incomeSubaccountName, feeSubaccount, feeSubaccountName };
  }

  /**
   * Comprobante del concepto 19 (Ingresos por Pago en Línea). El banco
   * descuenta su comisión del cobro, por lo que:
   *   Débito:  cuenta del banco (neto) + cuenta de gasto (comisión)
   *   Crédito: cuenta de ingreso (importe bruto)
   */
  /**
   * Comprobante de los conceptos anticipados 26/27:
   *   26 Cobro anticipado  → Débito banco / Crédito contrapartida (430 + subcuenta)
   *   27 Pago anticipado   → Débito contrapartida / Crédito banco
   */
  private async createAdvanceVoucher(
    companyId: number,
    tx: BankTransaction,
    manager: EntityManager,
  ): Promise<void> {
    // El 26 siempre acredita la 430 (Cobros anticipados); el 27 debita la
    // cuenta elegida por el usuario.
    const counterpartCode =
      tx.counterpartConceptCode === '26' ? '430' : tx.counterpartyAccount;
    if (!counterpartCode) {
      throw new BadRequestException('Indique la cuenta contable de la contrapartida');
    }
    const ba = await manager.getRepository(BankAccount).findOneBy({ id: tx.bankAccountId, companyId });
    if (!ba) throw new NotFoundException('Cuenta bancaria no encontrada');
    const bankAccountCode = this.bankAccountingCode(ba);

    const isUsd = ba.currency === 'USD';
    const rate = isUsd ? Number(tx.exchangeRate) : 1;
    if (isUsd && !(rate > 1)) {
      throw new BadRequestException(
        `El comprobante ${tx.transactionNumber} es de una cuenta en USD: indique la tasa de cambio`,
      );
    }
    const isCredit = tx.transactionType === 'credit';
    const amount = Math.round(Number(tx.amount) * rate * 100) / 100;
    const bankLabel = `${ba.bankName} - ${ba.accountNumber}`;
    const concept = tx.counterpartConceptCode
      ? await this.findOneCounterpartConcept(tx.counterpartConceptCode)
      : null;
    const conceptName = concept?.name || 'Anticipado';

    const subaccountFields = tx.incomeSubaccount
      ? { subaccountCode: tx.incomeSubaccount, subaccountName: tx.incomeSubaccountName }
      : {};

    await this.voucherService.createVoucherFromModule(
      companyId,
      'finance',
      tx.id,
      {
        date: tx.transactionDate,
        description: `${conceptName} ${tx.transactionNumber} - ${bankLabel}`,
        type: 'ajuste',
        reference: tx.transactionNumber,
        createdBy: 'Sistema',
        lines: [
          {
            accountCode: bankAccountCode,
            debit: isCredit ? amount : 0,
            credit: isCredit ? 0 : amount,
            description: `${conceptName} ${bankLabel}`,
          },
          {
            accountCode: counterpartCode,
            debit: isCredit ? 0 : amount,
            credit: isCredit ? amount : 0,
            description: tx.notes || `${conceptName} ${tx.transactionNumber}`,
            ...subaccountFields,
          },
        ],
      },
      manager,
    );
  }

  private async createOnlinePaymentVoucher(
    companyId: number,
    tx: BankTransaction,
    manager: EntityManager,
  ): Promise<void> {
    if (!tx.incomeAccount) {
      throw new BadRequestException('Indique la cuenta de ingreso');
    }
    const ba = await manager.getRepository(BankAccount).findOneBy({ id: tx.bankAccountId, companyId });
    if (!ba) throw new NotFoundException('Cuenta bancaria no encontrada');
    const bankAccountCode = this.bankAccountingCode(ba);
    const concept = tx.counterpartConceptCode
      ? await this.findOneCounterpartConcept(tx.counterpartConceptCode)
      : null;
    const conceptName = concept?.name || 'Ingreso por pago en línea';

    const isUsd = ba.currency === 'USD';
    const rate = isUsd ? Number(tx.exchangeRate) : 1;
    if (isUsd && !(rate > 1)) {
      throw new BadRequestException(
        `El comprobante ${tx.transactionNumber} es de una cuenta en USD: indique la tasa de cambio`,
      );
    }
    const toCup = (v: number) => Math.round(Number(v) * rate * 100) / 100;
    const income = toCup(Number(tx.incomeAmount));
    const fee = toCup(Number(tx.feeAmount || 0));
    const net = Math.round((income - fee) * 100) / 100;

    const bankLabel = `${ba.bankName} - ${ba.accountNumber}`;
    const customer = tx.counterpartyName || null;
    const lines: any[] = [
      {
        accountCode: bankAccountCode,
        debit: net,
        credit: 0,
        description: `${conceptName} neto ${bankLabel}`,
      },
    ];
    if (fee > 0 && tx.feeAccount) {
      lines.push({
        accountCode: tx.feeAccount,
        debit: fee,
        credit: 0,
        description: `Comisión bancaria ${tx.transactionNumber}`,
        ...(tx.feeSubaccount ? { subaccountCode: tx.feeSubaccount, subaccountName: tx.feeSubaccountName } : {}),
      });
    }
    lines.push({
      accountCode: tx.incomeAccount,
      debit: 0,
      credit: income,
      description: tx.notes || `${conceptName} ${tx.transactionNumber}`,
      reference: customer,
      ...(tx.incomeSubaccount ? { subaccountCode: tx.incomeSubaccount, subaccountName: tx.incomeSubaccountName } : {}),
    });

    await this.voucherService.createVoucherFromModule(
      companyId,
      'finance',
      tx.id,
      {
        date: tx.transactionDate,
        description: `${conceptName} ${tx.transactionNumber}${customer ? ` - ${customer}` : ''}`,
        type: 'recibo',
        reference: tx.transactionNumber,
        createdBy: 'Sistema',
        lines,
      },
      manager,
    );
  }

  /**
   * Comprobante del concepto 38 (transferencias entre cuentas propias):
   *   Débito:  cuenta contable del banco que recibe los fondos
   *   Crédito: cuenta contable del banco que los entrega
   * Un solo comprobante por par; se ancla en el comprobante operado.
   */
  private async createBankTransferVoucher(
    companyId: number,
    tx: BankTransaction,
    txBank: BankAccount,
    counterpart: BankAccount,
    manager: EntityManager,
  ): Promise<void> {
    const isCredit = tx.transactionType === 'credit';
    const debitCode = this.bankAccountingCode(isCredit ? txBank : counterpart);
    const creditCode = this.bankAccountingCode(isCredit ? counterpart : txBank);

    const isUsd = txBank.currency === 'USD';
    const rate = isUsd ? Number(tx.exchangeRate) : 1;
    if (isUsd && !(rate > 1)) {
      throw new BadRequestException(
        `El comprobante ${tx.transactionNumber} es de una cuenta en USD: indique la tasa de cambio`,
      );
    }
    const amount = Math.round(Number(tx.amount) * rate * 100) / 100;

    const txLabel = `${txBank.bankName} - ${txBank.accountNumber}`;
    const cpLabel = `${counterpart.bankName} - ${counterpart.accountNumber}`;
    const [destLabel, srcLabel] = isCredit ? [txLabel, cpLabel] : [cpLabel, txLabel];

    await this.voucherService.createVoucherFromModule(
      companyId,
      'finance',
      tx.id,
      {
        date: tx.transactionDate,
        description: `Transferencia ${tx.transactionNumber} de ${srcLabel} a ${destLabel}`,
        type: 'ajuste',
        reference: tx.transactionNumber,
        createdBy: 'Sistema',
        lines: [
          {
            accountCode: debitCode,
            debit: amount,
            credit: 0,
            description: `Transferencia recibida ${destLabel}`,
          },
          {
            accountCode: creditCode,
            debit: 0,
            credit: amount,
            description: `Transferencia emitida ${srcLabel}`,
          },
        ],
      },
      manager,
    );
  }

  /**
   * Genera el comprobante contable de las Cargas Iniciales registradas antes
   * de que existiera la contabilización automática. Omite las que ya tienen
   * un comprobante vigente y procesa cada una en su propia transacción, de
   * modo que un error (p. ej. período no abierto) no bloquee a las demás.
   */
  async generateMissingOpeningVouchers(companyId: number) {
    const openings = await this.txRepo.find({
      where: { companyId, transactionCode: OPENING_ENTRY_CODE },
      order: { transactionDate: 'ASC' },
    });

    const created: string[] = [];
    const errors: { transactionNumber: string; message: string }[] = [];
    let skipped = 0;

    for (const tx of openings) {
      if (tx.parentTransactionId) continue;
      if (tx.operationStatus === 'cancelled') continue;
      const existing = await this.voucherService.findVouchersBySourceDocumentId(companyId, tx.id, 'finance');
      if (existing.some((v) => v.status !== 'cancelled')) {
        skipped++;
        continue;
      }
      try {
        await this.dataSource.transaction((mgr) => this.createOpeningEntryVoucher(companyId, tx, mgr));
        created.push(tx.transactionNumber);
      } catch (error) {
        errors.push({
          transactionNumber: tx.transactionNumber,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { created, skipped, errors };
  }

  /**
   * Devuelve la CxC vinculada al comprobante bancario (vía el `Payment` con
   * `referenceNumber = transactionNumber`). Devuelve `null` si no hay vínculo.
   */
  async getLinkedReceivable(companyId: number, txId: string) {
    const tx = await this.txRepo.findOneBy({ id: txId, companyId });
    if (!tx) throw new NotFoundException('Transacción no encontrada');

    const payment = await this.paymentRepo.findOne({
      where: {
        companyId,
        referenceNumber: tx.transactionNumber,
        paymentType: 'receivable' as any,
      },
    });
    if (!payment?.accountReceivableId) return null;

    const ar = await this.arRepo.findOne({
      where: { id: payment.accountReceivableId, companyId },
    });
    if (!ar) return null;

    return {
      paymentId: payment.id,
      paymentNumber: payment.paymentNumber,
      paymentAmount: Number(payment.amount),
      accountReceivable: ar,
    };
  }

  /**
   * Devuelve la CxP vinculada al comprobante bancario de egreso (vía el
   * `Payment` con `referenceNumber = transactionNumber`). Equivalente de
   * {@link getLinkedReceivable} para obligaciones de pago.
   */
  async getLinkedPayable(companyId: number, txId: string) {
    const tx = await this.txRepo.findOneBy({ id: txId, companyId });
    if (!tx) throw new NotFoundException('Transacción no encontrada');

    const payment = await this.paymentRepo.findOne({
      where: {
        companyId,
        referenceNumber: tx.transactionNumber,
        paymentType: 'payable' as any,
      },
    });
    if (!payment?.accountPayableId) return null;

    const ap = await this.apRepo.findOne({
      where: { id: payment.accountPayableId, companyId },
    });
    if (!ap) return null;

    return {
      paymentId: payment.id,
      paymentNumber: payment.paymentNumber,
      paymentAmount: Number(payment.amount),
      accountPayable: ap,
    };
  }

  /**
   * Revierte el `Payment` de una liquidación de CxC:
   *  - Restaura `paidAmount` / `balanceAmount` / `status` de la CxC.
   *  - Sincroniza el estado de la factura origen.
   *  - Cancela los vouchers asociados al `Payment`.
   *  - Elimina el `Payment`.
   */
  private async revertLinkedReceivablePayment(
    companyId: number,
    payment: Payment,
    manager: EntityManager,
  ): Promise<void> {
    await this.revertPaymentObligation(companyId, payment, manager);
    await this.cancelPaymentVouchers(companyId, payment, manager);
    await manager.getRepository(Payment).remove(payment);
  }

  private async cancelPaymentVouchers(
    companyId: number,
    payment: Payment,
    manager: EntityManager,
  ): Promise<void> {
    await this.cancelSourceVouchers(companyId, payment.id, `Payment ${payment.paymentNumber}`, manager);
  }

  private async cancelSourceVouchers(
    companyId: number,
    sourceDocumentId: string,
    label: string,
    manager: EntityManager,
  ): Promise<void> {
    await this.cancelFinanceVouchers(companyId, sourceDocumentId, manager, label);
  }

  /**
   * Anula los vouchers vigentes ligados a un documento y devuelve su estado
   * previo, para que una restauración posterior los devuelva a draft o a
   * posted según correspondiera.
   */
  private async cancelFinanceVouchers(
    companyId: number,
    sourceDocumentId: string,
    manager: EntityManager,
    label?: string,
  ): Promise<{ id: string; status: string }[]> {
    const cancelled: { id: string; status: string }[] = [];
    try {
      const vouchers = await this.voucherService.findVouchersBySourceDocumentId(
        companyId,
        sourceDocumentId,
        'finance',
      );
      for (const voucher of vouchers) {
        if (voucher.status === 'cancelled') continue;
        cancelled.push({ id: voucher.id, status: voucher.status });
        await this.voucherService.updateVoucherStatus(
          companyId,
          voucher.id,
          'cancelled',
          manager,
        );
      }
    } catch (error) {
      this.logger.warn(
        `No se pudieron cancelar los vouchers de ${label ?? sourceDocumentId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    return cancelled;
  }

  /**
   * Revierte la obligación (CxC o CxP) que un `Payment` había saldado:
   * restaura `paidAmount` / `balanceAmount` / `status` y, para CxC,
   * sincroniza el estado de la factura origen.
   */
  private async revertPaymentObligation(
    companyId: number,
    payment: Payment,
    manager: EntityManager,
  ): Promise<void> {
    const amount = Number(payment.amount);
    if (payment.accountReceivableId) {
      const arRepo = manager.getRepository(AccountReceivable);
      const ar = await arRepo.findOne({
        where: { id: payment.accountReceivableId, companyId },
      });
      if (ar) {
        ar.paidAmount = Math.max(
          0,
          Math.round((Number(ar.paidAmount) - amount) * 100) / 100,
        );
        ar.balanceAmount =
          Math.round((Number(ar.originalAmount) - Number(ar.paidAmount)) * 100) / 100;
        ar.status = (
          ar.balanceAmount <= 0.009
            ? 'paid'
            : Number(ar.paidAmount) > 0
              ? 'partial'
              : 'pending'
        ) as any;
        await arRepo.save(ar);
        await this.syncInvoiceStatusFromReceivable(companyId, ar, manager);
      }
    }
    if (payment.accountPayableId) {
      const apRepo = manager.getRepository(AccountPayable);
      const ap = await apRepo.findOne({
        where: { id: payment.accountPayableId, companyId },
      });
      if (ap) {
        ap.paidAmount = Math.max(
          0,
          Math.round((Number(ap.paidAmount) - amount) * 100) / 100,
        );
        ap.balanceAmount =
          Math.round((Number(ap.originalAmount) - Number(ap.paidAmount)) * 100) / 100;
        ap.status = (
          ap.balanceAmount <= 0.009
            ? 'paid'
            : Number(ap.paidAmount) > 0
              ? 'partial'
              : 'pending'
        ) as any;
        await apRepo.save(ap);
      }
    }
  }

  /**
   * Re-aplica la obligación (CxC o CxP) de un `Payment` restaurado: es la
   * operación inversa de {@link revertPaymentObligation}.
   */
  private async applyPaymentObligation(
    companyId: number,
    payment: Payment,
    manager: EntityManager,
  ): Promise<void> {
    const amount = Number(payment.amount);
    if (payment.accountReceivableId) {
      const arRepo = manager.getRepository(AccountReceivable);
      const ar = await arRepo.findOne({
        where: { id: payment.accountReceivableId, companyId },
      });
      if (ar) {
        ar.paidAmount =
          Math.round((Number(ar.paidAmount) + amount) * 100) / 100;
        ar.balanceAmount =
          Math.round((Number(ar.originalAmount) - Number(ar.paidAmount)) * 100) / 100;
        ar.lastPaymentDate = payment.paymentDate;
        ar.lastPaymentAmount = amount;
        ar.status = (
          ar.balanceAmount <= 0.009
            ? 'paid'
            : Number(ar.paidAmount) > 0
              ? 'partial'
              : 'pending'
        ) as any;
        await arRepo.save(ar);
        await this.syncInvoiceStatusFromReceivable(companyId, ar, manager);
      }
    }
    if (payment.accountPayableId) {
      const apRepo = manager.getRepository(AccountPayable);
      const ap = await apRepo.findOne({
        where: { id: payment.accountPayableId, companyId },
      });
      if (ap) {
        ap.paidAmount =
          Math.round((Number(ap.paidAmount) + amount) * 100) / 100;
        ap.balanceAmount =
          Math.round((Number(ap.originalAmount) - Number(ap.paidAmount)) * 100) / 100;
        ap.lastPaymentDate = payment.paymentDate;
        ap.lastPaymentAmount = amount;
        ap.status = (
          ap.balanceAmount <= 0.009
            ? 'paid'
            : Number(ap.paidAmount) > 0
              ? 'partial'
              : 'pending'
        ) as any;
        await apRepo.save(ap);
      }
    }
  }

  /**
   * Anula el voucher vigente de un cobro de CxC y genera uno nuevo con los
   * datos actuales del `Payment` (banco vinculado, importe y fecha).
   */
  private async regenerateReceivablePaymentVoucher(
    companyId: number,
    payment: Payment,
    manager: EntityManager,
  ): Promise<void> {
    const ar = payment.accountReceivableId
      ? await manager.getRepository(AccountReceivable).findOne({
          where: { id: payment.accountReceivableId, companyId },
        })
      : null;
    await this.cancelPaymentVouchers(companyId, payment, manager);
    await this.createPaymentVoucher(
      companyId,
      payment,
      {
        paymentType: 'receivable',
        paymentMethod: payment.paymentMethod || 'bank_transfer',
        amount: Number(payment.amount),
        paymentDate: payment.paymentDate,
        description: ar
          ? this.receivablePaymentDescription(ar, payment.referenceNumber || payment.paymentNumber)
          : payment.description,
        counterpartReference: ar ? this.receivableReference(ar) : undefined,
        bankAccountId: payment.bankAccountId,
        performedBy: 'Sistema',
      },
      manager,
    );
  }

  /**
   * Identificación del cliente en el submayor de la 135. Debe coincidir con la
   * que usa el reconocimiento de la CxC al facturar (NIT → id → nombre) para
   * que el cobro, total o parcial, disminuya el saldo del mismo cliente.
   */
  private receivableReference(ar: AccountReceivable): string {
    return ar.customerNit || ar.customerId || ar.customerName;
  }

  /** Descripción del cobro: indica si es parcial y el saldo que queda pendiente. */
  private receivablePaymentDescription(ar: AccountReceivable, document: string): string {
    const balance = Number(ar.balanceAmount);
    return balance > 0.009
      ? `Cobro parcial CxC ${ar.arNumber} (comp. ${document}) - saldo pendiente ${balance.toFixed(2)}`
      : `Cobro CxC ${ar.arNumber} (comp. ${document})`;
  }

  /**
   * Ajusta el monto del `Payment` existente (misma CxP) cuando el usuario solo
   * cambió el importe del comprobante, sin tocar la obligación vinculada.
   */
  private async updateLinkedPayablePaymentAmount(
    companyId: number,
    payment: Payment,
    tx: BankTransaction,
    manager: EntityManager,
  ): Promise<void> {
    const apRepo = manager.getRepository(AccountPayable);
    const paymentRepo = manager.getRepository(Payment);

    const ap = await apRepo.findOne({
      where: { id: payment.accountPayableId!, companyId },
    });
    if (!ap) return;

    const oldAmount = Number(payment.amount);
    const newAmount = Number(tx.amount);
    const delta = newAmount - oldAmount;

    const projectedBalance = Number(ap.balanceAmount) - delta;
    if (projectedBalance < -0.01) {
      throw new BadRequestException(
        `El nuevo monto (${newAmount.toFixed(2)}) excede el saldo disponible ` +
          `de la CxP ${ap.apNumber} (${Number(ap.balanceAmount).toFixed(2)})`,
      );
    }

    ap.paidAmount =
      Math.round((Number(ap.paidAmount) + delta) * 100) / 100;
    ap.balanceAmount =
      Math.round((Number(ap.originalAmount) - Number(ap.paidAmount)) * 100) / 100;
    ap.lastPaymentAmount = newAmount;
    ap.lastPaymentDate = tx.transactionDate;
    ap.status = (
      ap.balanceAmount <= 0.009
        ? 'paid'
        : Number(ap.paidAmount) > 0
          ? 'partial'
          : 'pending'
    ) as any;
    await apRepo.save(ap);

    payment.amount = newAmount;
    payment.paymentDate = tx.transactionDate;
    await paymentRepo.save(payment);

    this.logger.log(
      `Payment ${payment.paymentNumber} actualizado a $${newAmount.toFixed(2)} ` +
        `(CxP ${ap.apNumber}) desde comprobante ${tx.transactionNumber}`,
    );
  }

  /**
   * Anula el voucher vigente de un pago de CxP y genera uno nuevo con los
   * datos actuales del `Payment` (banco vinculado, importe y fecha).
   */
  private async regeneratePayablePaymentVoucher(
    companyId: number,
    payment: Payment,
    manager: EntityManager,
  ): Promise<void> {
    const ap = payment.accountPayableId
      ? await manager.getRepository(AccountPayable).findOne({
          where: { id: payment.accountPayableId, companyId },
        })
      : null;
    await this.cancelPaymentVouchers(companyId, payment, manager);
    await this.createPaymentVoucher(
      companyId,
      payment,
      {
        paymentType: 'payable',
        paymentMethod: payment.paymentMethod || 'bank_transfer',
        amount: Number(payment.amount),
        paymentDate: payment.paymentDate,
        description: payment.description,
        counterpartAccount: ap?.accountCode || undefined,
        counterpartReference: ap ? ap.supplierNit || ap.supplierName : undefined,
        bankAccountId: payment.bankAccountId,
        performedBy: 'Sistema',
      },
      manager,
    );
  }

  /**
   * Ajusta el monto del `Payment` existente (misma CxC) cuando el usuario solo
   * cambió el importe del comprobante, sin tocar la obligación vinculada.
   */
  private async updateLinkedReceivablePaymentAmount(
    companyId: number,
    payment: Payment,
    tx: BankTransaction,
    manager: EntityManager,
  ): Promise<void> {
    if (!payment.accountReceivableId) return;

    const arRepo = manager.getRepository(AccountReceivable);
    const paymentRepo = manager.getRepository(Payment);

    const ar = await arRepo.findOne({
      where: { id: payment.accountReceivableId, companyId },
    });
    if (!ar) return;

    const oldAmount = Number(payment.amount);
    const newAmount = Number(tx.amount);
    const delta = newAmount - oldAmount;

    const projectedBalance = Number(ar.balanceAmount) - delta;
    if (projectedBalance < -0.01) {
      throw new BadRequestException(
        `El nuevo monto (${newAmount.toFixed(2)}) excede el saldo disponible ` +
          `de la CxC ${ar.arNumber} (${Number(ar.balanceAmount).toFixed(2)})`,
      );
    }

    ar.paidAmount =
      Math.round((Number(ar.paidAmount) + delta) * 100) / 100;
    ar.balanceAmount =
      Math.round((Number(ar.originalAmount) - Number(ar.paidAmount)) * 100) / 100;
    ar.lastPaymentAmount = newAmount;
    ar.lastPaymentDate = tx.transactionDate;
    ar.status = (
      ar.balanceAmount <= 0.009
        ? 'paid'
        : Number(ar.paidAmount) > 0
          ? 'partial'
          : 'pending'
    ) as any;
    await arRepo.save(ar);

    await this.syncInvoiceStatusFromReceivable(companyId, ar, manager);

    payment.amount = newAmount;
    payment.paymentDate = tx.transactionDate;
    await paymentRepo.save(payment);

    this.logger.log(
      `Payment ${payment.paymentNumber} actualizado a $${newAmount.toFixed(2)} ` +
        `(CxC ${ar.arNumber}) desde comprobante ${tx.transactionNumber}`,
    );
  }

  /**
   * Los comprobantes generados automáticamente por otras operaciones no se
   * editan ni anulan en Finanzas: se corrigen desde la operación de origen
   * (misma regla que `vouchers.source_module !== 'manual'` en Contabilidad).
   * Al anular/eliminar se admite además el origen 'payment', porque la
   * anulación revierte el pago completo con su obligación.
   *
   * Los anticipos (conceptos 26/27) aunque se registran en Finanzas tampoco
   * se anulan aquí: solo se cancelan al liquidarlos contra una obligación
   * del mismo cliente o proveedor.
   */
  private assertBankTransactionMutable(
    tx: BankTransaction,
    action: 'editar' | 'eliminar' | 'anular',
  ): void {
    if (tx.operationStatus === 'cancelled') {
      throw new BadRequestException(
        `El comprobante ${tx.transactionNumber} ya está anulado.`,
      );
    }
    if (tx.reconciled) {
      throw new BadRequestException(
        `No se puede ${action} un comprobante conciliado en banco.`,
      );
    }
    if (
      action !== 'editar' &&
      ADVANCE_CONCEPTS.has(tx.counterpartConceptCode ?? '') &&
      Number(tx.advanceAppliedAmount || 0) > 0.009
    ) {
      throw new BadRequestException(
        `El anticipo ${tx.transactionNumber} tiene liquidaciones aplicadas a ` +
          'obligaciones del tercero; deshágalas antes de anularlo.',
      );
    }
    const source = tx.sourceModule || 'manual';
    if (source === 'manual' || (action !== 'editar' && source === 'payment')) {
      return;
    }
    const origins: Record<string, string> = {
      payment: 'un pago o cobro registrado',
      payroll: 'un pago de nómina',
      'fixed-assets': 'una operación de activos fijos',
      transfer: 'una transferencia entre cuentas (es el espejo)',
      reversal: 'un reverso de comprobante',
      cash: 'un depósito desde Caja',
    };
    throw new BadRequestException(
      `Este comprobante fue generado por ${origins[source] ?? `el módulo "${source}"`} ` +
        `y no puede ${action}se en Finanzas. Anule la operación de origen.`,
    );
  }

  /**
   * Actualiza una transacción bancaria.
   *
   * - Si el `transactionCode` resultante es 'Carga Inicial', exige
   *   `counterpartyAccount` y limpia `counterpartConceptCode`.
   * - En otro caso valida el concepto (si cambió) y limpia `counterpartyAccount`.
   * - Si cambia el `bankAccountId`, revierte el saldo en el banco original,
   *   lo aplica en el nuevo y actualiza `Payment.bankAccountId` si había
   *   un Payment vinculado.
   * - Si cambia el monto con la misma CxC, ajusta `paidAmount`/`balanceAmount`.
   * - Si cambia/quita la CxC, revierte el `Payment` anterior y, si hay nueva,
   *   crea la liquidación.
   *
   * Todo dentro de una transacción de BD.
   */
  async updateBankTransaction(companyId: number, id: string, data: any) {
    return this.dataSource.transaction(async (manager) => {
      const txRepo = manager.getRepository(BankTransaction);
      const tx = await txRepo.findOneBy({ id, companyId });
      if (!tx) throw new NotFoundException('Transacción no encontrada');

      this.assertBankTransactionMutable(tx, 'editar');

      // Un comprobante ya reversado no puede editarse: su efecto en el saldo
      // quedó fijado por el par original/reverso.
      const reversal = await txRepo.findOneBy({
        parentTransactionId: tx.id,
        companyId,
      });
      if (reversal) {
        throw new BadRequestException(
          `El comprobante ya fue reversado por ${reversal.transactionNumber}; no puede editarse.`,
        );
      }

      const effectiveCode = data.transactionCode ?? tx.transactionCode ?? '';
      const isOpeningEntry = effectiveCode === OPENING_ENTRY_CODE;
      const wasOpeningEntry = tx.transactionCode === OPENING_ENTRY_CODE;
      const wasOnlinePayment = !wasOpeningEntry && INCOME_ACCOUNT_CONCEPTS.has(tx.counterpartConceptCode ?? '');
      const wasBankTransfer = !wasOpeningEntry && tx.counterpartConceptCode === BANK_TRANSFER_CONCEPT;
      const wasAdvance = !wasOpeningEntry && ADVANCE_CONCEPTS.has(tx.counterpartConceptCode ?? '');
      const previousCounterpartyBank = tx.counterpartyBank;
      // Datos que determinan el comprobante contable propio del movimiento
      // (Carga Inicial y pago en línea); si cambian, el comprobante se regenera.
      const voucherSnapshot = (t: BankTransaction) =>
        [
          t.transactionCode, t.counterpartConceptCode, t.bankAccountId, Number(t.amount),
          Number(t.exchangeRate), t.transactionDate, t.counterpartyAccount, t.counterpartyName, t.notes,
          t.incomeAccount, Number(t.incomeAmount || 0), t.feeAccount, Number(t.feeAmount || 0),
          t.counterpartyBank, t.incomeSubaccount, t.feeSubaccount,
        ].join('|');
      const previousSnapshot = voucherSnapshot(tx);

      if (isOpeningEntry) {
        const account = data.counterpartyAccount ?? tx.counterpartyAccount;
        if (!account || !String(account).trim()) {
          throw new BadRequestException(
            'Seleccione una cuenta contable para la Carga Inicial',
          );
        }
        tx.counterpartConceptCode = null;
        if (data.counterpartyAccount !== undefined) tx.counterpartyAccount = data.counterpartyAccount;
        if (data.counterpartyName !== undefined) tx.counterpartyName = data.counterpartyName;
      } else {
        if (data.counterpartConceptCode && data.counterpartConceptCode !== tx.counterpartConceptCode) {
          const concept = await this.findOneCounterpartConcept(data.counterpartConceptCode);
          if (!concept) {
            throw new BadRequestException(
              `El concepto de contrapartida "${data.counterpartConceptCode}" no existe o no está activo`,
            );
          }
          const expectedDirection = tx.transactionType === 'credit' ? 'income' : 'expense';
          if (concept.direction !== 'both' && concept.direction !== expectedDirection) {
            throw new BadRequestException(
              `El concepto "${concept.name}" no aplica a este tipo de comprobante`,
            );
          }
          this.assertConceptAllowedInBank(concept, tx.transactionType);
          tx.counterpartConceptCode = concept.code;
        }
        tx.counterpartyAccount = null;
        if (data.counterpartyName !== undefined) tx.counterpartyName = data.counterpartyName;
        if (
          THIRD_PARTY_REQUIRED_CONCEPTS.has(tx.counterpartConceptCode ?? '') &&
          !String(tx.counterpartyName ?? '').trim()
        ) {
          throw new BadRequestException(
            'Este concepto requiere indicar el cliente o proveedor',
          );
        }
      }

      // Conceptos con cuenta de ingreso: el monto al banco es el neto (ingreso - comisión).
      const isOnlinePayment = !isOpeningEntry && INCOME_ACCOUNT_CONCEPTS.has(tx.counterpartConceptCode ?? '');
      if (isOnlinePayment) {
        const merge = (k: string, prev: any) => (data[k] !== undefined ? data[k] : prev);
        const online = await this.validateOnlinePayment(
          companyId,
          {
            incomeAccount: merge('incomeAccount', tx.incomeAccount),
            incomeSubaccount: merge('incomeSubaccount', tx.incomeSubaccount),
            incomeAmount: merge('incomeAmount', tx.incomeAmount),
            feeAccount: merge('feeAccount', tx.feeAccount),
            feeSubaccount: merge('feeSubaccount', tx.feeSubaccount),
            feeAmount: merge('feeAmount', tx.feeAmount),
          },
          tx.counterpartConceptCode ?? '',
        );
        Object.assign(tx, online);
        data.amount = Math.round((online.incomeAmount - online.feeAmount) * 100) / 100;
      } else {
        Object.assign(tx, { incomeAccount: null, incomeAmount: null, feeAccount: null, feeAmount: null, incomeSubaccount: null, feeSubaccount: null });
      }

      // ── Saldo bancario: puede cambiar monto, banco, o ambos ──
      const oldBankId = tx.bankAccountId;
      const newBankId = data.bankAccountId ?? oldBankId;
      const bankChanged = newBankId !== oldBankId;

      if (bankChanged) {
        const newBankExists = await manager
          .getRepository(BankAccount)
          .findOneBy({ id: newBankId, companyId });
        if (!newBankExists) {
          throw new NotFoundException('Cuenta bancaria destino no encontrada');
        }
      }

      const sign = tx.transactionType === 'credit' ? 1 : -1;
      const oldSigned = sign * Number(tx.amount);
      const newAmount = data.amount != null ? Number(data.amount) : Number(tx.amount);
      const newSigned = sign * newAmount;

      if (!bankChanged) {
        if (newSigned !== oldSigned) {
          await this.applyBankBalanceDelta(
            companyId,
            oldBankId,
            newSigned - oldSigned,
            manager,
          );
        }
      } else {
        // Revertir en banco viejo, aplicar en banco nuevo.
        await this.applyBankBalanceDelta(companyId, oldBankId, -oldSigned, manager);
        await this.applyBankBalanceDelta(companyId, newBankId, newSigned, manager);
        tx.bankAccountId = newBankId;
      }

      // Concepto 38: revertir el efecto en la contraria anterior y aplicar
      // el efecto nuevo en la contraria vigente (siempre en sentido opuesto
      // a la cuenta seleccionada). Solo se revierte si hay evidencia de que
      // el efecto se aplicó (counterpartyBank o espejo vinculado).
      const isBankTransfer = !isOpeningEntry && tx.counterpartConceptCode === BANK_TRANSFER_CONCEPT;
      const isAdvance = !isOpeningEntry && ADVANCE_CONCEPTS.has(tx.counterpartConceptCode ?? '');
      const linkedTransfer = wasBankTransfer
        ? await this.findTransferLinked(companyId, tx, manager)
        : null;
      if (wasBankTransfer && (previousCounterpartyBank || linkedTransfer)) {
        const oldCp = await this.resolveStoredTransferCounterpart(
          companyId,
          previousCounterpartyBank,
          oldBankId,
          manager,
        );
        if (oldCp) {
          await this.applyBankBalanceDelta(companyId, oldCp.id, oldSigned, manager);
        }
      }
      let transferCounterpart: BankAccount | null = null;
      let transferNewBank: BankAccount | null = null;
      if (isBankTransfer) {
        transferNewBank = await manager
          .getRepository(BankAccount)
          .findOneBy({ id: newBankId, companyId });
        transferCounterpart = transferNewBank
          ? await this.findTransferCounterpart(companyId, transferNewBank, manager)
          : null;
        if (!transferCounterpart) {
          throw new BadRequestException(
            'El concepto 38 transfiere entre cuentas propias en la misma moneda; si hay más de dos, solo entre la corriente y la de gastos',
          );
        }
        await this.applyBankBalanceDelta(companyId, transferCounterpart.id, -newSigned, manager);
        tx.counterpartyBank = transferCounterpart.accountNumber;
      } else if (wasBankTransfer) {
        tx.counterpartyBank = null;
      }

      Object.assign(
        tx,
        pick(data, [
          'transactionDate', 'transactionCode', 'referenceNumber',
          'notes', 'description', 'exchangeRate',
        ] as const),
      );
      tx.amount = newAmount;
      tx.operationStatus = 'edited';
      const savedTx = await txRepo.save(tx);

      // Concepto 38: el espejo en la contraria sigue al comprobante.
      if (isBankTransfer && transferCounterpart && transferNewBank) {
        if (linkedTransfer) {
          await this.updateTransferMirror(
            linkedTransfer,
            savedTx,
            transferNewBank,
            transferCounterpart,
            manager,
          );
        } else {
          const mirror = await this.createTransferMirror(
            companyId,
            savedTx,
            transferNewBank,
            transferCounterpart,
            manager,
          );
          savedTx.linkedTransactionId = mirror.id;
          await txRepo.save(savedTx);
        }
      } else if (linkedTransfer) {
        await txRepo.remove(linkedTransfer);
        savedTx.linkedTransactionId = null;
        await txRepo.save(savedTx);
      }

      // Carga Inicial, pago en línea, transferencias y anticipos: mantener el
      // comprobante contable alineado con el banco.
      const hadOwnVoucher = wasOpeningEntry || wasOnlinePayment || wasBankTransfer || wasAdvance;
      const hasOwnVoucher = isOpeningEntry || isOnlinePayment || isBankTransfer || isAdvance;
      if ((hadOwnVoucher || hasOwnVoucher) && voucherSnapshot(savedTx) !== previousSnapshot) {
        await this.cancelSourceVouchers(companyId, savedTx.id, `BankTransaction ${savedTx.transactionNumber}`, manager);
        if (isOpeningEntry) await this.createOpeningEntryVoucher(companyId, savedTx, manager);
        if (isOnlinePayment) await this.createOnlinePaymentVoucher(companyId, savedTx, manager);
        if (isAdvance) await this.createAdvanceVoucher(companyId, savedTx, manager);
        if (isBankTransfer && transferCounterpart && transferNewBank) {
          await this.createBankTransferVoucher(companyId, savedTx, transferNewBank, transferCounterpart, manager);
        }
      }

      // Si cambió de banco, arrastrar el Payment vinculado (si existe).
      if (bankChanged) {
        const paymentRepo = manager.getRepository(Payment);
        const linkedPayments = await paymentRepo.find({
          where: {
            companyId,
            referenceNumber: savedTx.transactionNumber,
            paymentMethod: 'bank_transfer' as any,
          },
        });
        for (const linkedPayment of linkedPayments) {
          linkedPayment.bankAccountId = newBankId;
          await paymentRepo.save(linkedPayment);
        }
      }

      let voucherAlreadyFresh = false;

      // Sincronizar Payment/CxC si el cliente manipuló la obligación de cobro.
      if (data.accountReceivableId !== undefined) {
        const paymentRepo = manager.getRepository(Payment);
        const existingPayment = await paymentRepo.findOne({
          where: {
            companyId,
            referenceNumber: savedTx.transactionNumber,
            paymentType: 'receivable' as any,
          },
        });

        const newArId = data.accountReceivableId || null;
        const currentArId = existingPayment?.accountReceivableId || null;

        if (existingPayment && currentArId !== newArId) {
          await this.revertLinkedReceivablePayment(companyId, existingPayment, manager);
        }

        if (newArId) {
          const stillExisting = await paymentRepo.findOne({
            where: {
              companyId,
              referenceNumber: savedTx.transactionNumber,
              paymentType: 'receivable' as any,
            },
          });

          if (stillExisting) {
            if (Number(stillExisting.amount) !== Number(savedTx.amount)) {
              await this.updateLinkedReceivablePaymentAmount(
                companyId,
                stillExisting,
                savedTx,
                manager,
              );
            }
          } else {
            await this.settleReceivableFromBankTransaction(companyId, savedTx, data, manager);
            voucherAlreadyFresh = true;
          }
        }
      }

      // Sincronizar Payment/CxP si el cliente manipuló la obligación de pago
      // (concepto 21 en egresos, equivalente al 20 en ingresos).
      if (data.accountPayableId !== undefined) {
        const paymentRepo = manager.getRepository(Payment);
        const existingPayment = await paymentRepo.findOne({
          where: {
            companyId,
            referenceNumber: savedTx.transactionNumber,
            paymentType: 'payable' as any,
          },
        });

        const newApId = data.accountPayableId || null;
        const currentApId = existingPayment?.accountPayableId || null;

        if (existingPayment && currentApId !== newApId) {
          await this.revertLinkedReceivablePayment(companyId, existingPayment, manager);
        }

        if (newApId) {
          const stillExisting = await paymentRepo.findOne({
            where: {
              companyId,
              referenceNumber: savedTx.transactionNumber,
              paymentType: 'payable' as any,
            },
          });

          if (stillExisting) {
            if (Number(stillExisting.amount) !== Number(savedTx.amount)) {
              await this.updateLinkedPayablePaymentAmount(
                companyId,
                stillExisting,
                savedTx,
                manager,
              );
            }
          } else {
            await this.settlePayableFromBankTransaction(companyId, savedTx, data, manager);
            voucherAlreadyFresh = true;
          }
        }
      }

      if (!voucherAlreadyFresh && (bankChanged || newSigned !== oldSigned)) {
        const currentPayment = await manager.getRepository(Payment).findOne({
          where: {
            companyId,
            referenceNumber: savedTx.transactionNumber,
            paymentMethod: 'bank_transfer' as any,
          },
        });
        if (currentPayment?.accountReceivableId) {
          await this.regenerateReceivablePaymentVoucher(companyId, currentPayment, manager);
        } else if (currentPayment?.accountPayableId) {
          await this.regeneratePayablePaymentVoucher(companyId, currentPayment, manager);
        }
      }

      return savedTx;
    });
  }

  /**
   * Elimina una transacción bancaria y revierte todos sus efectos
   * (saldo bancario, CxC liquidada, Payment asociado y estado de la factura)
   * dentro de la misma transacción de BD.
   */
  async deleteBankTransaction(companyId: number, id: string) {
    return this.dataSource.transaction(async (manager) => {
      const txRepo = manager.getRepository(BankTransaction);
      const tx = await txRepo.findOneBy({ id, companyId });
      if (!tx) throw new NotFoundException('Transacción no encontrada');

      this.assertBankTransactionMutable(tx, 'eliminar');

      // Un comprobante ya reversado no puede eliminarse: su efecto en el
      // saldo ya fue neutralizado por el reverso y borrarlo lo duplicaría.
      const reversal = await txRepo.findOneBy({
        parentTransactionId: tx.id,
        companyId,
      });
      if (reversal) {
        throw new BadRequestException(
          `El comprobante ya fue reversado por ${reversal.transactionNumber}; no puede eliminarse.`,
        );
      }

      // 1) Revertir liquidación de CxC/CxP si el comprobante la originó.
      const paymentRepo = manager.getRepository(Payment);
      const linkedPayment = await paymentRepo.findOne({
        where: {
          companyId,
          referenceNumber: tx.transactionNumber,
          paymentMethod: 'bank_transfer' as any,
        },
      });

      if (linkedPayment?.accountReceivableId || linkedPayment?.accountPayableId) {
        await this.revertPaymentObligation(companyId, linkedPayment, manager);
        await this.cancelPaymentVouchers(companyId, linkedPayment, manager);
        await paymentRepo.remove(linkedPayment);
      }

      // 1b) Comprobante generado por un Payment (source_module='payment'):
      // revertir la obligación cobrada/pagada, anular su voucher y eliminar
      // el pago origen para que no queden restos contables.
      if (tx.sourceModule === 'payment' && tx.referenceNumber) {
        const originPayment = await paymentRepo.findOne({
          where: { companyId, paymentNumber: tx.referenceNumber },
        });
        if (originPayment) {
          await this.revertPaymentObligation(companyId, originPayment, manager);
          await this.cancelPaymentVouchers(companyId, originPayment, manager);
          await paymentRepo.remove(originPayment);
        }
      }

      // 2) Revertir saldo bancario y eliminar el comprobante.
      const delta =
        tx.transactionType === 'credit' ? -Number(tx.amount) : Number(tx.amount);
      await this.applyBankBalanceDelta(companyId, tx.bankAccountId, delta, manager);
      // Concepto 38: revertir también el movimiento en la cuenta contraria
      // y eliminar el comprobante espejo. Solo se revierte el saldo si hay
      // evidencia de que el efecto se aplicó (counterpartyBank o espejo).
      if (tx.counterpartConceptCode === BANK_TRANSFER_CONCEPT) {
        const linked = await this.findTransferLinked(companyId, tx, manager);
        if (tx.counterpartyBank || linked) {
          const counterpart = await this.resolveStoredTransferCounterpart(
            companyId,
            tx.counterpartyBank,
            tx.bankAccountId,
            manager,
          );
          if (counterpart) {
            await this.applyBankBalanceDelta(
              companyId,
              counterpart.id,
              -delta,
              manager,
            );
          }
        }
        if (linked) {
          await txRepo.remove(linked);
        }
      }
      if (tx.transactionCode === OPENING_ENTRY_CODE || INCOME_ACCOUNT_CONCEPTS.has(tx.counterpartConceptCode ?? '') || tx.counterpartConceptCode === BANK_TRANSFER_CONCEPT || (tx.counterpartConceptCode ? ADVANCE_CONCEPTS.has(tx.counterpartConceptCode) : false)) {
        await this.cancelSourceVouchers(companyId, tx.id, `BankTransaction ${tx.transactionNumber}`, manager);
      }
      await txRepo.remove(tx);

      return { deleted: true };
    });
  }

  /**
   * Anula un comprobante registrado en Finanzas revirtiendo todos sus
   * efectos (saldo bancario, espejo del concepto 38, comprobante contable,
   * liquidación de CxC y —si lo generó un Payment— el pago y su obligación),
   * sin borrar el registro. Guarda un snapshot de los estados previos para
   * que la anulación pueda deshacerse después, igual que en facturación.
   */
  async cancelBankTransaction(companyId: number, id: string) {
    return this.dataSource.transaction(async (manager) => {
      const txRepo = manager.getRepository(BankTransaction);
      const tx = await txRepo.findOneBy({ id, companyId });
      if (!tx) throw new NotFoundException('Transacción no encontrada');

      this.assertBankTransactionMutable(tx, 'anular');
      return this.cancelBankTransactionInTx(companyId, tx, manager);
    });
  }

  /**
   * Anula un comprobante bancario ya validado. Lo usa también Caja para el
   * ingreso que genera un depósito, que en Banco está bloqueado por su origen.
   */
  private async cancelBankTransactionInTx(
    companyId: number,
    tx: BankTransaction,
    manager: EntityManager,
  ) {
    {
      const txRepo = manager.getRepository(BankTransaction);
      if (tx.operationStatus === 'cancelled') {
        throw new BadRequestException(`El comprobante ${tx.transactionNumber} ya está anulado.`);
      }
      if (tx.reconciled) {
        throw new BadRequestException(
          `El comprobante ${tx.transactionNumber} está conciliado en banco y no puede anularse.`,
        );
      }

      // Un comprobante ya reversado no puede anularse: su efecto en el saldo
      // ya fue neutralizado por el reverso y anularlo lo duplicaría.
      const reversal = await txRepo.findOneBy({
        parentTransactionId: tx.id,
        companyId,
      });
      if (reversal) {
        throw new BadRequestException(
          `El comprobante ya fue reversado por ${reversal.transactionNumber}; no puede anularse.`,
        );
      }

      const snapshot = {
        prevStatus: tx.operationStatus,
        vouchers: [] as { id: string; status: string }[],
        payments: [] as {
          id: string;
          vouchers: { id: string; status: string }[];
        }[],
        mirror: undefined as { id: string; status: string } | undefined,
      };

      // 1) Comprobante contable propio (Carga Inicial, pago en línea,
      //    transferencia, anticipo): se anula registrando su estado previo.
      if (
        tx.transactionCode === OPENING_ENTRY_CODE ||
        INCOME_ACCOUNT_CONCEPTS.has(tx.counterpartConceptCode ?? '') ||
        tx.counterpartConceptCode === BANK_TRANSFER_CONCEPT ||
        ADVANCE_CONCEPTS.has(tx.counterpartConceptCode ?? '')
      ) {
        snapshot.vouchers = await this.cancelFinanceVouchers(
          companyId,
          tx.id,
          manager,
          `BankTransaction ${tx.transactionNumber}`,
        );
      }

      const paymentRepo = manager.getRepository(Payment);

      // 2) Liquidación de CxC/CxP originada por este comprobante: se revierte
      //    la obligación y el Payment queda anulado (no se borra, para restaurar).
      const linkedPayment = await paymentRepo.findOne({
        where: {
          companyId,
          referenceNumber: tx.transactionNumber,
          paymentMethod: 'bank_transfer' as any,
        },
      });
      if (linkedPayment?.accountReceivableId || linkedPayment?.accountPayableId) {
        await this.revertPaymentObligation(companyId, linkedPayment, manager);
        snapshot.payments.push({
          id: linkedPayment.id,
          vouchers: await this.cancelFinanceVouchers(
            companyId,
            linkedPayment.id,
            manager,
            `Payment ${linkedPayment.paymentNumber}`,
          ),
        });
        linkedPayment.status = 'cancelled';
        await paymentRepo.save(linkedPayment);
      }

      // 3) Comprobante generado por un Payment (source_module='payment'):
      //    se anula el pago origen con su obligación.
      if (tx.sourceModule === 'payment' && tx.referenceNumber) {
        const originPayment = await paymentRepo.findOne({
          where: { companyId, paymentNumber: tx.referenceNumber },
        });
        if (originPayment && originPayment.status !== 'cancelled') {
          await this.revertPaymentObligation(companyId, originPayment, manager);
          snapshot.payments.push({
            id: originPayment.id,
            vouchers: await this.cancelFinanceVouchers(
              companyId,
              originPayment.id,
              manager,
              `Payment ${originPayment.paymentNumber}`,
            ),
          });
          originPayment.status = 'cancelled';
          await paymentRepo.save(originPayment);
        }
      }

      // 4) Saldo bancario y, en el concepto 38, la contraria y el espejo.
      const delta =
        tx.transactionType === 'credit' ? -Number(tx.amount) : Number(tx.amount);
      await this.applyBankBalanceDelta(companyId, tx.bankAccountId, delta, manager);
      if (tx.counterpartConceptCode === BANK_TRANSFER_CONCEPT) {
        const linked = await this.findTransferLinked(companyId, tx, manager);
        if (tx.counterpartyBank || linked) {
          const counterpart = await this.resolveStoredTransferCounterpart(
            companyId,
            tx.counterpartyBank,
            tx.bankAccountId,
            manager,
          );
          if (counterpart) {
            await this.applyBankBalanceDelta(
              companyId,
              counterpart.id,
              -delta,
              manager,
            );
          }
        }
        if (linked) {
          snapshot.mirror = { id: linked.id, status: linked.operationStatus };
          linked.operationStatus = 'cancelled';
          await txRepo.save(linked);
        }
      }

      tx.operationStatus = 'cancelled';
      tx.cancelSnapshot = snapshot;
      await txRepo.save(tx);

      return { cancelled: true };
    }
  }

  /**
   * Deshace la anulación de un comprobante: restaura saldos, espejo,
   * comprobantes contables y pagos al estado registrado en el snapshot.
   * Equivalente al "anular cancelación" de facturación.
   */
  async restoreBankTransactionAnnulment(companyId: number, id: string) {
    return this.dataSource.transaction(async (manager) => {
      const txRepo = manager.getRepository(BankTransaction);
      const tx = await txRepo.findOneBy({ id, companyId });
      if (!tx) throw new NotFoundException('Transacción no encontrada');
      // El ingreso de un depósito desde Caja se restaura desde Caja.
      if (tx.sourceModule === 'cash') {
        throw new BadRequestException(
          `El comprobante ${tx.transactionNumber} lo generó un depósito desde Caja; deshaga la anulación en Caja.`,
        );
      }
      return this.restoreBankTransactionInTx(companyId, tx, manager);
    });
  }

  private async restoreBankTransactionInTx(
    companyId: number,
    tx: BankTransaction,
    manager: EntityManager,
  ) {
    {
      const txRepo = manager.getRepository(BankTransaction);
      if (tx.operationStatus !== 'cancelled') {
        throw new BadRequestException(
          `Solo se puede deshacer la anulación de un comprobante anulado (${tx.transactionNumber})`,
        );
      }

      const snap = tx.cancelSnapshot || {
        prevStatus: 'edited',
        vouchers: [],
        payments: [],
      };

      // 1) Vouchers propios → su estado previo (posted re-aplica saldos).
      for (const entry of snap.vouchers || []) {
        await this.voucherService.updateVoucherStatus(
          companyId,
          entry.id,
          entry.status,
          manager,
        );
      }

      // 2) Pagos anulados → 'completed', obligación re-aplicada y sus
      //    vouchers restaurados a su estado previo.
      const paymentRepo = manager.getRepository(Payment);
      for (const ref of snap.payments || []) {
        const payment = await paymentRepo.findOne({
          where: { id: ref.id, companyId },
        });
        if (!payment || payment.status !== 'cancelled') continue;
        for (const entry of ref.vouchers || []) {
          await this.voucherService.updateVoucherStatus(
            companyId,
            entry.id,
            entry.status,
            manager,
          );
        }
        payment.status = 'completed';
        await paymentRepo.save(payment);
        await this.applyPaymentObligation(companyId, payment, manager);
      }

      // 3) Saldo bancario y, en el concepto 38, la contraria y el espejo.
      const delta =
        tx.transactionType === 'credit' ? Number(tx.amount) : -Number(tx.amount);
      await this.applyBankBalanceDelta(companyId, tx.bankAccountId, delta, manager);
      if (tx.counterpartConceptCode === BANK_TRANSFER_CONCEPT) {
        if (tx.counterpartyBank || snap.mirror) {
          const counterpart = await this.resolveStoredTransferCounterpart(
            companyId,
            tx.counterpartyBank,
            tx.bankAccountId,
            manager,
          );
          if (counterpart) {
            await this.applyBankBalanceDelta(
              companyId,
              counterpart.id,
              -delta,
              manager,
            );
          }
        }
        const mirror = snap.mirror?.id
          ? await txRepo.findOneBy({ id: snap.mirror.id, companyId })
          : await this.findTransferLinked(companyId, tx, manager);
        if (mirror) {
          mirror.operationStatus = (snap.mirror?.status as any) || 'edited';
          await txRepo.save(mirror);
        }
      }

      tx.operationStatus = (snap.prevStatus as any) || 'edited';
      tx.cancelSnapshot = null;
      await txRepo.save(tx);

      return { restored: true };
    }
  }

  // ══════════════════════════════════════════════════════════
  // ── LIQUIDACIÓN DE ANTICIPOS (conceptos 26/27) ──
  // ══════════════════════════════════════════════════════════

  /**
   * Liquida una obligación (CxC o CxP) aplicando un anticipo del mismo
   * tercero, sin movimiento de banco:
   *
   * - Cobro anticipado (26) → CxC:  Débito 430-subcuenta / Crédito CxC.
   * - Pago anticipado (27)  → CxP:  Débito CxP / Crédito cuenta del anticipo.
   *
   * Crea el `Payment` de enlace (`paymentMethod='advance'`, `referenceNumber`
   * = número del anticipo), rebaja la obligación y descuenta el monto del
   * anticipo en `advance_applied_amount`. La aplicación puede ser parcial.
   */
  async applyAdvanceToObligation(
    companyId: number,
    advanceTxId: string,
    data: {
      accountReceivableId?: string;
      accountPayableId?: string;
      amount?: number;
      paymentDate?: string;
      performedBy?: string;
    },
  ) {
    return this.dataSource.transaction(async (manager) => {
      const txRepo = manager.getRepository(BankTransaction);
      const tx = await txRepo.findOneBy({ id: advanceTxId, companyId });
      if (!tx) throw new NotFoundException('Anticipo no encontrado');
      if (tx.operationStatus === 'cancelled') {
        throw new BadRequestException(
          `El anticipo ${tx.transactionNumber} está anulado`,
        );
      }

      const isReceivableAdvance = tx.counterpartConceptCode === '26';
      const isPayableAdvance = tx.counterpartConceptCode === '27';
      if (!isReceivableAdvance && !isPayableAdvance) {
        throw new BadRequestException(
          'El comprobante no es un anticipo (conceptos 26/27)',
        );
      }
      if (isReceivableAdvance && !data.accountReceivableId) {
        throw new BadRequestException(
          'Un cobro anticipado solo se liquida contra una cuenta por cobrar',
        );
      }
      if (isPayableAdvance && !data.accountPayableId) {
        throw new BadRequestException(
          'Un pago anticipado solo se liquida contra una cuenta por pagar',
        );
      }

      const advancePending =
        Math.round(
          (Number(tx.amount) - Number(tx.advanceAppliedAmount || 0)) * 100,
        ) / 100;
      if (advancePending <= 0.009) {
        throw new BadRequestException(
          `El anticipo ${tx.transactionNumber} ya está totalmente liquidado`,
        );
      }

      const norm = (v?: string | null) => (v || '').trim().toLowerCase();
      const thirdParty = norm(tx.counterpartyName);

      let obligationLabel: string;
      let obligationBalance: number;
      let creditAccountCode: string;
      let debitAccountCode: string;
      let counterpartReference: string | undefined;
      let ar: AccountReceivable | null = null;
      let ap: AccountPayable | null = null;

      if (isReceivableAdvance) {
        ar = await manager.getRepository(AccountReceivable).findOne({
          where: { id: data.accountReceivableId, companyId },
        });
        if (!ar) throw new NotFoundException('Obligación de cobro no encontrada');
        if (['paid', 'written_off', 'cancelled'].includes(ar.status)) {
          throw new BadRequestException(
            `La CxC ${ar.arNumber} ya está saldada o anulada`,
          );
        }
        if (
          thirdParty &&
          norm(ar.customerName) !== thirdParty &&
          norm(ar.customerNit) !== thirdParty &&
          norm(ar.customerId) !== thirdParty
        ) {
          throw new BadRequestException(
            `El anticipo ${tx.transactionNumber} es de "${tx.counterpartyName}" ` +
              `y la CxC ${ar.arNumber} de "${ar.customerName}"`,
          );
        }
        obligationLabel = ar.arNumber;
        obligationBalance = Number(ar.balanceAmount);
        debitAccountCode = '430';
        creditAccountCode =
          (await this.accountMappingService.getAccountForMapping(
            companyId,
            MappingType.INVOICE_RECEIVABLE,
          )) || '135';
        counterpartReference = ar.customerNit || ar.customerId || ar.customerName;
      } else {
        ap = await manager.getRepository(AccountPayable).findOne({
          where: { id: data.accountPayableId, companyId },
        });
        if (!ap) throw new NotFoundException('Obligación de pago no encontrada');
        if (['paid', 'cancelled'].includes(ap.status)) {
          throw new BadRequestException(
            `La CxP ${ap.apNumber} ya está ${ap.status === 'paid' ? 'saldada' : 'anulada'}`,
          );
        }
        if (
          thirdParty &&
          norm(ap.supplierName) !== thirdParty &&
          norm(ap.supplierNit) !== thirdParty
        ) {
          throw new BadRequestException(
            `El anticipo ${tx.transactionNumber} es de "${tx.counterpartyName}" ` +
              `y la CxP ${ap.apNumber} de "${ap.supplierName}"`,
          );
        }
        obligationLabel = ap.apNumber;
        obligationBalance = Number(ap.balanceAmount);
        debitAccountCode = ap.accountCode || '410';
        creditAccountCode = tx.counterpartyAccount!;
        counterpartReference = ap.supplierNit || ap.supplierName;
      }

      const applied = Math.min(
        data.amount != null ? Number(data.amount) : advancePending,
        advancePending,
        obligationBalance,
      );
      if (!(applied > 0)) {
        throw new BadRequestException(
          'El monto a aplicar debe ser mayor que cero',
        );
      }

      const paymentRepo = manager.getRepository(Payment);
      const paymentNumber = await this.sequenceService.nextFormatted(
        companyId,
        'payment',
        'PAG',
        { manager },
      );
      const payment = paymentRepo.create({
        companyId,
        paymentNumber,
        paymentDate:
          data.paymentDate || new Date().toISOString().split('T')[0],
        paymentType: isReceivableAdvance ? 'receivable' : 'payable',
        paymentMethod: 'advance',
        amount: applied,
        currency: tx.currency,
        exchangeRate: tx.exchangeRate,
        description: `Aplicación anticipo ${tx.transactionNumber} a ${obligationLabel}`,
        referenceNumber: tx.transactionNumber,
        accountReceivableId: isReceivableAdvance ? ar!.id : null,
        accountPayableId: isPayableAdvance ? ap!.id : null,
        status: 'completed',
        paidBy: data.performedBy || 'Sistema',
      } as Partial<Payment>);
      await paymentRepo.save(payment);

      await this.applyPaymentObligation(companyId, payment, manager);

      const advanceSub = tx.incomeSubaccount
        ? {
            subaccountCode: tx.incomeSubaccount,
            subaccountName: tx.incomeSubaccountName,
          }
        : {};
      const lines = isReceivableAdvance
        ? [
            {
              accountCode: debitAccountCode,
              debit: applied,
              credit: 0,
              description: `Aplicación anticipo ${tx.transactionNumber}`,
              ...advanceSub,
            },
            {
              accountCode: creditAccountCode,
              debit: 0,
              credit: applied,
              description: `Liquidación CxC ${obligationLabel} con anticipo`,
              reference: counterpartReference,
            },
          ]
        : [
            {
              accountCode: debitAccountCode,
              debit: applied,
              credit: 0,
              description: `Liquidación CxP ${obligationLabel} con anticipo`,
              reference: counterpartReference,
            },
            {
              accountCode: creditAccountCode,
              debit: 0,
              credit: applied,
              description: `Aplicación anticipo ${tx.transactionNumber}`,
              ...advanceSub,
            },
          ];

      await this.voucherService.createVoucherFromModule(
        companyId,
        'finance',
        payment.id,
        {
          date: payment.paymentDate,
          description: `Liquidación anticipo ${tx.transactionNumber} → ${obligationLabel}`,
          type: 'ajuste',
          reference: payment.paymentNumber,
          createdBy: data.performedBy || 'Sistema',
          lines,
        },
        manager,
      );

      tx.advanceAppliedAmount =
        Math.round(
          (Number(tx.advanceAppliedAmount || 0) + applied) * 100,
        ) / 100;
      await txRepo.save(tx);

      return {
        payment,
        applied,
        advancePending:
          Math.round((Number(tx.amount) - Number(tx.advanceAppliedAmount)) * 100) / 100,
      };
    });
  }

  /**
   * Deshace una liquidación por anticipo: revierte la obligación, anula el
   * voucher de traspaso, cancela el `Payment` de enlace y devuelve el saldo
   * aplicado al anticipo origen.
   */
  async cancelAdvanceApplication(companyId: number, paymentId: string) {
    return this.dataSource.transaction(async (manager) => {
      const paymentRepo = manager.getRepository(Payment);
      const payment = await paymentRepo.findOne({
        where: { id: paymentId, companyId },
      });
      if (!payment) throw new NotFoundException('Pago no encontrado');
      if (payment.paymentMethod !== 'advance') {
        throw new BadRequestException(
          'Solo se pueden deshacer liquidaciones realizadas con anticipos',
        );
      }
      if (payment.status !== 'completed') {
        throw new BadRequestException('La liquidación ya está deshecha');
      }

      await this.revertPaymentObligation(companyId, payment, manager);
      await this.cancelPaymentVouchers(companyId, payment, manager);
      payment.status = 'cancelled';
      await paymentRepo.save(payment);

      // Devolver el saldo aplicado al anticipo origen.
      const txRepo = manager.getRepository(BankTransaction);
      const advance = await txRepo.findOne({
        where: { companyId, transactionNumber: payment.referenceNumber! },
      });
      if (advance && ADVANCE_CONCEPTS.has(advance.counterpartConceptCode ?? '')) {
        advance.advanceAppliedAmount = Math.max(
          0,
          Math.round(
            (Number(advance.advanceAppliedAmount || 0) - Number(payment.amount)) * 100,
          ) / 100,
        );
        await txRepo.save(advance);
      }

      return { cancelled: true };
    });
  }

  /** Liquidaciones por anticipo vinculadas a un comprobante (Payment 'advance'). */
  async getAdvanceApplications(companyId: number, txId: string) {
    const tx = await this.txRepo.findOneBy({ id: txId, companyId });
    if (!tx) throw new NotFoundException('Anticipo no encontrado');
    return this.paymentRepo.find({
      where: {
        companyId,
        referenceNumber: tx.transactionNumber,
        paymentMethod: 'advance' as any,
      },
      order: { paymentDate: 'DESC' },
    });
  }

  async reverseBankTransaction(
    companyId: number,
    referenceNumber: string,
    description?: string,
    manager?: EntityManager,
    bankTransactionId?: string,
  ) {
    const txRepo = manager ? manager.getRepository(BankTransaction) : this.txRepo;

    const where = bankTransactionId
      ? { companyId, id: bankTransactionId }
      : { companyId, referenceNumber };
    const original = await txRepo.findOne({ where });
    if (!original) {
      throw new NotFoundException(
        `No se encontró BankTransaction con ${bankTransactionId ? `id ${bankTransactionId}` : `reference ${referenceNumber}`}`,
      );
    }

    const existingReversal = await txRepo.findOne({
      where: { companyId, parentTransactionId: original.id },
    });
    if (existingReversal) {
      this.logger.warn(`Reversión ya existe para BankTransaction ${original.id}`);
      return existingReversal;
    }

    const reverseNumber = await this.sequenceService.nextFormatted(
      companyId,
      'bank-transaction',
      'REV-TXB',
      { year: 0, padding: 6 },
    );

    const reverseType = original.transactionType === 'credit' ? 'debit' : 'credit';
    const reversal = txRepo.create({
      companyId,
      bankAccountId: original.bankAccountId,
      transactionNumber: reverseNumber,
      transactionDate: new Date().toISOString().split('T')[0],
      transactionType: reverseType,
      amount: original.amount,
      currency: original.currency,
      exchangeRate: original.exchangeRate,
      description: description || `Reverso de ${original.transactionNumber}`,
      referenceNumber: `REV-${original.referenceNumber || original.transactionNumber}`,
      category: original.category,
      counterpartConceptCode: original.counterpartConceptCode,
      counterpartyAccount: original.counterpartyAccount,
      counterpartyName: original.counterpartyName,
      counterpartyBank: original.counterpartyBank,
      parentTransactionId: original.id,
      sourceModule: 'reversal',
    });
    const saved = await txRepo.save(reversal);

    await this.applyBankBalanceDelta(
      companyId,
      original.bankAccountId,
      reverseType === 'credit' ? Number(original.amount) : -Number(original.amount),
      manager,
    );

    // Concepto 38: la contraria también revierte su movimiento y se
    // registra el espejo del reverso para que quede en su historial.
    if (original.counterpartConceptCode === BANK_TRANSFER_CONCEPT &&
        (original.counterpartyBank || (await this.findTransferLinked(companyId, original, manager)))) {
      const counterpart = await this.resolveStoredTransferCounterpart(
        companyId,
        original.counterpartyBank,
        original.bankAccountId,
        manager,
      );
      if (counterpart) {
        await this.applyBankBalanceDelta(
          companyId,
          counterpart.id,
          reverseType === 'credit' ? -Number(original.amount) : Number(original.amount),
          manager,
        );
        const originalBank = await (manager ? manager.getRepository(BankAccount) : this.bankRepo)
          .findOneBy({ id: original.bankAccountId, companyId });
        if (originalBank) {
          const revMirror = await this.createTransferMirror(
            companyId,
            saved,
            originalBank,
            counterpart,
            manager,
          );
          saved.linkedTransactionId = revMirror.id;
          await txRepo.save(saved);
        }
      }
    }

    this.logger.log(`BankTransaction ${original.transactionNumber} reversada por ${saved.transactionNumber}`);
    return saved;
  }

  // ══════════════════════════════════════════════════════════
  // ── PAGOS (Cobros y Pagos) ──
  // ══════════════════════════════════════════════════════════

  async findAllPayments(companyId: number, filters?: any) {
    const qb = this.paymentRepo
      .createQueryBuilder('p')
      .where('p.company_id = :companyId', { companyId })
      .leftJoinAndSelect('p.bankAccount', 'ba')
      .orderBy('p.payment_date', 'DESC');

    if (filters?.paymentType) qb.andWhere('p.payment_type = :type', { type: filters.paymentType });
    if (filters?.status) qb.andWhere('p.status = :status', { status: filters.status });
    if (filters?.fromDate) qb.andWhere('p.payment_date >= :from', { from: filters.fromDate });
    if (filters?.toDate) qb.andWhere('p.payment_date <= :to', { to: filters.toDate });

    return qb.getMany();
  }

  async findOnePayment(companyId: number, id: string) {
    const payment = await this.paymentRepo.findOne({
      where: { id, companyId },
      relations: ['bankAccount', 'accountReceivable', 'accountPayable'],
    });
    if (!payment) throw new NotFoundException(`Pago ${id} no encontrado`);
    return payment;
  }

  async createPayment(companyId: number, data: any) {
    const amount = Number(data.amount);
    if (!(amount > 0)) {
      throw new BadRequestException('El importe del pago debe ser mayor que cero');
    }

    let counterpartAccount: string | undefined;
    let counterpartReference: string | undefined;

    const result = await this.dataSource.transaction(async (manager) => {
    const arRepo = manager.getRepository(AccountReceivable);
    const apRepo = manager.getRepository(AccountPayable);

    if (data.accountReceivableId) {
      const ar = await arRepo.findOne({
        where: { id: data.accountReceivableId, companyId },
      });
      if (!ar) {
        throw new NotFoundException(
          `CxC ${data.accountReceivableId} no encontrada`,
        );
      }
      if (['paid', 'written_off'].includes(ar.status)) {
        throw new BadRequestException(
          `La cuenta por cobrar ${ar.arNumber} ya está ${ar.status === 'paid' ? 'cobrada' : 'dada de baja'}`,
        );
      }
      if (amount - Number(ar.balanceAmount) > 0.01) {
        throw new BadRequestException(
          `El cobro (${amount.toFixed(2)}) excede el saldo pendiente de la CxC ${ar.arNumber} ` +
            `(${Number(ar.balanceAmount).toFixed(2)}). Registre un anticipo si corresponde.`,
        );
      }
      counterpartReference = ar.customerNit || ar.customerId || ar.customerName;
    }

    if (data.accountPayableId) {
      const ap = await apRepo.findOne({
        where: { id: data.accountPayableId, companyId },
      });
      if (!ap) {
        throw new NotFoundException(
          `CxP ${data.accountPayableId} no encontrada`,
        );
      }
      if (['paid', 'cancelled'].includes(ap.status)) {
        throw new BadRequestException(
          `La cuenta por pagar ${ap.apNumber} ya está ${ap.status === 'paid' ? 'saldada' : 'anulada'}`,
        );
      }
      if (amount - Number(ap.balanceAmount) > 0.01) {
        throw new BadRequestException(
          `El pago (${amount.toFixed(2)}) excede el saldo pendiente de la CxP ${ap.apNumber} ` +
            `(${Number(ap.balanceAmount).toFixed(2)}).`,
        );
      }
      counterpartAccount = ap.accountCode || undefined;
      counterpartReference = ap.supplierNit || ap.supplierName;
    }

    const paymentNumber = await this.sequenceService.nextFormatted(
      companyId,
      'payment',
      'PAG',
      { manager },
    );
    const paymentData: Partial<Payment> = {
      ...pick(data, PAYMENT_FIELDS),
      companyId,
      paymentNumber,
      status: 'completed',
    } as Partial<Payment>;
    const paymentRepo = manager.getRepository(Payment);
    const payment = paymentRepo.create(paymentData as Payment);
    const saved = await paymentRepo.save(payment);

    if (data.accountReceivableId) {
      const ar = await arRepo.findOne({ where: { id: data.accountReceivableId, companyId } });
      if (ar) {
        ar.paidAmount = Math.round((Number(ar.paidAmount) + amount) * 100) / 100;
        ar.balanceAmount =
          Math.round((Number(ar.originalAmount) - Number(ar.paidAmount)) * 100) / 100;
        ar.lastPaymentDate = data.paymentDate;
        ar.lastPaymentAmount = amount;
        ar.status = ar.balanceAmount <= 0.009 ? 'paid' : 'partial';
        await arRepo.save(ar);

        await this.syncInvoiceStatusFromReceivable(companyId, ar, manager);
      }
    }
    if (data.accountPayableId) {
      const ap = await apRepo.findOne({ where: { id: data.accountPayableId, companyId } });
      if (ap) {
        ap.paidAmount = Math.round((Number(ap.paidAmount) + amount) * 100) / 100;
        ap.balanceAmount =
          Math.round((Number(ap.originalAmount) - Number(ap.paidAmount)) * 100) / 100;
        ap.lastPaymentDate = data.paymentDate;
        ap.lastPaymentAmount = amount;
        ap.status = ap.balanceAmount <= 0.009 ? 'paid' : 'partial';
        await apRepo.save(ap);
      }
    }

    await this.createPaymentVoucher(companyId, saved, {
      ...data,
      counterpartAccount,
      counterpartReference,
    }, manager);

    if (data.paymentMethod === 'bank_transfer' || data.paymentMethod === 'check' ||
        data.paymentMethod === 'credit_card' || data.paymentMethod === 'debit_card') {
      if (data.bankAccountId) {
        await this.registerBankMovementFromPayment(companyId, saved, data, manager);
      }
    } else if (data.paymentMethod === 'cash') {
      await this.registerCashMovementFromPayment(companyId, saved, data, manager);
    }

    return saved;
    });

    return result;
  }

  /**
   * Sincroniza el estado de la factura origen con el estado actual de la CxC.
   *
   * - Busca la factura por `invoiceId` y, si la CxC no lo tiene persistido,
   *   por `invoiceNumber` (backfill automático del vínculo).
   * - `ar.status === 'paid'`       → factura `paid`.
   * - `ar.paidAmount > 0`          → factura `partial`.
   * - sin pagos (reversión total)  → factura vuelve a `pending`.
   */
  private async syncInvoiceStatusFromReceivable(
    companyId: number,
    ar: AccountReceivable,
    manager?: EntityManager,
  ) {
    const invoiceRepo = manager
      ? manager.getRepository(Invoice)
      : this.invoiceRepo;

    let invoice: Invoice | null = null;
    if (ar.invoiceId) {
      invoice = await invoiceRepo.findOne({
        where: { id: ar.invoiceId, companyId },
      });
    }
    if (!invoice && ar.invoiceNumber) {
      invoice = await invoiceRepo.findOne({
        where: { invoiceNumber: ar.invoiceNumber, companyId } as any,
      });
      if (invoice && !ar.invoiceId) {
        ar.invoiceId = invoice.id;
        const arRepo = manager
          ? manager.getRepository(AccountReceivable)
          : this.arRepo;
        await arRepo.save(ar);
      }
    }

    if (!invoice || invoice.status === 'cancelled') return;

    const newStatus: string =
      ar.status === 'paid'
        ? 'paid'
        : Number(ar.paidAmount) > 0
          ? 'partial'
          : 'pending';

    if (invoice.status !== newStatus) {
      invoice.status = newStatus as any;
      await invoiceRepo.save(invoice);
      this.logger.log(
        `Factura ${invoice.invoiceNumber} sincronizada a '${newStatus}' ` +
          `desde la CxC ${ar.arNumber}`,
      );
    }
  }

  private async registerBankMovementFromPayment(companyId: number, payment: Payment, data: any, manager?: EntityManager) {
    const ba = await this.findOneBankAccount(companyId, data.bankAccountId, manager);
    if (!ba) return;

    const isIncome = data.paymentType === 'receivable';
    const transactionNumber = await this.sequenceService.nextFormatted(
      companyId,
      'bank-transaction',
      'TXB',
      { manager },
    );

    const txRepo = manager ? manager.getRepository(BankTransaction) : this.txRepo;
    const tx = txRepo.create({
      transactionNumber,
      transactionDate: data.paymentDate,
      transactionType: isIncome ? 'credit' : 'debit',
      amount: data.amount,
      currency: data.currency || 'CUP',
      exchangeRate: data.exchangeRate || 1,
      description: `${isIncome ? 'Cobro' : 'Pago'} ${payment.paymentNumber} - ${data.description || ''}`.trim(),
      referenceNumber: payment.paymentNumber,
      counterpartyName: data.counterpartyName || null,
      bankAccountId: data.bankAccountId,
      companyId,
      sourceModule: 'payment',
    });
    await txRepo.save(tx);

    await this.applyBankBalanceDelta(
      companyId,
      ba.id,
      isIncome ? Number(data.amount) : -Number(data.amount),
      manager,
    );

    this.logger.log(`BankTransaction ${tx.transactionNumber} creada desde Payment ${payment.paymentNumber}`);
  }

  private async registerCashMovementFromPayment(companyId: number, payment: Payment, data: any, manager?: EntityManager) {
    const cashRegisterRepo = manager ? manager.getRepository(CashRegister) : this.cashRegisterRepo;
    const isIncome = data.paymentType === 'receivable';
    // Desde Caja (liquidación de documentos) llega la caja elegida; desde
    // Pagos se usa la caja abierta o la predeterminada.
    if (data.cashRegisterId) {
      await this.findOpenCashRegisterFor(companyId, data.cashRegisterId, isIncome ? null : Number(data.amount), manager);
    }
    let cashRegister = data.cashRegisterId
      ? await cashRegisterRepo.findOne({ where: { id: data.cashRegisterId, companyId } })
      : await cashRegisterRepo.findOne({ where: { companyId, status: 'open' } });
    if (!cashRegister) {
      cashRegister = await cashRegisterRepo.findOne({
        where: { companyId, isDefault: true },
      });
    }
    if (!cashRegister) {
      this.logger.warn(`No hay caja abierta ni default para companyId=${companyId}. Pago en efectivo registrado sin movimiento de caja.`);
      return;
    }

    const movementNumber = await this.sequenceService.nextFormatted(
      companyId,
      'cash-movement',
      'CAJ',
      { manager },
    );

    const newBalance = isIncome
      ? Number(cashRegister.currentBalance) + Number(data.amount)
      : Number(cashRegister.currentBalance) - Number(data.amount);

    const cashMovementRepo = manager ? manager.getRepository(CashMovement) : this.cashMovementRepo;
    const cm = cashMovementRepo.create({
      movementNumber,
      movementDate: new Date(data.paymentDate),
      movementType: isIncome ? 'income' : 'expense',
      amount: data.amount,
      balanceAfter: newBalance,
      description: `${isIncome ? 'Cobro' : 'Pago'} ${payment.paymentNumber} - ${data.description || ''}`.trim(),
      documentType: data.documentType || (isIncome ? 'recibo_cobro' : 'vale_caja'),
      documentNumber: payment.paymentNumber,
      counterpartyName: data.counterpartyName || null,
      concept: data.concept || null,
      paymentId: payment.id,
      cashRegisterId: cashRegister.id,
      companyId,
    });
    await cashMovementRepo.save(cm);

    cashRegister.currentBalance = newBalance;
    await cashRegisterRepo.save(cashRegister);

    if (newBalance > Number(cashRegister.maxRetentionLimit)) {
      this.logger.warn(
        `Caja ${cashRegister.registerCode} excede límite de retención: $${newBalance} > $${cashRegister.maxRetentionLimit}. Se debe depositar en banco.`,
      );
    }

    this.logger.log(`CashMovement ${cm.movementNumber} creada desde Payment ${payment.paymentNumber}`);
  }

  private async createPaymentVoucher(companyId: number, payment: Payment, data: any, manager?: EntityManager) {
    const isIncome = data.paymentType === 'receivable';
    const amount = Number(data.amount);

    let treasuryMapping: MappingType;
    if (data.paymentMethod === 'cash') {
      treasuryMapping = MappingType.TREASURY_CASH;
    } else if (
      data.paymentMethod === 'bank_transfer' ||
      data.paymentMethod === 'check'
    ) {
      treasuryMapping = MappingType.TREASURY_BANK;
    } else if (
      data.paymentMethod === 'credit_card' ||
      data.paymentMethod === 'debit_card'
    ) {
      treasuryMapping = MappingType.TREASURY_CARD;
    } else {
      treasuryMapping = MappingType.TREASURY_CASH;
    }

    // Operaciones bancarias: la cuenta es la que el usuario vinculó a la cuenta
    // bancaria en Finanzas, nunca una por defecto. El efectivo va a Caja.
    let cashAccountCode: string;
    if (treasuryMapping === MappingType.TREASURY_CASH) {
      cashAccountCode =
        (await this.accountMappingService.getAccountForMapping(companyId, treasuryMapping)) || '101';
    } else {
      const bankAccountId = payment.bankAccountId || data.bankAccountId;
      if (!bankAccountId) {
        throw new BadRequestException('Seleccione la cuenta bancaria de la operación');
      }
      const linkedBank = await (manager ? manager.getRepository(BankAccount) : this.bankRepo).findOneBy({
        id: bankAccountId,
        companyId,
      });
      if (!linkedBank) throw new NotFoundException('Cuenta bancaria no encontrada');
      cashAccountCode = this.bankAccountingCode(linkedBank);
    }

    const lines: any[] = [];

    if (isIncome) {
      const receivableAccount =
        data.counterpartAccount ||
        (await this.accountMappingService.getAccountForMapping(companyId, MappingType.INVOICE_RECEIVABLE)) ||
        '135';
      lines.push({
        accountCode: cashAccountCode,
        debit: amount,
        credit: 0,
        description: `Ingreso por ${data.paymentMethod}`,
      });
      lines.push({
        accountCode: receivableAccount,
        debit: 0,
        credit: amount,
        description: `Cobro ${payment.paymentNumber} - ${data.description || ''}`,
        reference: data.counterpartReference || data.counterpartyName || null,
      });
    } else {
      const payableAccount =
        data.counterpartAccount ||
        (await this.accountMappingService.getAccountForMapping(companyId, MappingType.PURCHASE_ORDER)) ||
        '410';
      lines.push({
        accountCode: payableAccount,
        debit: amount,
        credit: 0,
        description: `Pago ${payment.paymentNumber} - ${data.description || ''}`,
        reference: data.counterpartReference || data.counterpartyName || null,
      });
      lines.push({
        accountCode: cashAccountCode,
        debit: 0,
        credit: amount,
        description: `Pago por ${data.paymentMethod}`,
      });
    }

    try {
      await this.voucherService.createVoucherFromModule(
        companyId,
        'finance',
        payment.id,
        {
          date: data.paymentDate || new Date().toISOString().split('T')[0],
          description: `${isIncome ? 'Cobro' : 'Pago'} ${payment.paymentNumber} - ${data.description || ''}`,
          type: isIncome ? 'receipt' : 'payment',
          reference: payment.paymentNumber,
          createdBy: data.performedBy || 'Sistema',
          lines,
        },
        manager,
      );
      this.logger.log(`Voucher generado para Payment ${payment.paymentNumber}`);
    } catch (error) {
      this.logger.error(`Error generando voucher para Payment ${payment.paymentNumber}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async getPaymentStatistics(companyId: number) {
    const all = await this.paymentRepo.find({ where: { companyId } });
    const received = all.filter(p => p.paymentType === 'receivable' && p.status === 'completed');
    const paid = all.filter(p => p.paymentType === 'payable' && p.status === 'completed');
    const totalReceived = received.reduce((s, p) => s + Number(p.amount), 0);
    const totalPaid = paid.reduce((s, p) => s + Number(p.amount), 0);
    return {
      total: all.length,
      receivedCount: received.length,
      paidCount: paid.length,
      totalReceived,
      totalPaid,
    };
  }

  // ══════════════════════════════════════════════════════════
  // ── CAJA (Efectivo - Cuenta 101) ──
  // ══════════════════════════════════════════════════════════

  async findAllCashRegisters(companyId: number) {
    return this.cashRegisterRepo.find({
      where: { companyId },
      order: { registerName: 'ASC' },
    });
  }

  async findOneCashRegister(companyId: number, id: string) {
    const cr = await this.cashRegisterRepo.findOne({
      where: { id, companyId },
      relations: ['movements'],
    });
    if (!cr) throw new NotFoundException(`Caja ${id} no encontrada`);
    return cr;
  }

  async createCashRegister(companyId: number, data: any) {
    const registerCode = data.registerCode || await this.sequenceService.nextFormatted(
      companyId,
      'cash-register',
      'CAJA',
      { year: 0, padding: 3 },
    );
    const openingBalance = Number(data.openingBalance ?? data.currentBalance ?? 0);
    const isOpen = openingBalance > 0;
    const cr = this.cashRegisterRepo.create({
      ...pick(data, CASH_REGISTER_FIELDS),
      companyId,
      registerCode,
      status: isOpen ? 'open' : 'closed',
      openingBalance,
      currentBalance: openingBalance,
      lastOpeningDate: isOpen ? new Date() : null,
    });
    const savedResult = await this.cashRegisterRepo.save(cr);
    const saved = Array.isArray(savedResult) ? savedResult[0] : savedResult;
    if (isOpen) {
      const movementNumber = await this.sequenceService.nextFormatted(
        companyId,
        'cash-movement',
        'CAJ',
        { year: 0, padding: 6 },
      );
      const cm = this.cashMovementRepo.create({
        companyId,
        cashRegisterId: saved.id,
        movementNumber,
        movementDate: new Date(),
        movementType: 'opening',
        amount: openingBalance,
        balanceAfter: openingBalance,
        description: `Fondo inicial de caja ${saved.registerCode}`,
        documentType: 'apertura',
        documentNumber: saved.registerCode,
      });
      await this.cashMovementRepo.save(cm);
    }
    return saved;
  }

  async updateCashRegister(companyId: number, id: string, data: any) {
    const cr = await this.findOneCashRegister(companyId, id);
    Object.assign(cr, pick(data, CASH_REGISTER_FIELDS));
    return this.cashRegisterRepo.save(cr);
  }

  async openCashRegister(companyId: number, id: string, openingBalance?: number) {
    const cr = await this.findOneCashRegister(companyId, id);
    if (cr.status === 'open') {
      throw new BadRequestException(`Caja ${cr.registerCode} ya está abierta`);
    }

    cr.status = 'open';
    cr.lastOpeningDate = new Date();
    if (openingBalance !== undefined) {
      cr.openingBalance = openingBalance;
      cr.currentBalance = openingBalance;
    } else {
      cr.openingBalance = Number(cr.currentBalance);
    }
    await this.cashRegisterRepo.save(cr);

    const openingNumber = await this.sequenceService.nextFormatted(companyId, 'cash-movement', 'CAJ', { year: 0, padding: 6 });
    const cm = this.cashMovementRepo.create({
      movementNumber: openingNumber,
      movementDate: new Date(),
      movementType: 'opening' as const,
      amount: Number(cr.openingBalance),
      balanceAfter: Number(cr.currentBalance),
      description: `Apertura de caja ${cr.registerCode}`,
      documentType: 'apertura' as const,
      cashRegisterId: cr.id,
      companyId,
    });
    await this.cashMovementRepo.save(cm);

    this.logger.log(`Caja ${cr.registerCode} abierta con saldo $${cr.currentBalance}`);
    return cr;
  }

  async closeCashRegister(companyId: number, id: string) {
    const cr = await this.findOneCashRegister(companyId, id);
    if (cr.status !== 'open') {
      throw new BadRequestException(`Caja ${cr.registerCode} no está abierta`);
    }

    cr.status = 'closed';
    cr.lastClosingDate = new Date();
    await this.cashRegisterRepo.save(cr);

    const closingNumber = await this.sequenceService.nextFormatted(companyId, 'cash-movement', 'CAJ', { year: 0, padding: 6 });
    const cm = this.cashMovementRepo.create({
      movementNumber: closingNumber,
      movementDate: new Date(),
      movementType: 'closing' as const,
      amount: Number(cr.currentBalance),
      balanceAfter: Number(cr.currentBalance),
      description: `Cierre de caja ${cr.registerCode} — Saldo final: $${cr.currentBalance}`,
      documentType: 'cierre' as const,
      cashRegisterId: cr.id,
      companyId,
    });
    await this.cashMovementRepo.save(cm);

    this.logger.log(`Caja ${cr.registerCode} cerrada con saldo $${cr.currentBalance}`);
    return cr;
  }

  async performCashAudit(companyId: number, id: string, physicalBalance: number) {
    const cr = await this.findOneCashRegister(companyId, id);
    const difference = physicalBalance - Number(cr.currentBalance);

    cr.lastAuditDate = new Date();
    cr.lastAuditBalance = physicalBalance;
    cr.lastAuditDifference = difference;

    if (difference !== 0) {
      const auditNumber = await this.sequenceService.nextFormatted(companyId, 'cash-movement', 'CAJ', { year: 0, padding: 6 });
      const cm = this.cashMovementRepo.create({
        movementNumber: auditNumber,
        movementDate: new Date(),
        movementType: 'audit_adjustment' as const,
        amount: Math.abs(difference),
        balanceAfter: physicalBalance,
        description: `Arqueo de caja ${cr.registerCode} — Diferencia: ${difference > 0 ? '+' : ''}$${difference}`,
        documentType: 'arqueo' as const,
        cashRegisterId: cr.id,
        companyId,
      });
      await this.cashMovementRepo.save(cm);

      cr.currentBalance = physicalBalance;
      this.logger.warn(`Arqueo caja ${cr.registerCode}: diferencia $${difference}`);
    }

    await this.cashRegisterRepo.save(cr);
    return { cashRegister: cr, difference };
  }

  async depositToBank(companyId: number, cashRegisterId: string, bankAccountId: string, amount: number, description?: string) {
    // Mismo flujo que Caja - Egreso con "Modelo de depósito en cuenta".
    return this.createCashMovement(companyId, {
      cashRegisterId,
      movementType: 'expense',
      documentType: 'deposito_cuenta',
      bankAccountId,
      amount,
      description,
    });
  }

  async findCashMovements(companyId: number, cashRegisterId: string, filters?: any) {
    const qb = this.cashMovementRepo
      .createQueryBuilder('cm')
      .where('cm.company_id = :companyId', { companyId })
      .andWhere('cm.cash_register_id = :cashRegisterId', { cashRegisterId })
      .orderBy('cm.created_at', 'DESC');

    if (filters?.fromDate) qb.andWhere('cm.movement_date >= :from', { from: filters.fromDate });
    if (filters?.toDate) qb.andWhere('cm.movement_date <= :to', { to: filters.toDate });
    if (filters?.movementType) qb.andWhere('cm.movement_type = :type', { type: filters.movementType });

    return qb.getMany();
  }

  /**
   * Registra un comprobante de caja.
   *
   * - Liquidación de documentos de cobro / de pago: liquida la CxC o CxP
   *   elegida con un `Payment` en efectivo (rebaja la obligación y genera el
   *   comprobante contable de cobro/pago, como desde Pagos).
   * - Modelo de depósito en cuenta: el efectivo sale de la caja y entra al
   *   banco elegido en un comprobante Banco - Ingreso (concepto 24), generado
   *   por Caja y bloqueado en Banco.
   * - El resto solo mueve el saldo de la caja.
   */
  async createCashMovement(companyId: number, data: any, manager?: EntityManager) {
    const movementType = data.movementType;
    if (!['income', 'expense'].includes(movementType)) {
      throw new BadRequestException('Tipo de movimiento inválido; use income o expense');
    }
    if (!(Number(data.amount) > 0)) {
      throw new BadRequestException('El monto debe ser mayor que cero');
    }
    // Tipo de comprobante: si no se indica (movimientos generados por otros
    // flujos), se usa el genérico de siempre.
    const documentType = data.documentType ? (String(data.documentType) as NonNullable<CashMovement['documentType']>) : null;
    if (documentType && !CASH_DOCUMENT_TYPES[movementType as 'income' | 'expense'][documentType]) {
      throw new BadRequestException(
        `Tipo de comprobante no válido para Caja - ${movementType === 'income' ? 'Ingreso' : 'Egreso'}; use ` +
          Object.values(CASH_DOCUMENT_TYPES[movementType as 'income' | 'expense']).join(', '),
      );
    }
    // En los ingresos de caja el concepto es un código del catálogo (24/80/81).
    if (movementType === 'income' && data.concept && !CASH_INCOME_CONCEPTS.includes(String(data.concept))) {
      throw new BadRequestException(
        `Concepto no válido para Caja - Ingreso; use ${CASH_INCOME_CONCEPTS.join(', ')}`,
      );
    }

    if (documentType === 'liquidacion_cobro' || documentType === 'liquidacion_pago') {
      return this.settleObligationFromCash(companyId, { ...data, documentType });
    }
    if (!manager) {
      return this.dataSource.transaction((mgr) =>
        this.createCashMovementInTx(companyId, { ...data, documentType }, mgr),
      );
    }
    return this.createCashMovementInTx(companyId, { ...data, documentType }, manager);
  }

  /** Caja abierta de la empresa, con saldo suficiente si es un egreso. */
  private async findOpenCashRegisterFor(
    companyId: number,
    cashRegisterId: string,
    expenseAmount: number | null,
    manager?: EntityManager,
  ): Promise<CashRegister> {
    const crRepo = manager ? manager.getRepository(CashRegister) : this.cashRegisterRepo;
    const cr = await crRepo.findOne({ where: { id: cashRegisterId, companyId } });
    if (!cr) throw new NotFoundException(`Caja ${cashRegisterId} no encontrada`);
    if (cr.status !== 'open') {
      throw new BadRequestException(`La caja ${cr.registerCode} no está abierta`);
    }
    if (expenseAmount !== null && Number(cr.currentBalance) < expenseAmount) {
      throw new BadRequestException(`Saldo insuficiente en caja ${cr.registerCode}. Disponible: $${cr.currentBalance}`);
    }
    return cr;
  }

  /** Liquidación de documentos de cobro/pago en efectivo desde Caja. */
  private async settleObligationFromCash(companyId: number, data: any) {
    const isIncome = data.movementType === 'income';
    const obligationId = isIncome ? data.accountReceivableId : data.accountPayableId;
    if (!obligationId) {
      throw new BadRequestException(
        isIncome ? 'Seleccione la cuenta por cobrar a liquidar' : 'Seleccione la cuenta por pagar a liquidar',
      );
    }
    const amount = Number(data.amount);
    const cr = await this.findOpenCashRegisterFor(companyId, data.cashRegisterId, isIncome ? null : amount);

    const payment = await this.createPayment(companyId, {
      paymentType: isIncome ? 'receivable' : 'payable',
      paymentMethod: 'cash',
      amount,
      currency: cr.currency,
      paymentDate: data.movementDate || new Date().toISOString().split('T')[0],
      description: data.description,
      counterpartyName: data.counterpartyName,
      ...(isIncome ? { accountReceivableId: obligationId } : { accountPayableId: obligationId }),
      cashRegisterId: cr.id,
      documentType: data.documentType,
      concept: data.concept,
    });

    const cashMovement = await this.cashMovementRepo.findOne({ where: { companyId, paymentId: payment.id } });
    const cashRegister = await this.cashRegisterRepo.findOne({ where: { id: cr.id, companyId } });
    return { cashMovement, cashRegister, payment };
  }

  private async createCashMovementInTx(companyId: number, data: any, manager: EntityManager) {
    const movementType = data.movementType;
    const amount = Number(data.amount);
    const documentType = data.documentType as CashMovement['documentType'];
    const crRepo = manager.getRepository(CashRegister);
    const cr = await this.findOpenCashRegisterFor(
      companyId,
      data.cashRegisterId,
      movementType === 'expense' ? amount : null,
      manager,
    );

    const isDeposit = documentType === 'deposito_cuenta';
    let depositBank: BankAccount | null = null;
    if (isDeposit) {
      if (!data.bankAccountId) {
        throw new BadRequestException('Seleccione la cuenta bancaria donde se deposita el efectivo');
      }
      depositBank = await this.findOneBankAccount(companyId, data.bankAccountId, manager);
      if ((depositBank.currency || 'CUP') !== (cr.currency || 'CUP')) {
        throw new BadRequestException(
          `La caja ${cr.registerCode} es en ${cr.currency} y la cuenta ${depositBank.accountNumber} en ${depositBank.currency}; deposite en una cuenta de la misma moneda`,
        );
      }
    }

    const movementNumber = await this.sequenceService.nextFormatted(
      companyId,
      'cash-movement',
      'CAJ',
      { manager },
    );

    const delta = movementType === 'income' ? amount : -amount;
    cr.currentBalance = Number(cr.currentBalance) + delta;
    await crRepo.save(cr);

    const cmRepo = manager.getRepository(CashMovement);
    const description =
      data.description ||
      (depositBank ? `Depósito a banco ${depositBank.bankName} - ${depositBank.accountNumber}` : '');
    const cm = cmRepo.create({
      movementNumber,
      movementDate: data.movementDate || new Date(),
      movementType,
      amount,
      balanceAfter: Number(cr.currentBalance),
      description,
      concept: data.concept || null,
      counterpartyName: data.counterpartyName || null,
      documentType: documentType || (movementType === 'income' ? 'recibo_cobro' : 'vale_caja'),
      cashRegisterId: cr.id,
      companyId,
    });
    const saved = await cmRepo.save(cm);

    let bankTransaction: BankTransaction | null = null;
    if (depositBank) {
      const date = data.movementDate
        ? String(data.movementDate).substring(0, 10)
        : new Date().toISOString().split('T')[0];
      bankTransaction = await this.createBankTransaction(
        companyId,
        {
          bankAccountId: depositBank.id,
          transactionType: 'credit',
          transactionCode: 'Otros cobros',
          counterpartConceptCode: CASH_DEPOSIT_CONCEPT,
          amount,
          currency: depositBank.currency,
          transactionDate: date,
          description: `Depósito desde caja ${cr.registerCode}${data.description ? ` - ${data.description}` : ''}`,
          referenceNumber: saved.movementNumber,
          sourceModule: 'cash',
        },
        manager,
      );
      saved.documentNumber = bankTransaction.transactionNumber;
      await cmRepo.save(saved);
      this.logger.log(`Depósito $${amount} desde caja ${cr.registerCode} a banco ${depositBank.accountNumber}`);
    }

    return { cashMovement: saved, cashRegister: cr, bankTransaction };
  }

  // ── Edición y anulación de comprobantes de caja ──

  /** Tipos que arrastran otra operación y no pueden convertirse en otro tipo al editar. */
  private static readonly LINKED_CASH_DOCUMENT_TYPES = new Set([
    'liquidacion_cobro',
    'liquidacion_pago',
    'deposito_cuenta',
    'deposito_banco',
  ]);

  /**
   * Solo se editan y anulan los ingresos y egresos; la apertura, el cierre y
   * el arqueo los genera la propia caja.
   */
  private async loadMutableCashMovement(companyId: number, id: string, action: string, manager: EntityManager) {
    const cm = await manager.getRepository(CashMovement).findOne({ where: { id, companyId } });
    if (!cm) throw new NotFoundException('Movimiento de caja no encontrado');
    if (!['income', 'expense'].includes(cm.movementType)) {
      throw new BadRequestException(
        `El movimiento ${cm.movementNumber} lo generó la caja (apertura, cierre o arqueo) y no puede ${action}se`,
      );
    }
    return cm;
  }

  /**
   * Comprobante Banco - Ingreso generado por un depósito de esta caja: el
   * actual (concepto 24, origen Caja) o el del flujo anterior de depósito,
   * que se enlazaba por el número del movimiento.
   */
  private async findCashDepositTransaction(companyId: number, cm: CashMovement, manager: EntityManager) {
    const txRepo = manager.getRepository(BankTransaction);
    if (cm.documentType === 'deposito_cuenta' && cm.documentNumber) {
      return txRepo.findOne({ where: { companyId, transactionNumber: cm.documentNumber, sourceModule: 'cash' } });
    }
    if (cm.documentType === 'deposito_banco') {
      return txRepo.findOne({ where: { companyId, referenceNumber: cm.movementNumber, transactionType: 'credit' } });
    }
    return null;
  }

  /**
   * Aplica `delta` al saldo de la caja y desplaza el "saldo después" de los
   * movimientos posteriores (y del propio, si `includeSelf`).
   */
  private async shiftCashBalances(
    cr: CashRegister,
    cm: CashMovement,
    delta: number,
    includeSelf: boolean,
    manager: EntityManager,
  ) {
    if (Math.abs(delta) < 0.005) return;
    const balance = Math.round((Number(cr.currentBalance) + delta) * 100) / 100;
    if (balance < -0.009) {
      throw new BadRequestException(
        `Saldo insuficiente en caja ${cr.registerCode}: la operación la dejaría en ${balance.toFixed(2)}`,
      );
    }
    cr.currentBalance = balance;
    await manager.getRepository(CashRegister).save(cr);
    await manager
      .createQueryBuilder()
      .update(CashMovement)
      .set({ balanceAfter: () => 'balance_after + :delta' })
      .where('cash_register_id = :crId', { crId: cr.id })
      .andWhere(includeSelf ? 'created_at >= :createdAt' : 'created_at > :createdAt', { createdAt: cm.createdAt })
      .setParameter('delta', delta)
      .execute();
  }

  /** Comprueba que la obligación del pago admita `amount` más (al restaurar o aumentar el cobro/pago). */
  private async assertObligationCanAbsorb(companyId: number, payment: Payment, amount: number, manager: EntityManager) {
    const obligation = payment.accountReceivableId
      ? await manager.getRepository(AccountReceivable).findOne({ where: { id: payment.accountReceivableId, companyId } })
      : payment.accountPayableId
        ? await manager.getRepository(AccountPayable).findOne({ where: { id: payment.accountPayableId, companyId } })
        : null;
    if (obligation && amount - Number(obligation.balanceAmount) > 0.01) {
      const number = (obligation as AccountReceivable).arNumber || (obligation as AccountPayable).apNumber;
      throw new BadRequestException(
        `El importe (${amount.toFixed(2)}) excede el saldo pendiente de ${number} (${Number(obligation.balanceAmount).toFixed(2)})`,
      );
    }
  }

  /**
   * Anula un comprobante de caja: devuelve el saldo de la caja, revierte la
   * CxC/CxP que liquidó (anulando el pago y su comprobante contable) y, si fue
   * un depósito, anula el ingreso que generó en Banco.
   */
  async cancelCashMovement(companyId: number, id: string) {
    return this.dataSource.transaction(async (manager) => {
      const cm = await this.loadMutableCashMovement(companyId, id, 'anular', manager);
      if (cm.status === 'cancelled') {
        throw new BadRequestException(`El movimiento ${cm.movementNumber} ya está anulado`);
      }
      const cr = await this.findOpenCashRegisterFor(companyId, cm.cashRegisterId, null, manager);

      const snapshot = { paymentVouchers: [] as { id: string; status: string }[] };
      if (cm.paymentId) {
        const paymentRepo = manager.getRepository(Payment);
        const payment = await paymentRepo.findOne({ where: { id: cm.paymentId, companyId } });
        if (payment && payment.status !== 'cancelled') {
          await this.revertPaymentObligation(companyId, payment, manager);
          snapshot.paymentVouchers = await this.cancelFinanceVouchers(
            companyId,
            payment.id,
            manager,
            `Payment ${payment.paymentNumber}`,
          );
          payment.status = 'cancelled';
          await paymentRepo.save(payment);
        }
      }

      const deposit = await this.findCashDepositTransaction(companyId, cm, manager);
      if (deposit && deposit.operationStatus !== 'cancelled') {
        await this.cancelBankTransactionInTx(companyId, deposit, manager);
      }

      const amount = Number(cm.amount);
      await this.shiftCashBalances(cr, cm, cm.movementType === 'income' ? -amount : amount, false, manager);

      cm.status = 'cancelled';
      cm.cancelSnapshot = snapshot;
      await manager.getRepository(CashMovement).save(cm);
      return { cancelled: true };
    });
  }

  /** Deshace la anulación de un comprobante de caja (operación inversa de {@link cancelCashMovement}). */
  async restoreCashMovement(companyId: number, id: string) {
    return this.dataSource.transaction(async (manager) => {
      const cm = await this.loadMutableCashMovement(companyId, id, 'restaurar', manager);
      if (cm.status !== 'cancelled') {
        throw new BadRequestException(`El movimiento ${cm.movementNumber} no está anulado`);
      }
      const amount = Number(cm.amount);
      const cr = await this.findOpenCashRegisterFor(
        companyId,
        cm.cashRegisterId,
        cm.movementType === 'expense' ? amount : null,
        manager,
      );

      if (cm.paymentId) {
        const paymentRepo = manager.getRepository(Payment);
        const payment = await paymentRepo.findOne({ where: { id: cm.paymentId, companyId } });
        if (payment && payment.status === 'cancelled') {
          await this.assertObligationCanAbsorb(companyId, payment, Number(payment.amount), manager);
          for (const entry of cm.cancelSnapshot?.paymentVouchers || []) {
            await this.voucherService.updateVoucherStatus(companyId, entry.id, entry.status, manager);
          }
          payment.status = 'completed';
          await paymentRepo.save(payment);
          await this.applyPaymentObligation(companyId, payment, manager);
        }
      }

      const deposit = await this.findCashDepositTransaction(companyId, cm, manager);
      if (deposit && deposit.operationStatus === 'cancelled') {
        await this.restoreBankTransactionInTx(companyId, deposit, manager);
      }

      await this.shiftCashBalances(cr, cm, cm.movementType === 'income' ? amount : -amount, false, manager);

      cm.status = 'active';
      cm.cancelSnapshot = null;
      await manager.getRepository(CashMovement).save(cm);
      return { restored: true };
    });
  }

  /**
   * Edita un comprobante de caja. El cambio de importe o fecha se propaga al
   * saldo de la caja, al pago y a la CxC/CxP que liquidó (con su comprobante
   * contable regenerado) y al ingreso en Banco de un depósito.
   */
  async updateCashMovement(companyId: number, id: string, data: any) {
    return this.dataSource.transaction(async (manager) => {
      const cmRepo = manager.getRepository(CashMovement);
      const cm = await this.loadMutableCashMovement(companyId, id, 'editar', manager);
      if (cm.status === 'cancelled') {
        throw new BadRequestException(`El movimiento ${cm.movementNumber} está anulado; deshaga la anulación para editarlo`);
      }
      const cr = await this.findOpenCashRegisterFor(companyId, cm.cashRegisterId, null, manager);
      const movementType = cm.movementType as 'income' | 'expense';

      // Tipo de comprobante: los que arrastran otra operación no se convierten.
      if (data.documentType !== undefined && data.documentType !== cm.documentType) {
        const linked = FinanceService.LINKED_CASH_DOCUMENT_TYPES;
        if (linked.has(cm.documentType || '') || linked.has(data.documentType)) {
          throw new BadRequestException(
            'Las liquidaciones y los depósitos no pueden cambiar de tipo de comprobante; anule el movimiento y regístrelo de nuevo',
          );
        }
        if (!CASH_DOCUMENT_TYPES[movementType][data.documentType]) {
          throw new BadRequestException('Tipo de comprobante no válido para este movimiento');
        }
        cm.documentType = data.documentType;
      }
      if (data.concept !== undefined) {
        if (movementType === 'income' && data.concept && !CASH_INCOME_CONCEPTS.includes(String(data.concept))) {
          throw new BadRequestException(`Concepto no válido para Caja - Ingreso; use ${CASH_INCOME_CONCEPTS.join(', ')}`);
        }
        cm.concept = data.concept || null;
      }
      if (data.description !== undefined) {
        if (!String(data.description).trim()) throw new BadRequestException('La descripción es obligatoria');
        cm.description = data.description;
      }

      const paymentRepo = manager.getRepository(Payment);
      const payment = cm.paymentId ? await paymentRepo.findOne({ where: { id: cm.paymentId, companyId } }) : null;
      const settlesObligation = !!(payment && (payment.accountReceivableId || payment.accountPayableId));

      if (data.counterpartyName !== undefined && (data.counterpartyName || null) !== cm.counterpartyName) {
        if (settlesObligation) {
          throw new BadRequestException(
            'El cliente o proveedor de una liquidación no se cambia: anule el movimiento y liquide la obligación correcta',
          );
        }
        cm.counterpartyName = data.counterpartyName || null;
      }

      const oldAmount = Number(cm.amount);
      const newAmount = data.amount !== undefined ? Math.round(Number(data.amount) * 100) / 100 : oldAmount;
      if (!(newAmount > 0)) throw new BadRequestException('El monto debe ser mayor que cero');
      const newDate = data.movementDate ? new Date(data.movementDate) : cm.movementDate;
      const dateOnly = new Date(newDate).toISOString().split('T')[0];
      const amountChanged = Math.abs(newAmount - oldAmount) >= 0.005;
      const dateChanged = new Date(newDate).getTime() !== new Date(cm.movementDate).getTime();

      // Pago vinculado (liquidación o cobro/pago en efectivo desde Pagos).
      if (payment && payment.status !== 'cancelled' && (amountChanged || dateChanged)) {
        if (settlesObligation && amountChanged) {
          await this.revertPaymentObligation(companyId, payment, manager);
          await this.assertObligationCanAbsorb(companyId, payment, newAmount, manager);
        }
        payment.amount = newAmount;
        payment.paymentDate = dateOnly as any;
        await paymentRepo.save(payment);
        if (settlesObligation && amountChanged) {
          await this.applyPaymentObligation(companyId, payment, manager);
        }
        if (payment.accountPayableId || payment.paymentType === 'payable') {
          await this.regeneratePayablePaymentVoucher(companyId, payment, manager);
        } else {
          await this.regenerateReceivablePaymentVoucher(companyId, payment, manager);
        }
      }

      // Depósito: el ingreso en Banco acompaña el importe y la fecha.
      const deposit = await this.findCashDepositTransaction(companyId, cm, manager);
      if (deposit && deposit.operationStatus !== 'cancelled' && (amountChanged || dateChanged)) {
        if (deposit.reconciled) {
          throw new BadRequestException(
            `El ingreso ${deposit.transactionNumber} del depósito está conciliado en banco; no se puede modificar`,
          );
        }
        if (amountChanged) {
          await this.applyBankBalanceDelta(companyId, deposit.bankAccountId, newAmount - oldAmount, manager);
          deposit.amount = newAmount;
        }
        deposit.transactionDate = dateOnly;
        deposit.operationStatus = 'edited';
        await manager.getRepository(BankTransaction).save(deposit);
      }

      if (amountChanged) {
        const delta = newAmount - oldAmount;
        await this.shiftCashBalances(cr, cm, movementType === 'income' ? delta : -delta, true, manager);
        // El "saldo después" propio ya lo desplazó shiftCashBalances.
        const fresh = await cmRepo.findOne({ where: { id: cm.id, companyId } });
        if (fresh) cm.balanceAfter = fresh.balanceAfter;
        cm.amount = newAmount;
      }
      cm.movementDate = newDate;
      return cmRepo.save(cm);
    });
  }

  async getCashStatistics(companyId: number) {
    const registers = await this.cashRegisterRepo.find({ where: { companyId } });
    const totalBalance = registers.reduce((s, r) => s + Number(r.currentBalance), 0);
    const openRegisters = registers.filter(r => r.status === 'open').length;
    return { total: registers.length, openRegisters, totalBalance };
  }

  // ══════════════════════════════════════════════════════════
  // ── DASHBOARD FINANCIERO ──
  // ══════════════════════════════════════════════════════════

  async getFinanceDashboard(companyId: number) {
    const [arStats, apStats, bankStats, payStats, cashStats] = await Promise.all([
      this.getReceivableStatistics(companyId),
      this.getPayableStatistics(companyId),
      this.getBankStatistics(companyId),
      this.getPaymentStatistics(companyId),
      this.getCashStatistics(companyId),
    ]);

    return {
      receivables: arStats,
      payables: apStats,
      banks: bankStats,
      payments: payStats,
      cash: cashStats,
    };
  }

  // ══════════════════════════════════════════════════════════
  // ── CLIENTES / ENTIDADES ──
  // ══════════════════════════════════════════════════════════

  async findCustomers(companyId: number) {
    return this.customerRepo.find({
      where: { companyId, isActive: true },
      order: { name: 'ASC' },
    });
  }

  private async nextCustomerCode(): Promise<string> {
    const rows: { code: string }[] = await this.customerRepo.query(
      `SELECT code FROM customers WHERE code ~ '^CLE-[0-9]+$'
       ORDER BY LENGTH(code) DESC, code DESC LIMIT 1`,
    );
    const last = rows[0] ? parseInt(rows[0].code.split('-')[1], 10) : 0;
    return `CLE-${String(last + 1).padStart(6, '0')}`;
  }

  async createCustomer(companyId: number, data: any) {
    if (!data.name?.trim()) throw new BadRequestException('El nombre del cliente es obligatorio');
    const customer = this.customerRepo.create({
      companyId,
      code: data.code || (await this.nextCustomerCode()),
      reeupCode: data.reeupCode || null,
      name: data.name.trim(),
      abbreviation: data.abbreviation || null,
      taxId: data.taxId || null,
      phone: data.phone || null,
      email: data.email || null,
      ircc: data.ircc || null,
      province: data.province || null,
      country: data.country || 'Cuba',
      address: data.address || null,
    });
    return this.customerRepo.save(customer);
  }

  async updateCustomer(companyId: number, id: string, data: any) {
    const customer = await this.customerRepo.findOneBy({ id, companyId });
    if (!customer) throw new NotFoundException('Cliente no encontrado');
    Object.assign(
      customer,
      pick(data, ['name', 'reeupCode', 'abbreviation', 'taxId', 'phone', 'email', 'ircc', 'province', 'country', 'address', 'isActive'] as const),
    );
    return this.customerRepo.save(customer);
  }

  async deleteCustomer(companyId: number, id: string) {
    const customer = await this.customerRepo.findOneBy({ id, companyId });
    if (!customer) throw new NotFoundException('Cliente no encontrado');
    customer.isActive = false;
    return this.customerRepo.save(customer);
  }

  // ══════════════════════════════════════════════════════════
  // ── CONCILIACIÓN BANCARIA ──
  // ══════════════════════════════════════════════════════════

  async createReconciliation(companyId: number, data: any) {
    const bank = await this.bankRepo.findOneBy({ id: data.bankAccountId, companyId });
    if (!bank) throw new NotFoundException('Cuenta bancaria no encontrada');

    const bookBalance = Number(bank.balance);
    const statementBalance = Number(data.statementBalance);
    const depositsInTransit = Number(data.depositsInTransit || 0);
    const outstandingChecks = Number(data.outstandingChecks || 0);
    const bankCharges = Number(data.bankCharges || 0);
    const interestEarned = Number(data.interestEarned || 0);

    const adjustedStatement = statementBalance + depositsInTransit - outstandingChecks;
    const adjustedBook = bookBalance - bankCharges + interestEarned;
    const difference = Math.abs(adjustedStatement - adjustedBook);

    const statementNumber = await this.sequenceService.nextFormatted(
      companyId,
      'bank-statement',
      'EC',
    );

    const reconciliation = this.reconciliationRepo.create({
      companyId,
      statementNumber,
      bankAccountId: data.bankAccountId,
      reconciliationDate: data.reconciliationDate,
      statementBalance,
      bookBalance,
      adjustedStatementBalance: adjustedStatement,
      adjustedBookBalance: adjustedBook,
      difference,
      depositsInTransit,
      outstandingChecks,
      bankCharges,
      interestEarned,
      notes: data.notes,
      reconciledBy: data.reconciledBy || 'Sistema',
      status: difference < 0.01 ? 'reconciled' : 'difference',
    });

    return this.reconciliationRepo.save(reconciliation);
  }

  async getReconciliations(companyId: number, bankAccountId?: string) {
    const where: any = { companyId };
    if (bankAccountId) where.bankAccountId = bankAccountId;
    return this.reconciliationRepo.find({
      where,
      relations: ['bankAccount', 'company'],
      order: { reconciliationDate: 'DESC' },
    });
  }

  async getReconciliation(companyId: number, id: string) {
    const rec = await this.reconciliationRepo.findOneBy({ id, companyId });
    if (!rec) throw new NotFoundException('Conciliación no encontrada');
    return rec;
  }

  async completeReconciliation(companyId: number, id: string) {
    const rec = await this.getReconciliation(companyId, id);
    rec.status = rec.difference > 0.01 ? 'corrected' : 'reconciled';
    return this.reconciliationRepo.save(rec);
  }

  // ══════════════════════════════════════════════════════════
  // ── CONCEPTOS DE CONTRAPARTIDA ──
  // ══════════════════════════════════════════════════════════

  async findCounterpartConcepts(
    direction?: 'income' | 'expense',
  ): Promise<CounterpartConcept[]> {
    const qb = this.counterpartConceptRepo
      .createQueryBuilder('cc')
      .where('cc.is_active = :active', { active: true })
      .orderBy('cc.sort_order', 'ASC')
      .addOrderBy('cc.code', 'ASC');

    if (direction) {
      qb.andWhere('cc.direction IN (:...dirs)', { dirs: [direction, 'both'] });
    }
    return qb.getMany();
  }

  async findOneCounterpartConcept(code: string): Promise<CounterpartConcept | null> {
    return this.counterpartConceptRepo.findOneBy({ code, isActive: true });
  }
}