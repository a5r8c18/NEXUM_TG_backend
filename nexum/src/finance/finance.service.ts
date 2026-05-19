import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountReceivable } from '../entities/account-receivable.entity';
import { AccountPayable } from '../entities/account-payable.entity';
import { BankAccount } from '../entities/bank-account.entity';
import { BankTransaction } from '../entities/bank-transaction.entity';
import { Payment } from '../entities/payment.entity';

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
    const payment = this.paymentRepo.create({
      ...data,
      companyId,
      paymentNumber: `PAG-${String(count + 1).padStart(6, '0')}`,
      status: 'completed',
    });

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

    // Actualizar saldo bancario si se paga por banco
    if (data.bankAccountId) {
      const ba = await this.bankRepo.findOne({ where: { id: data.bankAccountId, companyId } });
      if (ba) {
        if (data.paymentType === 'receivable') {
          ba.balance = Number(ba.balance) + Number(data.amount);
        } else {
          ba.balance = Number(ba.balance) - Number(data.amount);
        }
        ba.availableBalance = ba.balance;
        await this.bankRepo.save(ba);
      }
    }

    return saved;
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
  // ── DASHBOARD FINANCIERO ──
  // ══════════════════════════════════════════════════════════

  async getFinanceDashboard(companyId: number) {
    const [arStats, apStats, bankStats, payStats] = await Promise.all([
      this.getReceivableStatistics(companyId),
      this.getPayableStatistics(companyId),
      this.getBankStatistics(companyId),
      this.getPaymentStatistics(companyId),
    ]);

    return {
      receivables: arStats,
      payables: apStats,
      banks: bankStats,
      payments: payStats,
    };
  }
}
