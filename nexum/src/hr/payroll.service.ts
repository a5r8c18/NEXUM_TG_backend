/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { Payroll, PayrollItem } from '../entities';
import { Employee } from '../entities/employee.entity';
import { Attendance } from '../entities/attendance.entity';
import { LeaveRequest } from '../entities/leave-request.entity';
import { Payment } from '../entities/payment.entity';
import { VoucherService } from '../accounting/voucher.service';
import { AccountMappingService } from '../accounting/account-mapping.service';
import { MappingType } from '../entities/account-mapping.entity';
import { FinanceService } from '../finance/finance.service';

// Contribución Especial a la Seguridad Social del trabajador (Cuba): 5% del salario.
const EMPLOYEE_SOCIAL_SECURITY_RATE = 0.05;
// Cuota patronal de Seguridad Social (Cuba): 14,5% del salario.
const EMPLOYER_SOCIAL_SECURITY_RATE = 0.145;
// Jornada legal mensual promedio en Cuba (horas) para el cálculo del salario/hora.
const MONTHLY_LEGAL_HOURS = 190.6;
// Días promedio del mes para el cálculo del salario diario (descuentos por ausencia).
const DAYS_PER_MONTH = 30;

/** Días de solapamiento (inclusivos) entre dos rangos de fechas. */
function overlapDays(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): number {
  const start = new Date(Math.max(new Date(aStart).getTime(), new Date(bStart).getTime()));
  const end = new Date(Math.min(new Date(aEnd).getTime(), new Date(bEnd).getTime()));
  const ms = end.getTime() - start.getTime();
  if (isNaN(ms) || ms < 0) return 0;
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
}

