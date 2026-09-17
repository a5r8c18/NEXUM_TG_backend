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
  EMPLOYER_SOCIAL_SECURITY_BUDGET_RATE,
  LABOR_FORCE_TAX_RATE,
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
      // 9.09% del salario contractual mensual.
      const vacationProvision = round2(baseSalary * 0.0909);

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
        paidUnits: DAYS_PER_MONTH - unpaidDays,
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
      paidUnits?: number;
      overtimeHours?: number;
      overtimePay?: number;
      bonuses?: number;
      commissions?: number;
      allowances?: number;
      grossSalary?: number;
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

    const isSalary = payroll.concept === 'salario';
    for (const item of items) {
      const employee = employeeById.get(item.employeeId);

      let grossSalary: number;
      if (isSalary) {
        const paidUnits = Number(item.paidUnits || 0) || 30;
        const baseEarnings = round2((Number(item.baseSalary || 0) / 30) * paidUnits);
        grossSalary =
          baseEarnings +
          Number(item.overtimePay || 0) +
          Number(item.bonuses || 0) +
          Number(item.commissions || 0) +
          Number(item.allowances || 0);
      } else {
        grossSalary = Number(item.grossSalary || 0);
      }

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
        costCenterId: item.costCenterId || employee?.costCenterId || null,
        expenseAccountCode: employee?.expenseAccountCode || null,
        occupationalCategory: employee?.occupationalCategory || '0020',
        baseSalary: Number(item.baseSalary || 0),
        paidUnits: isSalary ? Number(item.paidUnits || 0) || 30 : Number(item.paidUnits || 0),
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
        // La cuota sindical la aporta el trabajador directamente al sindicato:
        // la entidad no la retiene ni la contabiliza.
        unionDues: 0,
        otherDeductions: Number(item.otherDeductions || 0),
        totalDeductions: totalDeductionsItem,
        netSalary,
        // La provisión y la retención del 1,5 % se recalculan sobre el salario
        // contractual mensual, no del bruto del período.
        vacationProvision: round2(Number(item.baseSalary || 0) * 0.0909),
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

  async process(companyId: number, id: number, processedBy: string) {
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
          otherRetentionAccount,
          employerSocialSecurityAccount,
          laborForceTaxAccount,
          vacationProvisionAccount,
          subsidyProvisionAccount,
          maternityReceivableAccount,
          freeConceptAccount,
          prodExpenseAccount,
          assocExpenseAccount,
          adminExpenseAccount,
          employerSSExpenseAccount,
          laborForceTaxExpenseAccount,
          taxTransitAccount,
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
            MappingType.PAYROLL_RETENTION_OTHER,
          ),
          this.accountMappingService.getAccountForMapping(
            companyId,
            MappingType.PAYROLL_EMPLOYER_SOCIAL_SECURITY,
          ),
          this.accountMappingService.getAccountForMapping(
            companyId,
            MappingType.PAYROLL_LABOR_FORCE_TAX,
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
          this.accountMappingService.getAccountForMapping(
            companyId,
            MappingType.PAYROLL_TAX_EXPENSE_SOCIAL_SECURITY,
          ),
          this.accountMappingService.getAccountForMapping(
            companyId,
            MappingType.PAYROLL_TAX_EXPENSE_LABOR_FORCE,
          ),
          this.accountMappingService.getAccountForMapping(
            companyId,
            MappingType.PAYROLL_TAX_TRANSIT,
          ),
        ]);

        const concept = payroll.concept || 'salario';
        // Solo los conceptos pagados por la empresa cargan a cuentas de gasto.
        const chargesExpense = concept === 'salario' || concept === 'libre';

        const expenseByAccountAndCC = new Map<string, { accountCode: string; amount: number; costCenterId?: string }>();
        const vacationByAccountAndCC = new Map<string, { accountCode: string; amount: number; costCenterId?: string }>();
        // Las retenciones practicadas al trabajador se debitan en el
        // comprobante de impuestos a la misma cuenta que financió el pago
        // (gasto en salario/libre, 492 en vacaciones, 500 en subsidio y
        // paternidad, 164-0030 en maternidad estatal), porque la 455 solo
        // recoge el neto a pagar.
        const deductionsByFunding = new Map<string, { accountCode: string; amount: number; costCenterId?: string; subelement?: string }>();
        // Los tributos a cargo de la entidad (aporte patronal y UFT) no son
        // gasto de salario: se cargan a la 855 Otros Impuestos, Tasas y
        // Contribuciones en el comprobante de impuestos, desglosados solo por
        // centro de costo.
        const employerSSByCostCenter = new Map<string, number>();
        const laborForceTaxByCostCenter = new Map<string, number>();
        let totalVacationProvision = 0;
        // Impuestos empresariales
        let employerSSBudgetTotal = 0;
        let subsidyProvisionTotal = 0;
        let laborForceTaxTotal = 0;
        // Impuestos salariales (retenciones)
        let totalSocialSecurity = 0;
        let totalIncomeTax = 0;
        let totalOtherRetention = 0;
        let totalHealthInsurance = 0;
        let totalPension = 0;

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
          // La 455 solo recoge el neto: el débito del comprobante de nómina
          // distribuye el neto de cada línea por cuenta de gasto y centro de
          // costo.
          const net = Number(item.netSalary || 0);

          const costCenterId = item.costCenterId || undefined;
          const key = `${accountCode}#${costCenterId || ''}`;
          if (chargesExpense) {
            const existing = expenseByAccountAndCC.get(key) || { accountCode, amount: 0, costCenterId };
            existing.amount += net;
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
            maternityStateAmount += net;
          }

          // ── Provisión de vacaciones (RH-01) ──
          const vacation = Number(item.vacationProvision || 0);
          if (vacation > 0 && chargesExpense) {
            totalVacationProvision += vacation;
            const vacKey = `${accountCode}#${costCenterId || ''}`;
            const vacExisting = vacationByAccountAndCC.get(vacKey) || { accountCode, amount: 0, costCenterId };
            vacExisting.amount += vacation;
            vacationByAccountAndCC.set(vacKey, vacExisting);
          }

          // ── Tributos a cargo de la entidad (comprobante de impuestos) ──
          if (chargesExpense) {
            const retentionBase = round2(gross + vacation);
            // Aporte patronal 14 %: 12,5 % al presupuesto + 1,5 % a la provisión 500.
            const ssBudget = round2(retentionBase * EMPLOYER_SOCIAL_SECURITY_BUDGET_RATE);
            const ssProvision = Number(item.subsidyRetention || 0) ||
              round2(retentionBase * SUBSIDY_RETENTION_RATE);
            const employerSS = round2(ssBudget + ssProvision);
            if (employerSS > 0) {
              employerSSBudgetTotal += ssBudget;
              subsidyProvisionTotal += ssProvision;
              const ccKey = costCenterId || '';
              employerSSByCostCenter.set(
                ccKey,
                (employerSSByCostCenter.get(ccKey) || 0) + employerSS,
              );
            }

            // Impuesto por la Utilización de la Fuerza de Trabajo (5 %).
            const laborForceTax = round2(retentionBase * LABOR_FORCE_TAX_RATE);
            if (laborForceTax > 0) {
              laborForceTaxTotal += laborForceTax;
              const ccKey = costCenterId || '';
              laborForceTaxByCostCenter.set(
                ccKey,
                (laborForceTaxByCostCenter.get(ccKey) || 0) + laborForceTax,
              );
            }
          }

          // ── Impuestos salariales: la entidad solo retiene ──
          // La cuota sindical no se retiene al trabajador, por eso no figura.
          totalSocialSecurity += Number(item.socialSecurity || 0);
          totalIncomeTax += Number(item.taxWithholding || 0);
          totalOtherRetention += Number(item.otherDeductions || 0);
          totalHealthInsurance += Number(item.healthInsurance || 0);
          totalPension += Number(item.pension || 0);

          // Las retenciones se debitan en el comprobante de impuestos a la
          // cuenta que financió el pago de la línea.
          const itemDeductions = Number(item.totalDeductions || 0);
          if (itemDeductions > 0) {
            const fundingAccount =
              concept === 'vacaciones'
                ? vacationProvisionAccount || '492'
                : concept === 'subsidio' || concept === 'paternidad'
                  ? subsidyProvisionAccount || '500'
                  : concept === 'maternidad'
                    ? maternityReceivableAccount || '164-0030'
                    : accountCode;
            const dedCc = chargesExpense ? costCenterId : undefined;
            const dedKey = `${fundingAccount}#${dedCc || ''}`;
            const dedEntry = deductionsByFunding.get(dedKey) || {
              accountCode: fundingAccount,
              amount: 0,
              costCenterId: dedCc,
              subelement: chargesExpense ? '50100' : undefined,
            };
            dedEntry.amount += itemDeductions;
            deductionsByFunding.set(dedKey, dedEntry);
          }
        }
        employerSSBudgetTotal = round2(employerSSBudgetTotal);
        subsidyProvisionTotal = round2(subsidyProvisionTotal);
        laborForceTaxTotal = round2(laborForceTaxTotal);
        totalSocialSecurity = round2(totalSocialSecurity);
        totalIncomeTax = round2(totalIncomeTax);
        totalOtherRetention = round2(totalOtherRetention);
        totalHealthInsurance = round2(totalHealthInsurance);
        totalPension = round2(totalPension);

        const lines: any[] = [];
        const conceptLabel = PAYROLL_CONCEPT_LABELS[concept] || concept;

        // ── Débitos del comprobante de nómina ──
        // La 455 solo recoge el líquido a pagar (neto); las retenciones se
        // debitan en el comprobante de impuestos a la cuenta que financió el
        // pago. Subsidio, paternidad y maternidad quedan fuera de este
        // comprobante: cada uno genera el suyo más abajo.
        if (concept === 'vacaciones') {
          // El pago de vacaciones se carga a la provisión 492, nunca a gasto.
          const vacationDebit = round2(totalNet);
          if (vacationDebit > 0) {
            lines.push({
              accountCode: vacationProvisionAccount || '492',
              subaccountCode: vacationProvisionAccount || '492',
              debit: vacationDebit,
              credit: 0,
              description: `Pago de vacaciones ${payroll.period} (cargo a provisión)`,
            });
          }
        } else if (chargesExpense) {
          for (const [, { accountCode, amount, costCenterId }] of expenseByAccountAndCC.entries()) {
            lines.push({
              accountCode,
              debit: amount,
              credit: 0,
              description: `Salarios ${payroll.period}`,
              costCenterId,
              subelement: '50100',
            });
          }
        }

        // ── Provisión de vacaciones dentro del mismo comprobante (RH-01) ──
        for (const [, { accountCode, amount, costCenterId }] of vacationByAccountAndCC.entries()) {
          lines.push({
            accountCode,
            debit: amount,
            credit: 0,
            description: `Provisión mensual de vacaciones ${payroll.period}`,
            costCenterId,
            subelement: '50300',
          });
        }
        if (totalVacationProvision > 0) {
          lines.push({
            accountCode: vacationProvisionAccount || '492',
            subaccountCode: vacationProvisionAccount || '492',
            debit: 0,
            credit: round2(totalVacationProvision),
            description: `Provisión para vacaciones ${payroll.period}`,
          });
        }

        // La nómina se acredita en la 455 por el neto a pagar, como un solo
        // monto, sin separar por categorías ocupacionales ni centros de costo.
        if (lines.length > 0 && totalNet > 0) {
          lines.push({
            accountCode: payableAccount || '455',
            subaccountCode: payableAccount || '455',
            debit: 0,
            credit: round2(totalNet),
            description: `Nómina por pagar ${payroll.period}`,
          });
        }

        // ── Comprobante independiente de subsidio y licencia de paternidad ──
        // El pago se carga a la provisión 500, financiada con el 1,5 % del
        // aporte patronal, y no a gasto del período. La 455 recoge solo el neto.
        const subsidyLines: any[] = [];
        if ((concept === 'subsidio' || concept === 'paternidad') && totalNet > 0) {
          subsidyLines.push({
            accountCode: subsidyProvisionAccount || '500',
            subaccountCode: subsidyProvisionAccount || '500',
            debit: round2(totalNet),
            credit: 0,
            description: `${conceptLabel} ${payroll.period} (cargo a provisión 500)`,
          });
          subsidyLines.push({
            accountCode: payableAccount || '455',
            subaccountCode: payableAccount || '455',
            debit: 0,
            credit: round2(totalNet),
            description: `${conceptLabel} por pagar ${payroll.period}`,
          });
        }

        // ── Comprobante independiente de licencia de maternidad ──
        // Solo el sector estatal se contabiliza, como adeudo recuperable del
        // presupuesto; el no estatal lo paga la Filial INSS.
        const maternityLines: any[] = [];
        if (concept === 'maternidad') {
          const maternityDebit = round2(maternityStateAmount);
          if (maternityDebit > 0) {
            maternityLines.push({
              accountCode: maternityReceivableAccount || '164-0030',
              subaccountCode: maternityReceivableAccount || '164-0030',
              debit: maternityDebit,
              credit: 0,
              description: `Licencia de maternidad ${payroll.period} — recuperable del presupuesto`,
            });
            maternityLines.push({
              accountCode: payableAccount || '455',
              subaccountCode: payableAccount || '455',
              debit: 0,
              credit: maternityDebit,
              description: `Licencia de maternidad por pagar ${payroll.period}`,
            });
          }
          if (maternityNonStateAmount > 0) {
            this.logger.warn(
              `Nómina ${payroll.id}: ${maternityNonStateAmount} CUP de maternidad ` +
                'del sector no estatal los paga la Filial INSS; no se contabilizan.',
            );
          }
        }

        // ── Comprobante único de impuestos: salariales y empresariales ──
        // Débito: las retenciones a la cuenta que financió el pago (gasto, 492,
        // 500 o 164-0030), porque la 455 ya recogió solo el neto, y los
        // tributos a cargo de la entidad contra la 855.
        // Crédito: la transitoria 699 por cada obligación con el presupuesto —la
        // 440 la registra Finanzas al crear la CxP— y la provisión 500 por el
        // 1,5 %, que no se entera al presupuesto.
        const taxLines: any[] = [];
        const transitAccount = taxTransitAccount || '699';
        for (const [, ded] of deductionsByFunding.entries()) {
          const dedAmount = round2(ded.amount);
          if (dedAmount <= 0) continue;
          taxLines.push({
            accountCode: ded.accountCode,
            debit: dedAmount,
            credit: 0,
            description: `Retenciones a trabajadores ${payroll.period}`,
            costCenterId: ded.costCenterId,
            subelement: ded.subelement,
          });
        }
        for (const [ccKey, amount] of employerSSByCostCenter.entries()) {
          taxLines.push({
            accountCode: employerSSExpenseAccount || '855',
            debit: round2(amount),
            credit: 0,
            description: `Aporte patronal a la Seguridad Social ${payroll.period}`,
            costCenterId: ccKey || undefined,
            subelement: '50400',
          });
        }
        for (const [ccKey, amount] of laborForceTaxByCostCenter.entries()) {
          taxLines.push({
            accountCode: laborForceTaxExpenseAccount || '855',
            debit: round2(amount),
            credit: 0,
            description: `Impuesto por Utilización de la Fuerza de Trabajo ${payroll.period}`,
            costCenterId: ccKey || undefined,
          });
        }

        // Una obligación por cada impuesto, tanto empresarial como retenido.
        const budgetObligations = [
          {
            amount: employerSSBudgetTotal,
            accountCode: employerSocialSecurityAccount || '440-0008',
            description: 'Contribución a la Seguridad Social — aporte patronal 12,5 %',
          },
          {
            amount: laborForceTaxTotal,
            accountCode: laborForceTaxAccount || '440-0007',
            description: 'Impuesto por la Utilización de la Fuerza de Trabajo 5 %',
          },
          {
            amount: totalSocialSecurity,
            accountCode: socialSecurityAccount || '440-0008',
            description: 'Contribución Especial a la Seguridad Social retenida 5 %',
          },
          {
            amount: totalIncomeTax,
            accountCode: incomeTaxAccount || '440-0005',
            description: 'Impuesto sobre Ingresos Personales retenido',
          },
          {
            amount: totalOtherRetention,
            accountCode: otherRetentionAccount || '440-0007',
            description: 'Otras deducciones retenidas',
          },
          {
            amount: totalPension,
            accountCode: socialSecurityAccount || '440-0008',
            description: 'Pensión retenida a trabajadores',
          },
          {
            amount: totalHealthInsurance,
            accountCode: otherRetentionAccount || '440-0007',
            description: 'Seguro de salud retenido a trabajadores',
          },
        ].filter((obligation) => obligation.amount > 0);

        for (const obligation of budgetObligations) {
          taxLines.push({
            accountCode: transitAccount,
            debit: 0,
            credit: round2(obligation.amount),
            description: `${obligation.description} ${payroll.period}`,
          });
        }

        // El 1,5 % del aporte patronal no va al presupuesto: financia las
        // prestaciones de seguridad social a corto plazo (provisión 500).
        if (subsidyProvisionTotal > 0) {
          taxLines.push({
            accountCode: subsidyProvisionAccount || '500',
            subaccountCode: subsidyProvisionAccount || '500',
            debit: 0,
            credit: subsidyProvisionTotal,
            description: `Provisión para prestaciones de seguridad social a corto plazo 1,5 % ${payroll.period}`,
          });
        }

        const date = payroll.endDate || new Date().toISOString().split('T')[0];
        const createdBy = processedBy || 'Sistema';

        // Si el concepto no produjo movimientos (p. ej. maternidad íntegramente
        // del sector no estatal), no se genera comprobante.
        if (
          lines.length === 0 &&
          subsidyLines.length === 0 &&
          maternityLines.length === 0 &&
          taxLines.length === 0
        ) {
          this.logger.log(
            `Nómina ${payroll.id} (${conceptLabel}): sin movimientos contables`,
          );
          return { payroll };
        }

        if (lines.length > 0) {
          await this.voucherService.createVoucherFromModule(
            companyId,
            'payroll',
            String(payroll.id),
            {
              date,
              description: `Nómina ${conceptLabel} ${payroll.period} - Procesamiento`,
              type: 'payroll',
              reference: `NOM-${payroll.period}-${payroll.id}`,
              createdBy,
              lines,
            },
            manager,
          );
          this.logger.log(`Comprobante nómina ${payroll.period} generado`);
        }

        if (subsidyLines.length > 0) {
          await this.voucherService.createVoucherFromModule(
            companyId,
            'payroll',
            `SUB-${payroll.id}`,
            {
              date,
              description: `${conceptLabel} ${payroll.period}`,
              type: 'payroll',
              reference: `SUB-${payroll.period}-${payroll.id}`,
              createdBy,
              lines: subsidyLines,
            },
            manager,
          );
          this.logger.log(`Comprobante ${conceptLabel} ${payroll.period} generado`);
        }

        if (maternityLines.length > 0) {
          await this.voucherService.createVoucherFromModule(
            companyId,
            'payroll',
            `MAT-${payroll.id}`,
            {
              date,
              description: `Licencia de maternidad ${payroll.period}`,
              type: 'payroll',
              reference: `MAT-${payroll.period}-${payroll.id}`,
              createdBy,
              lines: maternityLines,
            },
            manager,
          );
          this.logger.log(`Comprobante maternidad ${payroll.period} generado`);
        }

        if (taxLines.length > 0) {
          await this.voucherService.createVoucherFromModule(
            companyId,
            'payroll',
            `IMP-${payroll.id}`,
            {
              date,
              description: `Impuestos y retenciones de nómina ${payroll.period}`,
              type: 'payroll',
              reference: `IMP-${payroll.period}-${payroll.id}`,
              createdBy,
              lines: taxLines,
            },
            manager,
          );
          this.logger.log(`Comprobante impuestos ${payroll.period} generado`);

          // El comprobante de impuestos genera una obligación de pago en
          // Finanzas por cada tributo, tanto los que son a cargo de la entidad
          // como las retenciones practicadas al trabajador. Al crearse, Finanzas
          // cancela la transitoria 699 contra la subcuenta de la 440.
          await this.createTaxObligations(
            companyId,
            payroll,
            date,
            budgetObligations,
            transitAccount,
            manager,
          );
        }
      } catch (error) {
        this.logger.error(`Error contabilización nómina ${payroll.id}: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    }

    return { payroll };
    });

    return result;
  }

  /**
   * Registra en Finanzas las obligaciones de pago derivadas del comprobante de
   * impuestos de la nómina: los tributos a cargo de la entidad (aporte patronal
   * 12,5 % y UFT) y las retenciones practicadas al trabajador, que la entidad
   * debe enterar al presupuesto. Se genera una CxP por cada tributo.
   *
   * El asiento del pasivo lo hace Finanzas al crear cada CxP: debita la
   * transitoria 699 que acreditó el comprobante de impuestos y acredita la
   * subcuenta de la 440, de modo que la obligación nace donde se gestiona.
   */
  private async createTaxObligations(
    companyId: number,
    payroll: Payroll,
    date: string,
    obligations: {
      amount: number;
      accountCode: string;
      description: string;
      creditor?: string;
    }[],
    transitAccountCode: string,
    manager: EntityManager,
  ) {
    const invoiceNumber = `IMP-${payroll.period}-${payroll.id}`;
    // Las obligaciones tributarias con el presupuesto no tienen vencimiento.
    const dueDate: null = null;

    for (const obligation of obligations) {
      if (obligation.amount <= 0) continue;
      try {
        await this.financeService.createPayable(
          companyId,
          {
            supplierId: null,
            supplierName: obligation.creditor || 'Presupuesto del Estado (ONAT)',
            supplierNit: 'N/D',
            invoiceNumber,
            invoiceDate: date,
            originalAmount: obligation.amount,
            dueDate,
            accountCode: obligation.accountCode,
            transitAccountCode,
            currency: 'CUP',
            exchangeRate: 1,
            paymentTerms: 'mensual',
            notes: `${obligation.description} — nómina ${payroll.period}`,
          },
          manager,
        );
      } catch (error) {
        this.logger.error(
          `Error creando obligación ${obligation.accountCode} de nómina ${payroll.id}: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        );
        throw error;
      }
    }
  }

  /**
   * Fecha límite de liquidación de los tributos retenidos: día 10 del mes
   * siguiente al del devengo.
   */
  private static taxDueDate(date: string): string {
    const [year, month] = date.split('-').map(Number);
    const dueYear = month === 12 ? year + 1 : year;
    const dueMonth = month === 12 ? 1 : month + 1;
    // No se usa: las obligaciones tributarias de nómina no tienen vencimiento.
    return date;
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
    let netAmount = Number(payroll.totalNet);
    if (payroll.concept === 'maternidad') {
      // El sector no estatal lo paga la Filial INSS: nunca se acreditó a la
      // 455 ni debe salir de caja de la empresa.
      const employeeIds = [...new Set(payroll.items.map((i) => i.employeeId))];
      const emps = employeeIds.length
        ? await this.employeeRepo.findBy({ companyId, id: In(employeeIds) })
        : [];
      const sectorById = new Map(
        emps.map((e) => [e.id, e.employmentSector || 'state']),
      );
      netAmount = round2(
        payroll.items
          .filter((i) => (sectorById.get(i.employeeId) || 'state') !== 'non_state')
          .reduce((s, i) => s + Number(i.netSalary || 0), 0),
      );
    }
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
                accountCode: payableAccount || '455',
                subaccountCode: payableAccount || '455',
                debit: netAmount,
                credit: 0,
                description: `Liquidación nómina ${payroll.period}`,
              },
              {
                accountCode: cashAccount || '110', // Efectivo en Banco
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
    const sourceIds = [
      String(payroll.id),
      `SUB-${payroll.id}`,
      `MAT-${payroll.id}`,
      `VAC-${payroll.id}`,
      `IMP-${payroll.id}`,
      `PAY-${payroll.id}`,
    ];
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

    // ── Anular la obligación con el presupuesto del estado en Finanzas ──
    try {
      await this.financeService.cancelPayablesByInvoiceNumber(
        companyId,
        `IMP-${payroll.period}-${payroll.id}`,
        `Anulada por cancelación de nómina ${payroll.period}`,
      );
    } catch (error) {
      this.logger.error(
        `Error anulando obligaciones tributarias de nómina ${payroll.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
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

}
