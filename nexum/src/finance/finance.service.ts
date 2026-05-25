import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountReceivable } from '../entities/account-receivable.entity';
import { AccountPayable } from '../entities/account-payable.entity';
import { BankAccount } from '../entities/bank-account.entity';
import { BankTransaction } from '../entities/bank-transaction.entity';
import { Payment } from '../entities/payment.entity';
import { CashRegister } from '../entities/cash-register.entity';
import { CashMovement } from '../entities/cash-movement.entity';
import { BankReconciliation } from '../entities/bank-reconciliation.entity';
import { VoucherService } from '../accounting/voucher.service';

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
    private readonly voucherService: VoucherService,
  ) {}

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
    const count = await this.arRepo.count({ where: { companyId } });
    const ar = this.arRepo.create({
      ...data,
      companyId,
      arNumber: `CXC-${String(count + 1).padStart(6, '0')}`,
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

  async createPayable(companyId: number, data: any) {
    const count = await this.apRepo.count({ where: { companyId } });
    const ap = this.apRepo.create({
      ...data,
      companyId,
      apNumber: `CXP-${String(count + 1).padStart(6, '0')}`,
      balanceAmount: data.originalAmount,
    });
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

  async findOneBankAccount(companyId: number, id: string) {
    const ba = await this.bankRepo.findOne({
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

  async createBankTransaction(companyId: number, data: any) {
    const ba = await this.findOneBankAccount(companyId, data.bankAccountId);

    const tx = this.txRepo.create({ ...data });
    const saved = await this.txRepo.save(tx);

    // Actualizar saldo de la cuenta
    if (data.transactionType === 'credit') {
      ba.balance = Number(ba.balance) + Number(data.amount);
    } else {
      ba.balance = Number(ba.balance) - Number(data.amount);
    }
    ba.availableBalance = ba.balance;
    await this.bankRepo.save(ba);

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
    const count = await this.paymentRepo.count({ where: { companyId } });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const paymentData: Partial<Payment> = {
      ...data,
      companyId,
      paymentNumber: `PAG-${String(count + 1).padStart(6, '0')}`,
      status: 'completed',
    };
    const payment = this.paymentRepo.create(paymentData as Payment);
    const saved = await this.paymentRepo.save(payment);

    // Actualizar CxC o CxP
    if (data.accountReceivableId) {
      const ar = await this.arRepo.findOne({ where: { id: data.accountReceivableId, companyId } });
      if (ar) {
        ar.paidAmount = Number(ar.paidAmount) + Number(data.amount);
        ar.balanceAmount = Number(ar.originalAmount) - Number(ar.paidAmount);
        ar.lastPaymentDate = data.paymentDate;
        ar.lastPaymentAmount = data.amount;
        ar.status = ar.balanceAmount <= 0 ? 'paid' : 'partial';
        await this.arRepo.save(ar);
      }
    }
    if (data.accountPayableId) {
      const ap = await this.apRepo.findOne({ where: { id: data.accountPayableId, companyId } });
      if (ap) {
        ap.paidAmount = Number(ap.paidAmount) + Number(data.amount);
        ap.balanceAmount = Number(ap.originalAmount) - Number(ap.paidAmount);
        ap.lastPaymentDate = data.paymentDate;
        ap.lastPaymentAmount = data.amount;
        ap.status = ap.balanceAmount <= 0 ? 'paid' : 'partial';
        await this.apRepo.save(ap);
      }
    }

    // ── Generar comprobante contable ──
    await this.createPaymentVoucher(companyId, saved, data);

    // ── Registrar movimiento según método de pago ──
    if (data.paymentMethod === 'bank_transfer' || data.paymentMethod === 'check' ||
        data.paymentMethod === 'credit_card' || data.paymentMethod === 'debit_card') {
      // Pago por banco → crear BankTransaction + actualizar saldo
      if (data.bankAccountId) {
        await this.registerBankMovementFromPayment(companyId, saved, data);
      }
    } else if (data.paymentMethod === 'cash') {
      // Pago en efectivo → crear CashMovement + actualizar saldo de caja
      await this.registerCashMovementFromPayment(companyId, saved, data);
    }

    return saved;
  }

  private async registerBankMovementFromPayment(companyId: number, payment: Payment, data: any) {
    const ba = await this.bankRepo.findOne({ where: { id: data.bankAccountId, companyId } });
    if (!ba) return;

    const isIncome = data.paymentType === 'receivable';
    const txCount = await this.txRepo.count({ where: { companyId } });

    const tx = this.txRepo.create({
      transactionNumber: `TXB-${String(txCount + 1).padStart(6, '0')}`,
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
    await this.txRepo.save(tx);

    // Actualizar saldo bancario
    if (isIncome) {
      ba.balance = Number(ba.balance) + Number(data.amount);
    } else {
      ba.balance = Number(ba.balance) - Number(data.amount);
    }
    ba.availableBalance = ba.balance;
    await this.bankRepo.save(ba);

    this.logger.log(`BankTransaction ${tx.transactionNumber} creada desde Payment ${payment.paymentNumber}`);
  }

  private async registerCashMovementFromPayment(companyId: number, payment: Payment, data: any) {
    // Buscar caja activa (abierta) o la default
    let cashRegister = await this.cashRegisterRepo.findOne({
      where: { companyId, status: 'open' },
    });
    if (!cashRegister) {
      cashRegister = await this.cashRegisterRepo.findOne({
        where: { companyId, isDefault: true },
      });
    }
    if (!cashRegister) {
      this.logger.warn(`No hay caja abierta ni default para companyId=${companyId}. Pago en efectivo registrado sin movimiento de caja.`);
      return;
    }

    const isIncome = data.paymentType === 'receivable';
    const cmCount = await this.cashMovementRepo.count({ where: { companyId } });

    const newBalance = isIncome
      ? Number(cashRegister.currentBalance) + Number(data.amount)
      : Number(cashRegister.currentBalance) - Number(data.amount);

    const cm = this.cashMovementRepo.create({
      movementNumber: `CAJ-${String(cmCount + 1).padStart(6, '0')}`,
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
    await this.cashMovementRepo.save(cm);

    // Actualizar saldo de caja
    cashRegister.currentBalance = newBalance;
    await this.cashRegisterRepo.save(cashRegister);

    // Advertir si excede límite de retención
    if (newBalance > Number(cashRegister.maxRetentionLimit)) {
      this.logger.warn(
        `Caja ${cashRegister.registerCode} excede límite de retención: $${newBalance} > $${cashRegister.maxRetentionLimit}. Se debe depositar en banco.`,
      );
    }

    this.logger.log(`CashMovement ${cm.movementNumber} creada desde Payment ${payment.paymentNumber}`);
  }

  private async createPaymentVoucher(companyId: number, payment: Payment, data: any) {
    const isIncome = data.paymentType === 'receivable';
    const amount = Number(data.amount);

    // Determinar cuenta de efectivo/banco según método de pago
    let cashAccountCode: string;
    if (data.paymentMethod === 'cash') {
      cashAccountCode = '101'; // Efectivo en Caja
    } else if (data.paymentMethod === 'bank_transfer' || data.paymentMethod === 'check') {
      cashAccountCode = '110'; // Efectivo en Banco
    } else if (data.paymentMethod === 'credit_card' || data.paymentMethod === 'debit_card') {
      cashAccountCode = '112'; // Tarjetas de Crédito
    } else {
      cashAccountCode = '101'; // Default a caja
    }

    // Líneas del comprobante
    const lines: any[] = [];

    if (isIncome) {
      // Cobro: Abonar CxC (débito) y registrar efectivo (crédito)
      lines.push({
        accountCode: '135', // Cuentas por Cobrar a Clientes
        debit: amount,
        credit: 0,
        description: `Cobro ${payment.paymentNumber} - ${data.description || ''}`,
      });
      lines.push({
        accountCode: cashAccountCode,
        debit: 0,
        credit: amount,
        description: `Ingreso por ${data.paymentMethod}`,
      });
    } else {
      // Pago: Abonar CxP (crédito) y registrar salida de efectivo (débito)
      lines.push({
        accountCode: cashAccountCode,
        debit: amount,
        credit: 0,
        description: `Pago por ${data.paymentMethod}`,
      });
      lines.push({
        accountCode: '136', // Cuentas por Pagar a Proveedores
        debit: 0,
        credit: amount,
        description: `Pago ${payment.paymentNumber} - ${data.description || ''}`,
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
      );
      this.logger.log(`Voucher generado para Payment ${payment.paymentNumber}`);
    } catch (error) {
      this.logger.error(`Error generando voucher para Payment ${payment.paymentNumber}: ${error.message}`);
      // No fallar el pago si falla el voucher
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
    const count = await this.cashRegisterRepo.count({ where: { companyId } });
    const cr = this.cashRegisterRepo.create({
      ...data,
      companyId,
      registerCode: data.registerCode || `CAJA-${String(count + 1).padStart(3, '0')}`,
      status: 'closed',
      currentBalance: data.openingBalance || 0,
    });
    return this.cashRegisterRepo.save(cr);
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
    const cmCount = await this.cashMovementRepo.count({ where: { companyId } });
    const cm = this.cashMovementRepo.create({
      movementNumber: `CAJ-${String(cmCount + 1).padStart(6, '0')}`,
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
    const cmCount = await this.cashMovementRepo.count({ where: { companyId } });
    const cm = this.cashMovementRepo.create({
      movementNumber: `CAJ-${String(cmCount + 1).padStart(6, '0')}`,
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
      const cmCount = await this.cashMovementRepo.count({ where: { companyId } });
      const cm = this.cashMovementRepo.create({
        movementNumber: `CAJ-${String(cmCount + 1).padStart(6, '0')}`,
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