@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name);

  constructor(
    @InjectRepository(Payroll)
    private readonly payrollRepo: Repository<Payroll>,
    @InjectRepository(PayrollItem)
    private readonly payrollItemRepo: Repository<PayrollItem>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(Attendance)
    private readonly attendanceRepo: Repository<Attendance>,
    @InjectRepository(LeaveRequest)
    private readonly leaveRepo: Repository<LeaveRequest>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @Inject(forwardRef(() => VoucherService))
    private readonly voucherService: VoucherService,
    private readonly accountMappingService: AccountMappingService,
    @Inject(forwardRef(() => FinanceService))
    private readonly financeService: FinanceService,
  ) {}

  async findAll(
    companyId: number,
    filters?: {
      period?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    const qb = this.payrollRepo
      .createQueryBuilder('payroll')
      .leftJoinAndSelect('payroll.items', 'items')
      .where('payroll.companyId = :companyId', { companyId });

    if (filters?.period) {
      qb.andWhere('payroll.period = :period', { period: filters.period });
    }
    if (filters?.status) {
      qb.andWhere('payroll.status = :status', { status: filters.status });
    }
    if (filters?.startDate) {
      qb.andWhere('payroll.startDate >= :startDate', {
        startDate: filters.startDate,
      });
    }
    if (filters?.endDate) {
      qb.andWhere('payroll.endDate <= :endDate', { endDate: filters.endDate });
    }

    qb.orderBy('payroll.createdAt', 'DESC');
    const payrolls = await qb.getMany();

    return { payrolls };
  }

  async findOne(companyId: number, id: number) {
    const payroll = await this.payrollRepo.findOne({
      where: { id, companyId },
      relations: ['items'],
    });

    if (!payroll) {
      throw new NotFoundException(`Payroll #${id} not found`);
    }

    return { payroll };
  }

  async create(
    companyId: number,
    data: {
      period: string;
      startDate: string;
      endDate: string;
      processedBy: string;
      items: Array<{
        employeeId: string;
        employeeName: string;
        employeeDocument: string;
        position: string;
        costCenterId?: string;
        baseSalary: number;
        overtimeHours: number;
        overtimePay: number;
        bonuses: number;
        commissions: number;
        allowances: number;
        socialSecurity: number;
        healthInsurance: number;
        pension: number;
        taxWithholding: number;
        otherDeductions: number;
        notes?: string;
      }>;
    },
  ) {
    // Calculate totals
    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;

    const payrollItems = data.items.map((item) => {
      const grossSalary =
        item.baseSalary +
        item.overtimePay +
        item.bonuses +
        item.commissions +
        item.allowances;
      const totalDeductionsItem =
        item.socialSecurity +
        item.healthInsurance +
        item.pension +
        item.taxWithholding +
        item.otherDeductions;
      const netSalary = grossSalary - totalDeductionsItem;

      totalGross += grossSalary;
      totalDeductions += totalDeductionsItem;
      totalNet += netSalary;

      return {
        companyId,
        employeeId: item.employeeId,
        employeeName: item.employeeName,
        employeeDocument: item.employeeDocument,
        position: item.position,
        costCenterId: item.costCenterId || null,
        baseSalary: item.baseSalary,
        overtimeHours: item.overtimeHours,
        overtimePay: item.overtimePay,
        bonuses: item.bonuses,
        commissions: item.commissions,
        allowances: item.allowances,
        grossSalary,
        socialSecurity: item.socialSecurity,
        healthInsurance: item.healthInsurance,
        pension: item.pension,
        taxWithholding: item.taxWithholding,
        otherDeductions: item.otherDeductions,
        totalDeductions: totalDeductionsItem,
        netSalary,
        notes: item.notes,
      };
    });

    // Create payroll
    const payroll = await this.payrollRepo.save({
      companyId,
      period: data.period,
      startDate: data.startDate,
      endDate: data.endDate,
      totalGross,
      totalDeductions,
      totalNet,
      status: 'draft',
      processedBy: data.processedBy,
    });

    // Create payroll items
    for (const itemData of payrollItems) {
      await this.payrollItemRepo.save({
        ...itemData,
        payrollId: payroll.id,
      });
    }

    return { payroll };
  }

  /**
   * Genera un borrador de nómina a partir de los empleados activos de la empresa.
   * Toma el salario contractual como salario base y aplica la Contribución
   * Especial a la Seguridad Social del trabajador (5%) como deducción por defecto.
   * Los importes quedan editables antes de procesar.
   */
  async generateFromEmployees(
    companyId: number,
    data: { period: string; startDate: string; endDate: string; processedBy?: string },
  ) {
    const existing = await this.payrollRepo.findOne({
      where: { companyId, period: data.period },
    });
    if (existing) {
      throw new BadRequestException(
        `Ya existe una nómina para el período ${data.period}`,
      );
    }

    const employees = await this.employeeRepo.find({
      where: { companyId, status: 'active' },
      order: { lastName: 'ASC' },
    });

    if (employees.length === 0) {
      throw new BadRequestException(
        'No hay empleados activos para generar la nómina',
      );
    }

    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;

    const items: any[] = [];
    for (const emp of employees) {
      const baseSalary = Number(emp.salary) || 0;

      // ── Horas extra reales del período (desde Asistencia) ──
      const attendances = await this.attendanceRepo.find({
        where: {
          companyId,
          employeeId: emp.id,
          date: Between(data.startDate, data.endDate),
        },
      });
      const overtimeHours = attendances.reduce(
        (sum, a) => sum + Number(a.overtimeHours || 0),
        0,
      );
      const hourlyRate = baseSalary / MONTHLY_LEGAL_HOURS;
      // El recargo por hora extra se pacta en convenio; se usa la tarifa base.
      const overtimePay = Math.round(overtimeHours * hourlyRate * 100) / 100;

      // ── Descuento por licencias NO remuneradas aprobadas que solapan el período ──
      const unpaidLeaves = await this.leaveRepo.find({
        where: {
          companyId,
          employeeId: emp.id,
          type: 'unpaid',
          status: 'approved',
        },
      });
      const unpaidDays = unpaidLeaves.reduce(
        (sum, l) =>
          sum + overlapDays(l.startDate, l.endDate, data.startDate, data.endDate),
        0,
      );
      const dailyRate = baseSalary / DAYS_PER_MONTH;
      const unpaidDeduction = Math.round(unpaidDays * dailyRate * 100) / 100;

      // ── Ausencias no remuneradas: reducen el devengo, no son retención (RH-03) ──
      const grossSalary = Math.max(
        0,
        Math.round((baseSalary + overtimePay - unpaidDeduction) * 100) / 100,
      );
      const socialSecurity =
        Math.round(grossSalary * EMPLOYEE_SOCIAL_SECURITY_RATE * 100) / 100;
      const totalDeductionsItem = socialSecurity;
      const netSalary = Math.round((grossSalary - totalDeductionsItem) * 100) / 100;

      // ── Provisión mensual de vacaciones (RH-01) ──
      // 1/12 del salario más la cuota patronal que se devenga por el trabajador.
      const vacationProvision = Math.round((grossSalary * (1 + EMPLOYER_SOCIAL_SECURITY_RATE)) / 12 * 100) / 100;

      totalGross += grossSalary;
      totalDeductions += totalDeductionsItem;
      totalNet += netSalary;

      items.push({
        companyId,
        employeeId: emp.id,
        employeeName: `${emp.firstName} ${emp.lastName}`.trim(),
        employeeDocument: emp.documentId || '',
        position: emp.position || '',
        costCenterId: emp.costCenterId || null,
        baseSalary,
        overtimeHours,
        overtimePay,
        bonuses: 0,
        commissions: 0,
        allowances: 0,
        grossSalary,
        socialSecurity,
        healthInsurance: 0,
        pension: 0,
        taxWithholding: 0,
        otherDeductions: 0,
        totalDeductions: totalDeductionsItem,
        netSalary,
        vacationProvision,
        notes: unpaidDays > 0 ? `${unpaidDays} día(s) sin sueldo descontados del devengo` : undefined,
      });
    }

    const payroll = await this.payrollRepo.save({
      companyId,
      period: data.period,
      startDate: data.startDate,
      endDate: data.endDate,
      totalGross,
      totalDeductions,
      totalNet,
      status: 'draft',
      processedBy: data.processedBy || 'Sistema',
    });

    for (const itemData of items) {
      await this.payrollItemRepo.save({ ...itemData, payrollId: payroll.id });
    }

    return this.findOne(companyId, payroll.id);
  }

  /**
   * Actualiza las líneas de una nómina en borrador y recalcula los totales.
   * Solo permitido mientras la nómina está en estado 'draft'.
   */
  async updateItems(
    companyId: number,
    id: number,
    items: Array<{
      id?: number;
      employeeId: string;
      employeeName: string;
      employeeDocument?: string;
      position?: string;
      costCenterId?: string;
      baseSalary: number;
      overtimeHours?: number;
      overtimePay?: number;
      bonuses?: number;
      commissions?: number;
      allowances?: number;
      socialSecurity?: number;
      healthInsurance?: number;
      pension?: number;
      taxWithholding?: number;
      otherDeductions?: number;
      notes?: string;
    }>,
  ) {
    const payroll = await this.payrollRepo.findOne({
      where: { id, companyId },
      relations: ['items'],
    });
    if (!payroll) {
      throw new NotFoundException(`Payroll #${id} not found`);
    }
    if (payroll.status !== 'draft') {
      throw new BadRequestException(
        'Solo se pueden editar las líneas de una nómina en borrador',
      );
    }

    // Reemplazar las líneas existentes por las nuevas.
    await this.payrollItemRepo.delete({ payrollId: payroll.id });

    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;

    for (const item of items) {
      const grossSalary =
        Number(item.baseSalary || 0) +
        Number(item.overtimePay || 0) +
        Number(item.bonuses || 0) +
        Number(item.commissions || 0) +
        Number(item.allowances || 0);
      const totalDeductionsItem =
        Number(item.socialSecurity || 0) +
        Number(item.healthInsurance || 0) +
        Number(item.pension || 0) +
        Number(item.taxWithholding || 0) +
        Number(item.otherDeductions || 0);
      const netSalary = grossSalary - totalDeductionsItem;

      totalGross += grossSalary;
      totalDeductions += totalDeductionsItem;
      totalNet += netSalary;

      await this.payrollItemRepo.save({
        payrollId: payroll.id,
        companyId,
        employeeId: item.employeeId,
        employeeName: item.employeeName,
        employeeDocument: item.employeeDocument || '',
        position: item.position || '',
        costCenterId: item.costCenterId || null,
        baseSalary: Number(item.baseSalary || 0),
        overtimeHours: Number(item.overtimeHours || 0),
        overtimePay: Number(item.overtimePay || 0),
        bonuses: Number(item.bonuses || 0),
        commissions: Number(item.commissions || 0),
        allowances: Number(item.allowances || 0),
        grossSalary,
        socialSecurity: Number(item.socialSecurity || 0),
        healthInsurance: Number(item.healthInsurance || 0),
        pension: Number(item.pension || 0),
        taxWithholding: Number(item.taxWithholding || 0),
        otherDeductions: Number(item.otherDeductions || 0),
        totalDeductions: totalDeductionsItem,
        netSalary,
        notes: item.notes,
      });
    }

    payroll.totalGross = totalGross;
    payroll.totalDeductions = totalDeductions;
    payroll.totalNet = totalNet;
    await this.payrollRepo.save(payroll);

    return this.findOne(companyId, payroll.id);
  }

  async process(companyId: number, id: number, processedBy: string, costCenterId?: string) {
    const payroll = await this.payrollRepo.findOne({
      where: { id, companyId },
      relations: ['items', 'items.costCenter'],
    });

    if (!payroll) {
      throw new NotFoundException(`Payroll #${id} not found`);
    }

    if (payroll.status !== 'draft') {
      throw new BadRequestException(
        'Payroll can only be processed from draft status',
      );
    }

    // Update payroll status
    payroll.status = 'processed';
    payroll.processedAt = new Date().toISOString().split('T')[0];
    await this.payrollRepo.save(payroll);

    // ── Contabilización de nómina procesada ──
    const totalGross = Number(payroll.totalGross);
    const totalDeductions = Number(payroll.totalDeductions);
    const totalNet = Number(payroll.totalNet);
    if (totalGross > 0) {
      try {
        const [
          payableAccount,
          socialSecurityAccount,
          incomeTaxAccount,
          unionAccount,
          otherRetentionAccount,
          vacationProvisionAccount,
          prodExpenseAccount,
          assocExpenseAccount,
          adminExpenseAccount,
        ] = await Promise.all([
          this.accountMappingService.getAccountForMapping(
            companyId,
            MappingType.PAYROLL_PAYMENT,
          ),
          this.accountMappingService.getAccountForMapping(
            companyId,
            MappingType.PAYROLL_RETENTION,
          ),
          this.accountMappingService.getAccountForMapping(
            companyId,
            MappingType.PAYROLL_RETENTION_INCOME_TAX,
          ),
          this.accountMappingService.getAccountForMapping(
            companyId,
            MappingType.PAYROLL_RETENTION_UNION,
          ),
          this.accountMappingService.getAccountForMapping(
            companyId,
            MappingType.PAYROLL_RETENTION_OTHER,
          ),
          this.accountMappingService.getAccountForMapping(
            companyId,
            MappingType.PAYROLL_VACATION_PROVISION,
          ),
          this.accountMappingService.getAccountForMapping(
            companyId,
            MappingType.PAYROLL_PROCESSING_PRODUCTION,
          ),
          this.accountMappingService.getAccountForMapping(
            companyId,
            MappingType.PAYROLL_PROCESSING_ASSOCIATED,
          ),
          this.accountMappingService.getAccountForMapping(
            companyId,
            MappingType.PAYROLL_PROCESSING_ADMINISTRATIVE,
          ),
        ]);

        const expenseByAccountAndCC = new Map<string, { amount: number; costCenterId?: string }>();
        const vacationByAccountAndCC = new Map<string, { amount: number; costCenterId?: string }>();
        let employerSocialSecurityTotal = 0;
        let totalVacationProvision = 0;
        let totalSocialSecurity = 0;
        let totalIncomeTax = 0;
        let totalUnion = 0;
        let totalOtherRetention = 0;

        for (const item of payroll.items) {
          const costCenterType = item.costCenter?.type;
          let accountCode: string;
          if (costCenterType === 'production') {
            accountCode = prodExpenseAccount || '700-0020';
          } else if (costCenterType === 'associated') {
            accountCode = assocExpenseAccount || '731';
          } else {
            accountCode = adminExpenseAccount || '822';
          }
          const gross = Number(item.grossSalary);
          const employerSS = Math.round(gross * EMPLOYER_SOCIAL_SECURITY_RATE * 100) / 100;
          employerSocialSecurityTotal += employerSS;

          const costCenterId = item.costCenterId || undefined;
          const key = `${accountCode}#${costCenterId || ''}`;
          const existing = expenseByAccountAndCC.get(key) || { amount: 0, costCenterId };
          existing.amount += gross + employerSS;
          expenseByAccountAndCC.set(key, existing);

          // ── Provisión de vacaciones (RH-01) ──
          const vacation = Number(item.vacationProvision || 0);
          if (vacation > 0) {
            totalVacationProvision += vacation;
            const vacKey = `${accountCode}#${costCenterId || ''}`;
            const vacExisting = vacationByAccountAndCC.get(vacKey) || { amount: 0, costCenterId };
            vacExisting.amount += vacation;
            vacationByAccountAndCC.set(vacKey, vacExisting);
          }

          // ── Retenciones por subcuenta (RH-02) ──
          totalSocialSecurity += Number(item.socialSecurity || 0);
          totalIncomeTax += Number(item.taxWithholding || 0);
          totalUnion += Number(item.healthInsurance || 0); // Reutilizamos healthInsurance como sindicato por ahora
          totalOtherRetention += Number(item.otherDeductions || 0);
        }
        employerSocialSecurityTotal = Math.round(employerSocialSecurityTotal * 100) / 100;

        const lines: any[] = [];
        for (const [accountCode, { amount, costCenterId }] of expenseByAccountAndCC.entries()) {
          lines.push({
            accountCode,
            debit: amount,
            credit: 0,
            description: `Salarios y Seguridad Social patronal ${payroll.period}`,
            costCenterId,
          });
        }

        // La provisión de vacaciones se acumula en la misma cuenta de gasto del
        // trabajador por centro de costo, pero con contrapartida en la pasiva 455.
        for (const [accountCode, { amount, costCenterId }] of vacationByAccountAndCC.entries()) {
          lines.push({
            accountCode,
            debit: amount,
            credit: 0,
            description: `Provisión mensual de vacaciones ${payroll.period}`,
            costCenterId,
          });
        }

        lines.push({
          accountCode: payableAccount, // Nóminas por Pagar
          debit: 0,
          credit: totalNet,
          description: `Nómina neta por pagar ${payroll.period}`,
        });

        if (totalVacationProvision > 0) {
          lines.push({
            accountCode: vacationProvisionAccount || '455', // Provisión para Vacaciones
            debit: 0,
            credit: Math.round(totalVacationProvision * 100) / 100,
            description: `Provisión para vacaciones ${payroll.period}`,
          });
        }

        // ── Retenciones separadas por subcuenta (RH-02) ──
        const ssLiability = Math.round((totalSocialSecurity + employerSocialSecurityTotal) * 100) / 100;
        if (ssLiability > 0) {
          lines.push({
            accountCode: socialSecurityAccount || '459', // Seguridad Social por Pagar
            debit: 0,
            credit: ssLiability,
            description: `Contribución Especial y cuota patronal SS ${payroll.period}`,
          });
        }
        if (totalIncomeTax > 0) {
          lines.push({
            accountCode: incomeTaxAccount || '458', // Impuesto sobre Ingresos Personales por Pagar
            debit: 0,
            credit: Math.round(totalIncomeTax * 100) / 100,
            description: `Retención Impuesto sobre Ingresos Personales ${payroll.period}`,
          });
        }
        if (totalUnion > 0) {
          lines.push({
            accountCode: unionAccount || '460', // Cuotas Sindicales por Pagar
            debit: 0,
            credit: Math.round(totalUnion * 100) / 100,
            description: `Cuotas Sindicales retenidas ${payroll.period}`,
          });
        }
        if (totalOtherRetention > 0) {
          lines.push({
            accountCode: otherRetentionAccount || '461', // Otras Retenciones por Pagar
            debit: 0,
            credit: Math.round(totalOtherRetention * 100) / 100,
            description: `Otras deducciones retenidas ${payroll.period}`,
          });
        }

        await this.voucherService.createVoucherFromModule(
          companyId,
          'payroll',
          String(payroll.id),
          {
            date: payroll.endDate || new Date().toISOString().split('T')[0],
            description: `Nómina ${payroll.period} - Procesamiento`,
            type: 'payroll',
            reference: `NOM-${payroll.period}-${payroll.id}`,
            createdBy: processedBy || 'Sistema',
            lines,
          },
        );
        this.logger.log(`Comprobante nómina ${payroll.period} generado`);
      } catch (error) {
        this.logger.error(`Error contabilización nómina ${payroll.id}: ${error.message}`);
      }
    }

    return { payroll };
  }

  async markAsPaid(companyId: number, id: number, bankAccountId?: string) {
    const payroll = await this.payrollRepo.findOne({
      where: { id, companyId },
    });

    if (!payroll) {
      throw new NotFoundException(`Payroll #${id} not found`);
    }

    if (payroll.status !== 'processed') {
      throw new BadRequestException(
        'Payroll must be processed before marking as paid',
      );
    }

    payroll.status = 'paid';
    payroll.paidAt = new Date().toISOString().split('T')[0];
    await this.payrollRepo.save(payroll);

    // ── Contabilización de pago de nómina ──
    const netAmount = Number(payroll.totalNet);
    if (netAmount > 0) {
      try {
        const [payableAccount, cashAccount] = await Promise.all([
          this.accountMappingService.getAccountForMapping(
            companyId,
            MappingType.PAYROLL_PAYMENT,
          ),
          this.accountMappingService.getAccountForMapping(
            companyId,
            MappingType.PAYROLL_CASH,
          ),
        ]);
        await this.voucherService.createVoucherFromModule(
          companyId,
          'payroll',
          `PAY-${payroll.id}`,
          {
            date: payroll.paidAt || new Date().toISOString().split('T')[0],
            description: `Pago nómina ${payroll.period}`,
            type: 'payroll',
            reference: `PAGO-NOM-${payroll.period}-${payroll.id}`,
            createdBy: 'Sistema',
            lines: [
              {
                accountCode: payableAccount, // Nóminas por Pagar
                debit: netAmount,
                credit: 0,
                description: `Liquidación nómina ${payroll.period}`,
              },
              {
                accountCode: cashAccount, // Efectivo en Banco
                debit: 0,
                credit: netAmount,
                description: `Pago nómina ${payroll.period}`,
              },
            ],
          },
        );
        this.logger.log(`Comprobante pago nómina ${payroll.period} generado`);
      } catch (error) {
        this.logger.error(`Error contabilización pago nómina: ${error.message}`);
      }

      // ── Reflejar la salida de efectivo en Finanzas (saldo bancario) ──
      // Se registra solo el movimiento bancario (sin comprobante propio) porque
      // la contabilización ya se hizo arriba, evitando duplicar el asiento.
      if (bankAccountId) {
        try {
          await this.financeService.createBankTransaction(companyId, {
            transactionNumber: `TXB-NOM-${payroll.period}-${payroll.id}`,
            bankAccountId,
            transactionDate: payroll.paidAt || new Date().toISOString().split('T')[0],
            transactionType: 'debit',
            amount: netAmount,
            currency: 'CUP',
            exchangeRate: 1,
            description: `Pago nómina ${payroll.period}`,
            referenceNumber: `PAGO-NOM-${payroll.period}-${payroll.id}`,
            category: 'payroll',
            companyId,
          });

          // ── Payment asociado para conciliación y reportes (FIN-07) ──
          const payment = this.paymentRepo.create({
            companyId,
            paymentNumber: `PAG-NOM-${payroll.id}`,
            paymentDate: payroll.paidAt || new Date().toISOString().split('T')[0],
            paymentType: 'payable',
            paymentMethod: 'bank_transfer',
            amount: netAmount,
            currency: 'CUP',
            exchangeRate: 1,
            description: `Pago nómina ${payroll.period}`,
            referenceNumber: `PAGO-NOM-${payroll.period}-${payroll.id}`,
            bankAccountId,
            status: 'completed',
            paidBy: 'Sistema',
          });
          await this.paymentRepo.save(payment);

          this.logger.log(`Movimiento bancario y Payment registrados para pago nómina ${payroll.period}`);
        } catch (error) {
          this.logger.error(`Error registrando movimiento bancario de nómina: ${error.message}`);
        }
      }
    }

    return { payroll };
  }

  /**
   * Cancela una nómina y anula (reversa) los comprobantes contables asociados.
   * Los comprobantes contabilizados se reversan mediante updateVoucherStatus,
   * que reconstruye los saldos; los borradores simplemente se anulan.
   */
  async cancel(companyId: number, id: number, reason?: string) {
    const payroll = await this.payrollRepo.findOne({
      where: { id, companyId },
    });

    if (!payroll) {
      throw new NotFoundException(`Payroll #${id} not found`);
    }

    if (payroll.status === 'cancelled') {
      throw new BadRequestException('La nómina ya está cancelada');
    }

    // Anular los comprobantes de procesamiento y de pago asociados.
    const sourceIds = [String(payroll.id), `PAY-${payroll.id}`];
    for (const sourceId of sourceIds) {
      const vouchers = await this.voucherService.findVouchersBySourceDocumentId(
        companyId,
        sourceId,
      );
      for (const voucher of vouchers) {
        if (voucher.status === 'cancelled') continue;
        try {
          await this.voucherService.updateVoucherStatus(
            companyId,
            voucher.id,
            'cancelled',
          );
        } catch (error) {
          this.logger.error(
            `Error anulando comprobante ${voucher.voucherNumber}: ${error.message}`,
          );
        }
      }
    }

    // ── Reversar el movimiento bancario si la nómina fue pagada con banco (RH-07) ──
    if (payroll.status === 'paid') {
      try {
        await this.financeService.reverseBankTransaction(
          companyId,
          `PAGO-NOM-${payroll.period}-${payroll.id}`,
          `Reverso por cancelación de nómina ${payroll.period}`,
        );
      } catch (error) {
        this.logger.error(`Error reversando movimiento bancario: ${error.message}`);
      }
    }

    payroll.status = 'cancelled';
    payroll.notes = reason
      ? `${payroll.notes ? payroll.notes + ' | ' : ''}Cancelada: ${reason}`
      : payroll.notes;
    await this.payrollRepo.save(payroll);

    this.logger.log(`Nómina ${payroll.period} (#${payroll.id}) cancelada`);
    return { payroll };
  }

  async getStatistics(companyId: number) {
    const payrolls = await this.payrollRepo.find({
      where: { companyId },
      relations: ['items'],
    });

    const currentYear = new Date().getFullYear();
    const currentYearPayrolls = payrolls.filter((p) =>
      p.period.startsWith(currentYear.toString()),
    );

    const totalProcessed = payrolls.filter(
      (p) => p.status === 'processed',
    ).length;
    const totalPaid = payrolls.filter((p) => p.status === 'paid').length;
    const totalDraft = payrolls.filter((p) => p.status === 'draft').length;

    const totalGrossAmount = payrolls.reduce(
      (sum, p) => sum + Number(p.totalGross),
      0,
    );
    const totalNetAmount = payrolls.reduce(
      (sum, p) => sum + Number(p.totalNet),
      0,
    );
    const currentYearGross = currentYearPayrolls.reduce(
      (sum, p) => sum + Number(p.totalGross),
      0,
    );

    return {
      totalPayrolls: payrolls.length,
      totalProcessed,
      totalPaid,
      totalDraft,
      totalGrossAmount,
      totalNetAmount,
      currentYearGross,
      averageNetSalary:
        totalNetAmount /
        (payrolls.reduce((sum, p) => sum + p.items.length, 0) || 1),
    };
  }
}
