/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unused-vars */
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
import { VoucherService } from '../accounting/voucher.service';

@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name);

  constructor(
    @InjectRepository(Payroll)
    private readonly payrollRepo: Repository<Payroll>,
    @InjectRepository(PayrollItem)
    private readonly payrollItemRepo: Repository<PayrollItem>,
    @Inject(forwardRef(() => VoucherService))
    private readonly voucherService: VoucherService,
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

  async process(companyId: number, id: number, processedBy: string) {
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
                accountCode: '731', // Gasto de Salario
                debit: totalGross,
                credit: 0,
                description: `Salarios brutos ${payroll.period}`,
              },
              {
                accountCode: '455', // Nóminas por Pagar
                debit: 0,
                credit: totalNet,
                description: `Nómina neta por pagar ${payroll.period}`,
              },
              ...(totalDeductions > 0
                ? [
                    {
                      accountCode: '440', // Retenciones por Pagar
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
                accountCode: '455', // Nóminas por Pagar
                debit: netAmount,
                credit: 0,
                description: `Liquidación nómina ${payroll.period}`,
              },
              {
                accountCode: '110', // Efectivo en Banco
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
