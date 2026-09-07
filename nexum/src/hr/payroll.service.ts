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
import { Between, DataSource, EntityManager, In, Repository } from 'typeorm';
import { Payroll, PayrollItem } from '../entities';
import { Employee } from '../entities/employee.entity';
import { Attendance } from '../entities/attendance.entity';
import { LeaveRequest } from '../entities/leave-request.entity';
import { Payment } from '../entities/payment.entity';
import { VoucherService } from '../accounting/voucher.service';
import { AccountMappingService } from '../accounting/account-mapping.service';
import { MappingType } from '../entities/account-mapping.entity';
import { FinanceService } from '../finance/finance.service';
import {
  calculateIncomeTax,
  calculateSocialSecurity,
  overlapDays,
  round2,
} from './payroll-calculations';
import {
  EMPLOYER_SOCIAL_SECURITY_RATE,
  OCCUPATIONAL_CATEGORY_LABELS,
  OccupationalCategory,
  PAYROLL_CONCEPT_LABELS,
  PayrollConcept,
  SUBSIDY_RETENTION_RATE,
} from './payroll-concept';

// Jornada legal mensual promedio en Cuba (horas) para el cálculo del salario/hora.
const MONTHLY_LEGAL_HOURS = 190.6;
// Días promedio del mes para el cálculo del salario diario (descuentos por ausencia).
const DAYS_PER_MONTH = 30;

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
    private readonly dataSource: DataSource,
  ) {}

  async findAll(
    companyId: number,
    filters?: {
      period?: string;
      status?: string;
      concept?: string;
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
    if (filters?.concept) {
      qb.andWhere('payroll.concept = :concept', { concept: filters.concept });
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
    // La unicidad es por concepto y período: una misma quincena puede tener
    // nómina de salario, de vacaciones y de subsidio a la vez.
    const existing = await this.payrollRepo.findOne({
      where: { companyId, concept: 'salario', period: data.period },
    });
    if (existing && existing.status !== 'cancelled') {
      throw new BadRequestException(
        `Ya existe una nómina de salario para el período ${data.period}`,
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
      const socialSecurity = calculateSocialSecurity(grossSalary);
      const taxWithholding = calculateIncomeTax(grossSalary);
      const totalDeductionsItem =
        Math.round((socialSecurity + taxWithholding) * 100) / 100;
      const netSalary = Math.round((grossSalary - totalDeductionsItem) * 100) / 100;

      // ── Provisión mensual de vacaciones (RH-01) ──
      // 1/12 del salario más la cuota patronal que se devenga por el trabajador.
      const vacationProvision = Math.round((grossSalary * (1 + EMPLOYER_SOCIAL_SECURITY_RATE)) / 12 * 100) / 100;

      // ── Retención del 1,5 % para el pago de subsidios (Art. 46) ──
      // Se acumula en la provisión 500 y es gasto de la empresa, por lo que no
      // reduce el neto del trabajador.
      const subsidyRetention = round2(grossSalary * SUBSIDY_RETENTION_RATE);

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
        expenseAccountCode: emp.expenseAccountCode || null,
        occupationalCategory: emp.occupationalCategory || '0020',
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
        taxWithholding,
        unionDues: 0,
        otherDeductions: 0,
        totalDeductions: totalDeductionsItem,
        netSalary,
        vacationProvision,
        subsidyRetention,
        averageSalary: baseSalary,
        notes: unpaidDays > 0 ? `${unpaidDays} día(s) sin sueldo descontados del devengo` : undefined,
      });
    }

    const payroll = await this.payrollRepo.save({
      companyId,
      concept: 'salario' as const,
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
      unionDues?: number;
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

    // La cuenta de gasto y la categoría ocupacional no las edita el usuario en la
    // nómina: se releen de la ficha del trabajador para no perderlas al
    // reconstruir las líneas.
    const employeeIds = [...new Set(items.map((i) => i.employeeId))];
    const employees = employeeIds.length
      ? await this.employeeRepo.findBy({ companyId, id: In(employeeIds) })
      : [];
    const employeeById = new Map(employees.map((e) => [e.id, e]));

    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;

    for (const item of items) {
      const employee = employeeById.get(item.employeeId);
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
        Number(item.unionDues || 0) +
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
        costCenterId: item.costCenterId || employee?.costCenterId || null,
        expenseAccountCode: employee?.expenseAccountCode || null,
        occupationalCategory: employee?.occupationalCategory || '0020',
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
        unionDues: Number(item.unionDues || 0),
        otherDeductions: Number(item.otherDeductions || 0),
        totalDeductions: totalDeductionsItem,
        netSalary,
        // La provisión y la retención del 1,5 % se recalculan sobre el devengo
        // reeditado, ya que dependen del bruto y no de las deducciones.
        vacationProvision: round2(
          (grossSalary * (1 + EMPLOYER_SOCIAL_SECURITY_RATE)) / 12,
        ),
        subsidyRetention: round2(grossSalary * SUBSIDY_RETENTION_RATE),
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

    const result = await this.dataSource.transaction(async (manager) => {

    // Update payroll status
    payroll.status = 'processed';
    payroll.processedAt = new Date().toISOString().split('T')[0];
    await manager.getRepository(Payroll).save(payroll);

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
          subsidyProvisionAccount,
          maternityReceivableAccount,
          freeConceptAccount,
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
            MappingType.PAYROLL_SUBSIDY_PROVISION,
          ),
          this.accountMappingService.getAccountForMapping(
            companyId,
            MappingType.PAYROLL_MATERNITY_RECEIVABLE,
          ),
          this.accountMappingService.getAccountForMapping(
            companyId,
            MappingType.PAYROLL_FREE_CONCEPT,
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

        const concept = payroll.concept || 'salario';
        // Solo los conceptos pagados por la empresa cargan a cuentas de gasto.
        const chargesExpense = concept === 'salario' || concept === 'libre';

        const expenseByAccountAndCC = new Map<string, { amount: number; costCenterId?: string }>();
        const vacationByAccountAndCC = new Map<string, { amount: number; costCenterId?: string }>();
        // El neto se acredita en la subcuenta de Nóminas por Pagar que
        // corresponde a la categoría ocupacional de cada trabajador (455-00X0).
        const netByCategory = new Map<string, number>();
        let employerSocialSecurityTotal = 0;
        let totalVacationProvision = 0;
        let totalSubsidyRetention = 0;
        let totalSocialSecurity = 0;
        let totalIncomeTax = 0;
        let totalUnion = 0;
        let totalOtherRetention = 0;

        // En maternidad el débito depende del sector de cada trabajador.
        let maternityStateAmount = 0;
        let maternityNonStateAmount = 0;
        const maternitySectorByItem = new Map<number, string>();
        if (concept === 'maternidad') {
          const ids = [
            ...new Set(payroll.items.map((i) => i.employeeId)),
          ];
          const emps = ids.length
            ? await this.employeeRepo.findBy({ companyId, id: In(ids) })
            : [];
          const sectorById = new Map(
            emps.map((e) => [e.id, e.employmentSector || 'state']),
          );
          for (const item of payroll.items) {
            maternitySectorByItem.set(
              item.id,
              sectorById.get(item.employeeId) || 'state',
            );
          }
        }

        for (const item of payroll.items) {
          const accountCode = this.resolveExpenseAccount(item, {
            production: prodExpenseAccount,
            associated: assocExpenseAccount,
            administrative: adminExpenseAccount,
            free: freeConceptAccount,
          }, concept);
          const gross = Number(item.grossSalary);
          const employerSS = Math.round(gross * EMPLOYER_SOCIAL_SECURITY_RATE * 100) / 100;
          employerSocialSecurityTotal += employerSS;

          const costCenterId = item.costCenterId || undefined;
          const key = `${accountCode}#${costCenterId || ''}`;
          if (chargesExpense) {
            const existing = expenseByAccountAndCC.get(key) || { amount: 0, costCenterId };
            existing.amount += gross + employerSS;
            expenseByAccountAndCC.set(key, existing);
          }

          if (concept === 'maternidad') {
            // Sector estatal: la empresa paga y recupera del presupuesto (164-0030).
            // Sector no estatal: paga la Filial INSS, no genera asiento ni
            // pasivo en Nóminas por Pagar.
            const sector = maternitySectorByItem.get(item.id) || 'state';
            if (sector === 'non_state') {
              maternityNonStateAmount += gross;
              continue;
            }
            maternityStateAmount += gross;
          }

          const category = item.occupationalCategory || '0020';
          netByCategory.set(
            category,
            round2((netByCategory.get(category) || 0) + Number(item.netSalary || 0)),
          );

          // ── Provisión de vacaciones (RH-01) ──
          const vacation = Number(item.vacationProvision || 0);
          if (vacation > 0 && chargesExpense) {
            totalVacationProvision += vacation;
            const vacKey = `${accountCode}#${costCenterId || ''}`;
            const vacExisting = vacationByAccountAndCC.get(vacKey) || { amount: 0, costCenterId };
            vacExisting.amount += vacation;
            vacationByAccountAndCC.set(vacKey, vacExisting);
          }

          // ── Retención del 1,5 % para subsidios de seguridad social (Art. 46) ──
          // Es gasto de la empresa, con contrapartida en la provisión 500.
          const subsidyRetention = Number(item.subsidyRetention || 0);
          if (subsidyRetention > 0 && chargesExpense) {
            totalSubsidyRetention += subsidyRetention;
            const existingExpense =
              expenseByAccountAndCC.get(key) || { amount: 0, costCenterId };
            existingExpense.amount += subsidyRetention;
            expenseByAccountAndCC.set(key, existingExpense);
          }

          // ── Retenciones por subcuenta (RH-02) ──
          totalSocialSecurity += Number(item.socialSecurity || 0);
          totalIncomeTax += Number(item.taxWithholding || 0);
          totalUnion += Number(item.unionDues || 0);
          totalOtherRetention += Number(item.otherDeductions || 0);
        }
        employerSocialSecurityTotal = Math.round(employerSocialSecurityTotal * 100) / 100;

        const lines: any[] = [];
        const conceptLabel = PAYROLL_CONCEPT_LABELS[concept] || concept;

        // ── Débito según el concepto ──
        if (concept === 'vacaciones') {
          // El pago de vacaciones se carga a la provisión 492, nunca a gasto.
          const vacationDebit = round2(totalGross + employerSocialSecurityTotal);
          if (vacationDebit > 0) {
            lines.push({
              accountCode: vacationProvisionAccount || '492',
              debit: vacationDebit,
              credit: 0,
              description: `Pago de vacaciones ${payroll.period} (cargo a provisión)`,
              subelement: '50300',
            });
          }
        } else if (concept === 'subsidio' || concept === 'paternidad') {
          // El subsidio se carga a la provisión 500 financiada con el 1,5 %.
          if (totalGross > 0) {
            lines.push({
              accountCode: subsidyProvisionAccount || '500',
              debit: totalGross,
              credit: 0,
              description: `${conceptLabel} ${payroll.period} (cargo a provisión 500)`,
            });
          }
        } else if (concept === 'maternidad') {
          if (maternityStateAmount > 0) {
            lines.push({
              accountCode: maternityReceivableAccount || '164-0030',
              debit: round2(maternityStateAmount),
              credit: 0,
              description: `Licencia de maternidad ${payroll.period} — recuperable del presupuesto`,
            });
          }
          if (maternityNonStateAmount > 0) {
            this.logger.warn(
              `Nómina ${payroll.id}: ${maternityNonStateAmount} CUP de maternidad ` +
                'del sector no estatal los paga la Filial INSS; no se contabilizan.',
            );
          }
        } else {
          for (const [accountCode, { amount, costCenterId }] of expenseByAccountAndCC.entries()) {
            lines.push({
              accountCode,
              debit: amount,
              credit: 0,
              description: `Salarios y Seguridad Social patronal ${payroll.period}`,
              costCenterId,
              subelement: '50100',
            });
          }
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
            subelement: '50300',
          });
        }

        // El neto se desglosa por categoría ocupacional para no acumularlo todo
        // en una sola subcuenta de Nóminas por Pagar.
        for (const [category, amount] of netByCategory.entries()) {
          if (amount <= 0) continue;
          lines.push({
            accountCode: this.payableAccountForCategory(payableAccount, category),
            debit: 0,
            credit: amount,
            description: `Nómina neta por pagar ${payroll.period} — ${OCCUPATIONAL_CATEGORY_LABELS[category as OccupationalCategory] || category}`,
          });
        }

        if (totalVacationProvision > 0) {
          lines.push({
            accountCode: vacationProvisionAccount || '492', // Provisión para Vacaciones
            debit: 0,
            credit: Math.round(totalVacationProvision * 100) / 100,
            description: `Provisión para vacaciones ${payroll.period}`,
          });
        }

        if (totalSubsidyRetention > 0) {
          lines.push({
            accountCode: subsidyProvisionAccount || '500', // Provisión para Pagos de Subsidios de Seguridad Social
            debit: 0,
            credit: round2(totalSubsidyRetention),
            description: `Retención 1,5 % para subsidios de seguridad social ${payroll.period}`,
          });
        }

        // ── Retenciones separadas por subcuenta (RH-02) ──
        const ssLiability = Math.round((totalSocialSecurity + employerSocialSecurityTotal) * 100) / 100;
        if (ssLiability > 0) {
          lines.push({
            accountCode: socialSecurityAccount || '460-0020', // Retenciones por Pagar - Contribución a la Seguridad Social
            debit: 0,
            credit: ssLiability,
            description: `Contribución Especial y cuota patronal SS ${payroll.period}`,
          });
        }
        if (totalIncomeTax > 0) {
          lines.push({
            accountCode: incomeTaxAccount || '460-0010', // Retenciones por Pagar - Impuesto sobre Ingresos Personales
            debit: 0,
            credit: Math.round(totalIncomeTax * 100) / 100,
            description: `Retención Impuesto sobre Ingresos Personales ${payroll.period}`,
          });
        }
        if (totalUnion > 0) {
          lines.push({
            accountCode: unionAccount || '460-0030', // Retenciones por Pagar - Cuotas Sindicales
            debit: 0,
            credit: Math.round(totalUnion * 100) / 100,
            description: `Cuotas Sindicales retenidas ${payroll.period}`,
          });
        }
        if (totalOtherRetention > 0) {
          lines.push({
            accountCode: otherRetentionAccount || '460-0050', // Retenciones por Pagar - Otras Retenciones
            debit: 0,
            credit: Math.round(totalOtherRetention * 100) / 100,
            description: `Otras deducciones retenidas ${payroll.period}`,
          });
        }

        // Si el concepto no produjo movimientos (p. ej. maternidad íntegramente
        // del sector no estatal), no se genera comprobante.
        if (lines.length === 0) {
          this.logger.log(
            `Nómina ${payroll.id} (${conceptLabel}): sin movimientos contables`,
          );
          return { payroll };
        }

        await this.voucherService.createVoucherFromModule(
          companyId,
          'payroll',
          String(payroll.id),
          {
            date: payroll.endDate || new Date().toISOString().split('T')[0],
            description: `Nómina ${conceptLabel} ${payroll.period} - Procesamiento`,
            type: 'payroll',
            reference: `NOM-${payroll.period}-${payroll.id}`,
            createdBy: processedBy || 'Sistema',
            lines,
          },
          manager,
        );
        this.logger.log(`Comprobante nómina ${payroll.period} generado`);
      } catch (error) {
        this.logger.error(`Error contabilización nómina ${payroll.id}: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    }

    return { payroll };
    });

    return result;
  }

  async markAsPaid(companyId: number, id: number, bankAccountId?: string) {
    const payroll = await this.payrollRepo.findOne({
      where: { id, companyId },
      relations: ['items'],
    });

    if (!payroll) {
      throw new NotFoundException(`Payroll #${id} not found`);
    }

    if (payroll.status !== 'processed') {
      throw new BadRequestException(
        'Payroll must be processed before marking as paid',
      );
    }

    const result = await this.dataSource.transaction(async (manager) => {

    payroll.status = 'paid';
    payroll.paidAt = new Date().toISOString().split('T')[0];
    await manager.getRepository(Payroll).save(payroll);

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
        // El débito debe cancelar las mismas subcuentas de Nóminas por Pagar que
        // se acreditaron al devengar, o los saldos por categoría quedarían
        // descuadrados.
        const netByCategory = new Map<string, number>();
        for (const item of payroll.items || []) {
          const category = item.occupationalCategory || '0020';
          netByCategory.set(
            category,
            round2((netByCategory.get(category) || 0) + Number(item.netSalary || 0)),
          );
        }
        if (netByCategory.size === 0) {
          netByCategory.set('0020', netAmount);
        }

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
              ...Array.from(netByCategory.entries())
                .filter(([, amount]) => amount > 0)
                .map(([category, amount]) => ({
                  accountCode: this.payableAccountForCategory(payableAccount, category),
                  debit: amount,
                  credit: 0,
                  description: `Liquidación nómina ${payroll.period} — ${OCCUPATIONAL_CATEGORY_LABELS[category as OccupationalCategory] || category}`,
                })),
              {
                accountCode: cashAccount, // Efectivo en Banco
                debit: 0,
                credit: netAmount,
                description: `Pago nómina ${payroll.period}`,
              },
            ],
          },
          manager,
        );
        this.logger.log(`Comprobante pago nómina ${payroll.period} generado`);
      } catch (error) {
        this.logger.error(`Error contabilización pago nómina: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
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
          },
          manager,
        );

          // ── Payment asociado para conciliación y reportes (FIN-07) ──
          const paymentRepo = manager.getRepository(Payment);
          const payment = paymentRepo.create({
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
          await paymentRepo.save(payment);

          this.logger.log(`Movimiento bancario y Payment registrados para pago nómina ${payroll.period}`);
        } catch (error) {
          this.logger.error(`Error registrando movimiento bancario de nómina: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    return { payroll };
    });

    return result;
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
            `Error anulando comprobante ${voucher.voucherNumber}: ${error instanceof Error ? error.message : String(error)}`,
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
        this.logger.error(`Error reversando movimiento bancario: ${error instanceof Error ? error.message : String(error)}`);
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

  /**
   * Resuelve la cuenta de gasto de una línea de nómina.
   *
   * La cuenta seleccionada en la ficha del trabajador y congelada en la línea
   * tiene prioridad; después se usa la del centro de costo y, en último lugar,
   * los mapeos por tipo de centro.
   */
  private resolveExpenseAccount(
    item: PayrollItem,
    defaults: {
      production?: string | null;
      associated?: string | null;
      administrative?: string | null;
      free?: string | null;
    },
    concept?: PayrollConcept,
  ): string {
    if (item.expenseAccountCode) return item.expenseAccountCode;

    const costCenter = item.costCenter;
    if (costCenter?.expenseAccountCode) return costCenter.expenseAccountCode;

    // El concepto libre usa su propia cuenta de gasto cuando no hay otra pista.
    if (concept === 'libre') {
      return defaults.free || '822';
    }

    switch (costCenter?.type) {
      case 'production':
        return defaults.production || '700-0020';
      case 'associated':
        return defaults.associated || '731';
      default:
        return defaults.administrative || '822';
    }
  }

  /**
   * Devuelve la subcuenta de Nóminas por Pagar que corresponde a una categoría
   * ocupacional. La cuenta 455 es agrupadora y no admite movimientos, por lo que
   * el neto debe acreditarse en 455-0010 … 455-0050 según la categoría.
   */
  private payableAccountForCategory(
    payableAccount: string | null | undefined,
    category: string,
  ): string {
    const base = payableAccount || '455';
    // Si el mapeo ya apunta a una subcuenta analítica, se respeta tal cual.
    if (base.includes('-')) return base;
    const suffix = OCCUPATIONAL_CATEGORY_LABELS[category as OccupationalCategory]
      ? category
      : '0020';
    return `${base}-${suffix}`;
  }
}
