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
import { Repository } from 'typeorm';
import { Payroll, PayrollItem } from '../entities';
import { Employee } from '../entities/employee.entity';
import { VoucherService } from '../accounting/voucher.service';
import { AccountMappingService } from '../accounting/account-mapping.service';
import { MappingType } from '../entities/account-mapping.entity';

// Contribución Especial a la Seguridad Social del trabajador (Cuba): 5% del salario.
const EMPLOYEE_SOCIAL_SECURITY_RATE = 0.05;

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
    @Inject(forwardRef(() => VoucherService))
    private readonly voucherService: VoucherService,
    private readonly accountMappingService: AccountMappingService,
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

    const items = employees.map((emp) => {
      const baseSalary = Number(emp.salary) || 0;
      const grossSalary = baseSalary;
      const socialSecurity =
        Math.round(grossSalary * EMPLOYEE_SOCIAL_SECURITY_RATE * 100) / 100;
      const totalDeductionsItem = socialSecurity;
      const netSalary = grossSalary - totalDeductionsItem;

      totalGross += grossSalary;
      totalDeductions += totalDeductionsItem;
      totalNet += netSalary;

      return {
        companyId,
        employeeId: emp.id,
        employeeName: `${emp.firstName} ${emp.lastName}`.trim(),
        employeeDocument: emp.documentId || '',
        position: emp.position || '',
        baseSalary,
        overtimeHours: 0,
        overtimePay: 0,
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
      };
    });

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

  async process(companyId: number, id: number, processedBy: string, costCenterId?: string) {
    const payroll = await this.payrollRepo.findOne({
      where: { id, companyId },
      relations: ['items'],
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
        const [expenseAccount, payableAccount, retentionAccount] =
          await Promise.all([
            this.accountMappingService.getAccountForMapping(
              companyId,
              MappingType.PAYROLL_PROCESSING,
            ),
            this.accountMappingService.getAccountForMapping(
              companyId,
              MappingType.PAYROLL_PAYMENT,
            ),
            this.accountMappingService.getAccountForMapping(
              companyId,
              MappingType.PAYROLL_RETENTION,
            ),
          ]);
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
            lines: [
              {
                accountCode: expenseAccount, // Gasto de Salario
                debit: totalGross,
                credit: 0,
                description: `Salarios brutos ${payroll.period}`,
                costCenterId: costCenterId || undefined,
              },
              {
                accountCode: payableAccount, // Nóminas por Pagar
                debit: 0,
                credit: totalNet,
                description: `Nómina neta por pagar ${payroll.period}`,
              },
              ...(totalDeductions > 0
                ? [
                    {
                      accountCode: retentionAccount, // Retenciones por Pagar
                      debit: 0,
                      credit: totalDeductions,
                      description: `Retenciones y deducciones ${payroll.period}`,
                    },
                  ]
                : []),
            ],
          },
        );
        this.logger.log(`Comprobante nómina ${payroll.period} generado`);
      } catch (error) {
        this.logger.error(`Error contabilización nómina ${payroll.id}: ${error.message}`);
      }
    }

    return { payroll };
  }

  async markAsPaid(companyId: number, id: number) {
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
