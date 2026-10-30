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
    const ar = this.arRepo.create({
      ...fields,
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

    const banks = await qb.getMany();
    const bankAccountCode = await this.accountMappingService.getAccountForMapping(companyId, MappingType.TREASURY_BANK);
    const cardAccountCode = await this.accountMappingService.getAccountForMapping(companyId, MappingType.TREASURY_CARD);
    for (const ba of banks) {
      ba.accountingAccount = ba.accountingAccount || (ba.accountType === 'mlc'
        ? (cardAccountCode || bankAccountCode)
        : bankAccountCode);
    }
    return banks;
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
    if (!ba.accountName?.trim()) ba.accountName = ba.bankName;
    if (!ba.openingDate) ba.openingDate = new Date().toISOString().split('T')[0];
    return this.bankRepo.save(ba);
  }

  async getBankStatistics(companyId: number) {
    const all = await this.bankRepo.find({ where: { companyId } });
    const totalBalance = all.reduce((s, a) => s + Number(a.balance), 0);
    const activeAccounts = all.filter(a => a.status === 'active').length;
    return { total: all.length, activeAccounts, totalBalance };
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

    const txRepo = manager.getRepository(BankTransaction);
    const tx = txRepo.create({
      ...pick(data, BANK_TRANSACTION_FIELDS),
      counterpartConceptCode: concept?.code ?? null,
      counterpartyAccount: data.counterpartyAccount ?? null,
      counterpartyName: data.counterpartyName ?? null,
      transactionNumber,
      description: data.description || transactionCode || data.transactionType,
      transactionDate: data.transactionDate || new Date().toISOString().split('T')[0],
      currency: data.currency || 'CUP',
      exchangeRate: data.exchangeRate ?? 1,
      companyId,
      bankAccountId: ba.id,
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

    if (isOpeningEntry) {
      await this.createOpeningEntryVoucher(companyId, saved, manager);
    }

    if (data.accountReceivableId) {
      await this.settleReceivableFromBankTransaction(companyId, saved, data, manager);
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

    const bankAccountCode =
      ba.accountingAccount ||
      (ba.accountType === 'mlc'
        ? await this.accountMappingService.getAccountForMapping(companyId, MappingType.TREASURY_CARD)
        : null) ||
      (await this.accountMappingService.getAccountForMapping(companyId, MappingType.TREASURY_BANK)) ||
      '110';

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
    if (payment.accountReceivableId) {
      const arRepo = manager.getRepository(AccountReceivable);
      const ar = await arRepo.findOne({
        where: { id: payment.accountReceivableId, companyId },
      });
      if (ar) {
        ar.paidAmount = Math.max(
          0,
          Math.round((Number(ar.paidAmount) - Number(payment.amount)) * 100) / 100,
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
    try {
      const vouchers = await this.voucherService.findVouchersBySourceDocumentId(
        companyId,
        sourceDocumentId,
        'finance',
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
    } catch (error) {
      this.logger.warn(
        `No se pudieron cancelar los vouchers de ${label}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
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

      const effectiveCode = data.transactionCode ?? tx.transactionCode ?? '';
      const isOpeningEntry = effectiveCode === OPENING_ENTRY_CODE;
      const wasOpeningEntry = tx.transactionCode === OPENING_ENTRY_CODE;
      const openingSnapshot = [
        tx.bankAccountId, Number(tx.amount), Number(tx.exchangeRate), tx.transactionDate, tx.counterpartyAccount, tx.notes,
      ].join('|');

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
          tx.counterpartConceptCode = concept.code;
        }
        tx.counterpartyAccount = null;
        if (data.counterpartyName !== undefined) tx.counterpartyName = data.counterpartyName;
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

      // Carga Inicial: mantener su comprobante contable alineado con el banco.
      const openingChanged =
        [savedTx.bankAccountId, Number(savedTx.amount), Number(savedTx.exchangeRate), savedTx.transactionDate, savedTx.counterpartyAccount, savedTx.notes].join('|') !==
        openingSnapshot;
      if ((wasOpeningEntry && !isOpeningEntry) || (isOpeningEntry && (!wasOpeningEntry || openingChanged))) {
        await this.cancelSourceVouchers(companyId, savedTx.id, `BankTransaction ${savedTx.transactionNumber}`, manager);
        if (isOpeningEntry) await this.createOpeningEntryVoucher(companyId, savedTx, manager);
      }

      // Si cambió de banco, arrastrar el Payment vinculado (si existe).
      if (bankChanged) {
        const paymentRepo = manager.getRepository(Payment);
        const linkedPayment = await paymentRepo.findOne({
          where: {
            companyId,
            referenceNumber: savedTx.transactionNumber,
            paymentType: 'receivable' as any,
          },
        });
        if (linkedPayment) {
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

      if (!voucherAlreadyFresh && (bankChanged || newSigned !== oldSigned)) {
        const currentPayment = await manager.getRepository(Payment).findOne({
          where: {
            companyId,
            referenceNumber: savedTx.transactionNumber,
            paymentType: 'receivable' as any,
          },
        });
        if (currentPayment?.accountReceivableId) {
          await this.regenerateReceivablePaymentVoucher(companyId, currentPayment, manager);
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

      // 1) Revertir liquidación de CxC si el comprobante la originó.
      const paymentRepo = manager.getRepository(Payment);
      const linkedPayment = await paymentRepo.findOne({
        where: {
          companyId,
          referenceNumber: tx.transactionNumber,
          paymentType: 'receivable' as any,
        },
      });

      if (linkedPayment?.accountReceivableId) {
        const arRepo = manager.getRepository(AccountReceivable);
        const ar = await arRepo.findOne({
          where: { id: linkedPayment.accountReceivableId, companyId },
        });
        if (ar) {
          ar.paidAmount = Math.max(
            0,
            Math.round((Number(ar.paidAmount) - Number(linkedPayment.amount)) * 100) /
              100,
          );
          ar.balanceAmount =
            Math.round((Number(ar.originalAmount) - Number(ar.paidAmount)) * 100) /
            100;
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
        await this.cancelPaymentVouchers(companyId, linkedPayment, manager);
        await paymentRepo.remove(linkedPayment);
      }

      // 2) Revertir saldo bancario y eliminar el comprobante.
      const delta =
        tx.transactionType === 'credit' ? -Number(tx.amount) : Number(tx.amount);
      await this.applyBankBalanceDelta(companyId, tx.bankAccountId, delta, manager);
      if (tx.transactionCode === OPENING_ENTRY_CODE) {
        await this.cancelSourceVouchers(companyId, tx.id, `BankTransaction ${tx.transactionNumber}`, manager);
      }
      await txRepo.remove(tx);

      return { deleted: true };
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
      parentTransactionId: original.id,
    });
    const saved = await txRepo.save(reversal);

    await this.applyBankBalanceDelta(
      companyId,
      original.bankAccountId,
      reverseType === 'credit' ? Number(original.amount) : -Number(original.amount),
      manager,
    );

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
    let cashRegister = await cashRegisterRepo.findOne({
      where: { companyId, status: 'open' },
    });
    if (!cashRegister) {
      cashRegister = await cashRegisterRepo.findOne({
        where: { companyId, isDefault: true },
      });
    }
    if (!cashRegister) {
      this.logger.warn(`No hay caja abierta ni default para companyId=${companyId}. Pago en efectivo registrado sin movimiento de caja.`);
      return;
    }

    const isIncome = data.paymentType === 'receivable';
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
      documentType: isIncome ? 'recibo_cobro' : 'vale_caja',
      documentNumber: payment.paymentNumber,
      counterpartyName: data.counterpartyName || null,
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

    // Si el pago está vinculado a una cuenta bancaria, se usa la cuenta
    // contable a la que está asociada en Finanzas (no la genérica 110).
    const bankAccountId = payment.bankAccountId || data.bankAccountId;
    const linkedBank =
      treasuryMapping !== MappingType.TREASURY_CASH && bankAccountId
        ? await (manager ? manager.getRepository(BankAccount) : this.bankRepo).findOneBy({
            id: bankAccountId,
            companyId,
          })
        : null;

    const cashAccountCode =
      linkedBank?.accountingAccount ||
      (await this.accountMappingService.getAccountForMapping(
        companyId,
        treasuryMapping,
      )) || '101';

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
    const totalReceived = all
      .filter(p => p.paymentType === 'receivable' && p.status === 'completed')
      .reduce((s, p) => s + Number(p.amount), 0);
    const totalPaid = all
      .filter(p => p.paymentType === 'payable' && p.status === 'completed')
      .reduce((s, p) => s + Number(p.amount), 0);
    return { total: all.length, totalReceived, totalPaid };
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
    const cr = await this.findOneCashRegister(companyId, cashRegisterId);
    if (Number(cr.currentBalance) < amount) {
      throw new BadRequestException(`Saldo insuficiente en caja. Disponible: $${cr.currentBalance}`);
    }

    const ba = await this.findOneBankAccount(companyId, bankAccountId);

    cr.currentBalance = Number(cr.currentBalance) - amount;
    await this.cashRegisterRepo.save(cr);

    const cmCount = await this.cashMovementRepo.count({ where: { companyId } });
    const cm = this.cashMovementRepo.create({
      movementNumber: `CAJ-${String(cmCount + 1).padStart(6, '0')}`,
      movementDate: new Date(),
      movementType: 'expense' as const,
      amount,
      balanceAfter: Number(cr.currentBalance),
      description: description || `Depósito a banco ${ba.bankName} - ${ba.accountNumber}`,
      documentType: 'deposito_banco' as const,
      cashRegisterId: cr.id,
      companyId,
    });
    await this.cashMovementRepo.save(cm);

    ba.balance = Number(ba.balance) + amount;
    ba.availableBalance = ba.balance;
    await this.bankRepo.save(ba);

    const txCount = await this.txRepo.count({ where: { companyId } });
    const tx = this.txRepo.create({
      transactionNumber: `TXB-${String(txCount + 1).padStart(6, '0')}`,
      transactionDate: new Date().toISOString().split('T')[0],
      transactionType: 'credit' as const,
      amount,
      description: description || `Depósito desde caja ${cr.registerCode}`,
      referenceNumber: cm.movementNumber,
      bankAccountId,
      companyId,
    });
    await this.txRepo.save(tx);

    this.logger.log(`Depósito $${amount} desde caja ${cr.registerCode} a banco ${ba.accountNumber}`);
    return { cashRegister: cr, bankAccount: ba, cashMovement: cm, bankTransaction: tx };
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

  async createCashMovement(companyId: number, data: any, manager?: EntityManager) {
    const crRepo = manager ? manager.getRepository(CashRegister) : this.cashRegisterRepo;
    const cr = await crRepo.findOne({ where: { id: data.cashRegisterId, companyId } });
    if (!cr) throw new NotFoundException(`Caja ${data.cashRegisterId} no encontrada`);
    if (cr.status !== 'open') {
      throw new BadRequestException(`La caja ${cr.registerCode} no está abierta`);
    }

    const movementType = data.movementType;
    const amount = Number(data.amount);
    if (!['income', 'expense'].includes(movementType)) {
      throw new BadRequestException('Tipo de movimiento inválido; use income o expense');
    }
    if (movementType === 'expense' && Number(cr.currentBalance) < amount) {
      throw new BadRequestException(`Saldo insuficiente en caja ${cr.registerCode}. Disponible: $${cr.currentBalance}`);
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

    const cmRepo = manager ? manager.getRepository(CashMovement) : this.cashMovementRepo;
    const cm = cmRepo.create({
      movementNumber,
      movementDate: data.movementDate || new Date(),
      movementType,
      amount,
      balanceAfter: Number(cr.currentBalance),
      description: data.description,
      concept: data.concept || null,
      counterpartyName: data.counterpartyName || null,
      documentType: movementType === 'income' ? 'recibo_cobro' : 'vale_caja',
      cashRegisterId: cr.id,
      companyId,
    });
    const saved = await cmRepo.save(cm);
    return { cashMovement: saved, cashRegister: cr };
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