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
import { VoucherService } from '../accounting/voucher.service';
import { AccountMappingService } from '../accounting/account-mapping.service';
import { MappingType } from '../entities/account-mapping.entity';
import { DocumentSequenceService } from '../common/sequence/document-sequence.service';

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
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    private readonly voucherService: VoucherService,
    private readonly accountMappingService: AccountMappingService,
    private readonly sequenceService: DocumentSequenceService,
    private readonly entityManager: EntityManager,
    private readonly dataSource: DataSource,
  ) {}

  // ════════════════════════════════════════════════════════
  // ── ANTIGÜEDAD DE SALDOS ──
  // ════════════════════════════════════════════════════════

  /** Clasifica los días de mora en los tramos del reporte de antigüedad. */
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

  /**
   * Recalcula días de mora, tramo de antigüedad y estado 'overdue' de todas las
   * cuentas por cobrar y por pagar pendientes.
   *
   * Sin este recálculo, los reportes de antigüedad quedan congelados en el
   * momento de emisión del documento.
   */
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
      .orderBy('ar.due_date', 'ASC');

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
    return ar;
  }

  async createReceivable(companyId: number, data: any) {
    const arNumber = await this.sequenceService.nextFormatted(
      companyId,
      'account-receivable-manual',
      'CXC',
    );
    const ar = this.arRepo.create({
      ...data,
      companyId,
      arNumber,
      balanceAmount: data.originalAmount,
    });
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
      .orderBy('ap.due_date', 'ASC');

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
    return ap;
  }

  async createPayable(companyId: number, data: any, manager?: EntityManager) {
    const apNumber = await this.sequenceService.nextFormatted(
      companyId,
      'account-payable',
      'CXP',
      { manager },
    );
    const apRepo = manager ? manager.getRepository(AccountPayable) : this.apRepo;
    const ap = apRepo.create({
      ...data,
      companyId,
      apNumber,
      balanceAmount: data.originalAmount,
    });
    return apRepo.save(ap);
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
    const ba = this.bankRepo.create({ ...data, companyId });
    return this.bankRepo.save(ba);
  }

  async updateBankAccount(companyId: number, id: string, data: any) {
    const ba = await this.findOneBankAccount(companyId, id);
    Object.assign(ba, data);
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

  /**
   * Aplica una variación al saldo bancario en una única sentencia SQL.
   * Evita las condiciones de carrera del patrón leer → sumar → guardar.
   */
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

  async createBankTransaction(companyId: number, data: any, manager?: EntityManager) {
    const ba = await this.findOneBankAccount(companyId, data.bankAccountId, manager);

    const txRepo = manager ? manager.getRepository(BankTransaction) : this.txRepo;
    const tx = txRepo.create({ ...data });
    const saved = await txRepo.save(tx);

    // Actualizar saldo de la cuenta de forma atómica
    await this.applyBankBalanceDelta(
      companyId,
      ba.id,
      data.transactionType === 'credit'
        ? Number(data.amount)
        : -Number(data.amount),
      manager,
    );

    return saved;
  }

  /**
   * Reversar una transacción bancaria identificada por su referenceNumber.
   * Crea una nueva transacción del tipo opuesto con parentTransactionId
   * apuntando al original, restaurando el saldo bancario (RH-07).
   */
  async reverseBankTransaction(companyId: number, referenceNumber: string, description?: string) {
    const original = await this.txRepo.findOne({
      where: { companyId, referenceNumber },
    });
    if (!original) {
      this.logger.warn(`No se encontró BankTransaction con reference ${referenceNumber}`);
      return null;
    }

    const existingReversal = await this.txRepo.findOne({
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
    const reversal = this.txRepo.create({
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
      parentTransactionId: original.id,
    });
    const saved = await this.txRepo.save(reversal);

    await this.applyBankBalanceDelta(
      companyId,
      original.bankAccountId,
      reverseType === 'credit' ? Number(original.amount) : -Number(original.amount),
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

    // Cuenta de contrapartida del asiento: se determina según la naturaleza de
    // la obligación que se cancela, no siempre "Cuentas por Pagar a Proveedores".
    let counterpartAccount: string | undefined;
    let counterpartReference: string | undefined;

    const result = await this.dataSource.transaction(async (manager) => {
    const arRepo = manager.getRepository(AccountReceivable);
    const apRepo = manager.getRepository(AccountPayable);

    // ── Validación contra el saldo pendiente y actualización del submayor ──
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
      // La cuenta de contrapartida la fija la propia obligación si la conoce
      // (nóminas 455, retenciones 460, tributos 440…); en su defecto, proveedores.
      counterpartAccount = ap.accountCode || undefined;
      counterpartReference = ap.supplierNit || ap.supplierName;
    }

    const paymentNumber = await this.sequenceService.nextFormatted(
      companyId,
      'payment',
      'PAG',
      { manager },
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const paymentData: Partial<Payment> = {
      ...data,
      companyId,
      paymentNumber,
      status: 'completed',
    };
    const paymentRepo = manager.getRepository(Payment);
    const payment = paymentRepo.create(paymentData as Payment);
    const saved = await paymentRepo.save(payment);

    // Actualizar CxC o CxP
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

        // Sincronizar el estado del documento de origen: la factura y su
        // cuenta por cobrar deben reflejar siempre la misma realidad.
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

    // ── Generar comprobante contable ──
    await this.createPaymentVoucher(companyId, saved, {
      ...data,
      counterpartAccount,
      counterpartReference,
    }, manager);

    // ── Registrar movimiento según método de pago ──
    if (data.paymentMethod === 'bank_transfer' || data.paymentMethod === 'check' ||
        data.paymentMethod === 'credit_card' || data.paymentMethod === 'debit_card') {
      // Pago por banco → crear BankTransaction + actualizar saldo
      if (data.bankAccountId) {
        await this.registerBankMovementFromPayment(companyId, saved, data, manager);
      }
    } else if (data.paymentMethod === 'cash') {
      // Pago en efectivo → crear CashMovement + actualizar saldo de caja
      await this.registerCashMovementFromPayment(companyId, saved, data, manager);
    }

    return saved;
    });

    return result;
  }

  /**
   * Refleja en la factura el estado real de su cuenta por cobrar.
   * Es el único punto donde la factura pasa a 'paid', de modo que el cobro se
   * contabiliza una sola vez (aquí) y ambos documentos nunca divergen.
   */
  private async syncInvoiceStatusFromReceivable(
    companyId: number,
    ar: AccountReceivable,
    manager?: EntityManager,
  ) {
    if (!ar.invoiceId) return;

    const invoiceRepo = manager ? manager.getRepository(Invoice) : this.invoiceRepo;
    const invoice = await invoiceRepo.findOne({
      where: { id: ar.invoiceId, companyId },
    });
    if (!invoice || invoice.status === 'cancelled') return;

    const newStatus =
      ar.status === 'paid'
        ? 'paid'
        : Number(ar.paidAmount) > 0
          ? 'partial'
          : invoice.status;

    if (invoice.status !== newStatus) {
      invoice.status = newStatus;
      await invoiceRepo.save(invoice);
      this.logger.log(
        `Factura ${invoice.invoiceNumber} sincronizada a estado '${newStatus}' desde la CxC ${ar.arNumber}`,
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

    // Actualizar saldo bancario de forma atómica: la lectura-modificación-
    // escritura en memoria pierde operaciones concurrentes.
    await this.applyBankBalanceDelta(
      companyId,
      ba.id,
      isIncome ? Number(data.amount) : -Number(data.amount),
      manager,
    );

    this.logger.log(`BankTransaction ${tx.transactionNumber} creada desde Payment ${payment.paymentNumber}`);
  }

  private async registerCashMovementFromPayment(companyId: number, payment: Payment, data: any, manager?: EntityManager) {
    // Buscar caja activa (abierta) o la default
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

    // Actualizar saldo de caja
    cashRegister.currentBalance = newBalance;
    await cashRegisterRepo.save(cashRegister);

    // Advertir si excede límite de retención
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

    // Cuenta de tesorería según el método de pago, tomada del mapeo de cuentas
    // de la empresa (nunca codificada en duro).
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

    const cashAccountCode =
      (await this.accountMappingService.getAccountForMapping(
        companyId,
        treasuryMapping,
      )) || '101';

    // Líneas del comprobante
    const lines: any[] = [];

    if (isIncome) {
      // Cobro de cliente: entra efectivo (DEBE) y se cancela la CxC (HABER)
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
        accountCode: receivableAccount, // Cuentas por Cobrar a Clientes
        debit: 0,
        credit: amount,
        description: `Cobro ${payment.paymentNumber} - ${data.description || ''}`,
        reference: data.counterpartReference || data.counterpartyName || null,
      });
    } else {
      // Pago de una obligación: se debita la cuenta donde está registrada
      // (proveedores 410, nóminas 455, retenciones 460, tributos 440…) y sale
      // el efectivo (HABER).
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
      this.logger.error(`Error generando voucher para Payment ${payment.paymentNumber}: ${error.message}`);
      // El voucher borrador del pago es obligatorio; si no se puede generar,
      // la operación no debe quedar registrada sin él.
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
      ...data,
      companyId,
      registerCode,
      status: isOpen ? 'open' : 'closed',
      openingBalance,
      currentBalance: openingBalance,
      lastOpeningDate: isOpen ? new Date() : null,
    });
    const saved = await this.cashRegisterRepo.save(cr);
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
    Object.assign(cr, data);
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

    // Registrar movimiento de apertura
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

    // Registrar movimiento de cierre
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
      // Registrar ajuste
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

    // Debitar caja
    cr.currentBalance = Number(cr.currentBalance) - amount;
    await this.cashRegisterRepo.save(cr);

    // Registrar movimiento de caja (salida)
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

    // Acreditar banco
    ba.balance = Number(ba.balance) + amount;
    ba.availableBalance = ba.balance;
    await this.bankRepo.save(ba);

    // Registrar transacción bancaria
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

    const reconciliation = this.reconciliationRepo.create({
      companyId,
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
      status: difference < 0.01 ? 'completed' : 'draft',
    });

    return this.reconciliationRepo.save(reconciliation);
  }

  async getReconciliations(companyId: number, bankAccountId?: string) {
    const where: any = { companyId };
    if (bankAccountId) where.bankAccountId = bankAccountId;
    return this.reconciliationRepo.find({
      where,
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
    if (rec.difference > 0.01) {
      throw new BadRequestException(
        `La conciliación tiene una diferencia de ${rec.difference.toFixed(2)}. Ajuste los valores antes de completar.`,
      );
    }
    rec.status = 'completed';
    return this.reconciliationRepo.save(rec);
  }
}
