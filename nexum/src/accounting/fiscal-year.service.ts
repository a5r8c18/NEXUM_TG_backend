/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FiscalYear } from '../entities/fiscal-year.entity';
import { AccountingPeriod } from '../entities/accounting-period.entity';
import { Voucher } from '../entities/voucher.entity';

@Injectable()
export class FiscalYearService {
  constructor(
    @InjectRepository(FiscalYear)
    private readonly fiscalYearRepo: Repository<FiscalYear>,
    @InjectRepository(AccountingPeriod)
    private readonly periodRepo: Repository<AccountingPeriod>,
    @InjectRepository(Voucher)
    private readonly voucherRepo: Repository<Voucher>,
  ) {}

  // ══════════════════════════════════════════════════════════
  // ── FISCAL YEARS CRUD ──
  // ══════════════════════════════════════════════════════════

  async findAllFiscalYears(companyId: number) {
    return this.fiscalYearRepo.find({
      where: { companyId },
      relations: ['periods'],
      order: { startDate: 'DESC' },
    });
  }

  async findOneFiscalYear(companyId: number, id: string) {
    const fy = await this.fiscalYearRepo.findOne({
      where: { id, companyId },
      relations: ['periods'],
    });
    if (!fy) throw new NotFoundException(`Año fiscal #${id} no encontrado`);
    return fy;
  }

  async createFiscalYear(
    companyId: number,
    data: { name: string; startDate: string; endDate: string },
  ) {
    // Validar fechas
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    if (start >= end) {
      throw new BadRequestException(
        'La fecha de inicio debe ser anterior a la fecha de fin',
      );
    }

    // Validar que no exista un año fiscal con el mismo nombre
    const existing = await this.fiscalYearRepo.findOneBy({
      name: data.name,
      companyId,
    });
    if (existing) {
      throw new BadRequestException(
        `Ya existe un año fiscal con el nombre ${data.name}`,
      );
    }

    // Validar que no exista un año fiscal que se solape
    const overlapping = await this.fiscalYearRepo
      .createQueryBuilder('fy')
      .where('fy.companyId = :companyId', { companyId })
      .andWhere('(fy.startDate <= :endDate AND fy.endDate >= :startDate)', {
        startDate: data.startDate,
        endDate: data.endDate,
      })
      .getOne();

    if (overlapping) {
      throw new BadRequestException(
        'El rango de fechas se solapa con un año fiscal existente',
      );
    }

    // Crear año fiscal
    const fiscalYear = this.fiscalYearRepo.create({
      ...data,
      companyId,
      status: 'open',
    });

    const savedFy = await this.fiscalYearRepo.save(fiscalYear);

    // Crear períodos mensuales automáticamente
    await this.createMonthlyPeriods(savedFy.id, companyId, start, end);

    return this.findOneFiscalYear(companyId, savedFy.id);
  }

  async updateFiscalYear(
    companyId: number,
    id: string,
    data: Partial<FiscalYear>,
  ) {
    const fiscalYear = await this.findOneFiscalYear(companyId, id);

    // Validar que no esté cerrado
    if (fiscalYear.status === 'closed') {
      throw new BadRequestException(
        'No se puede modificar un año fiscal cerrado',
      );
    }

    // Validar fechas si se están cambiando
    if (data.startDate || data.endDate) {
      const start = new Date(data.startDate || fiscalYear.startDate);
      const end = new Date(data.endDate || fiscalYear.endDate);

      if (start >= end) {
        throw new BadRequestException(
          'La fecha de inicio debe ser anterior a la fecha de fin',
        );
      }

      // Validar solapamiento con otros años fiscales
      const overlapping = await this.fiscalYearRepo
        .createQueryBuilder('fy')
        .where('fy.companyId = :companyId', { companyId })
        .andWhere('fy.id != :id', { id })
        .andWhere('(fy.startDate <= :endDate AND fy.endDate >= :startDate)', {
          startDate: start.toISOString(),
          endDate: end.toISOString(),
        })
        .getOne();

      if (overlapping) {
        throw new BadRequestException(
          'El rango de fechas se solapa con un año fiscal existente',
        );
      }
    }

    Object.assign(fiscalYear, data);
    return this.fiscalYearRepo.save(fiscalYear);
  }

  async deleteFiscalYear(companyId: number, id: string) {
    const fiscalYear = await this.findOneFiscalYear(companyId, id);

    // Validar que no esté cerrado
    if (fiscalYear.status === 'closed') {
      throw new BadRequestException(
        'No se puede eliminar un año fiscal cerrado',
      );
    }

    // Validar que no tenga comprobantes asociados
    const voucherCount = await this.voucherRepo.count({
      where: {
        companyId,
        date: fiscalYear.startDate,
      },
    });
    if (voucherCount > 0) {
      throw new BadRequestException(
        'No se puede eliminar un año fiscal con comprobantes asociados',
      );
    }

    // Eliminar períodos primero
    await this.periodRepo.delete({ fiscalYearId: id });

    // Eliminar año fiscal
    return this.fiscalYearRepo.remove(fiscalYear);
  }

  async closeFiscalYear(companyId: number, id: string) {
    const fy = await this.findOneFiscalYear(companyId, id);

    // Cerrar todos los períodos abiertos
    await this.periodRepo.update(
      { fiscalYearId: id, status: 'open' },
      { status: 'closed' },
    );

    // Actualizar estado del año fiscal
    fy.status = 'closed';
    return this.fiscalYearRepo.save(fy);
  }

  // ══════════════════════════════════════════════════════════
  // ── ACCOUNTING PERIODS ──
  // ══════════════════════════════════════════════════════════

  async findAllPeriods(companyId: number, fiscalYearId?: string) {
    const where: any = { companyId };
    if (fiscalYearId) where.fiscalYearId = fiscalYearId;
    return this.periodRepo.find({
      where,
      order: { year: 'ASC', month: 'ASC' },
    });
  }

  async findOnePeriod(companyId: number, id: string) {
    const period = await this.periodRepo.findOneBy({ id, companyId });
    if (!period) throw new NotFoundException(`Período #${id} no encontrado`);
    return period;
  }

  async closePeriod(companyId: number, id: string, closedBy: string) {
    const period = await this.periodRepo.findOneBy({ id, companyId });
    if (!period) throw new NotFoundException(`Período #${id} no encontrado`);
    if (period.status === 'closed')
      throw new BadRequestException('El período ya está cerrado');

    period.status = 'closed';
    period.closedAt = new Date();
    period.closedBy = closedBy;

    return this.periodRepo.save(period);
  }

  async reopenPeriod(companyId: number, id: string) {
    const period = await this.periodRepo.findOneBy({ id, companyId });
    if (!period) throw new NotFoundException(`Período #${id} no encontrado`);

    period.status = 'open';
    period.closedAt = null;
    period.closedBy = null;

    return this.periodRepo.save(period);
  }

  // ══════════════════════════════════════════════════════════
  // ── PERIOD MANAGEMENT ──
  // ══════════════════════════════════════════════════════════

  private async createMonthlyPeriods(
    fiscalYearId: string,
    companyId: number,
    startDate: Date,
    endDate: Date,
  ) {
    const periods: AccountingPeriod[] = [];

    const current = new Date(startDate);

    while (current <= endDate) {
      const year = current.getFullYear();
      const month = current.getMonth() + 1;

      // Calcular inicio y fin del mes
      const periodStart = new Date(year, month - 1, 1);
      const periodEnd = new Date(year, month, 0); // Último día del mes

      // Ajustar al rango del año fiscal
      periodStart.setTime(Math.max(periodStart.getTime(), startDate.getTime()));
      periodEnd.setTime(Math.min(periodEnd.getTime(), endDate.getTime()));

      const period = this.periodRepo.create({
        fiscalYearId,
        companyId,
        year,
        month,
        name: this.getPeriodName(month),
        startDate: periodStart.toISOString().split('T')[0],
        endDate: periodEnd.toISOString().split('T')[0],
        status: 'open',
      });

      periods.push(period);

      // Siguiente mes
      current.setMonth(current.getMonth() + 1);
    }

    await this.periodRepo.save(periods);
  }

  private getPeriodName(month: number): string {
    const monthNames = [
      'Enero',
      'Febrero',
      'Marzo',
      'Abril',
      'Mayo',
      'Junio',
      'Julio',
      'Agosto',
      'Septiembre',
      'Octubre',
      'Noviembre',
      'Diciembre',
    ];
    return monthNames[month - 1];
  }

  async getCurrentPeriod(companyId: number): Promise<AccountingPeriod | null> {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    return this.periodRepo.findOne({
      where: {
        companyId,
        year,
        month,
        status: 'open',
      },
    });
  }

  async getPeriodByDate(
    companyId: number,
    date: string,
  ): Promise<AccountingPeriod | null> {
    const dateObj = new Date(date);
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth() + 1;

    return this.periodRepo.findOne({
      where: {
        companyId,
        year,
        month,
      },
    });
  }

  async getOpenPeriods(companyId: number): Promise<AccountingPeriod[]> {
    return this.periodRepo.find({
      where: {
        companyId,
        status: 'open',
      },
      order: { year: 'ASC', month: 'ASC' },
    });
  }

  // ══════════════════════════════════════════════════════════
  // ── FISCAL YEAR ANALYSIS ──
  // ══════════════════════════════════════════════════════════

  async getFiscalYearStatistics(companyId: number) {
    const fiscalYears = await this.fiscalYearRepo.find({
      where: { companyId },
      relations: ['periods'],
    });

    const active = fiscalYears.filter((fy) => fy.status === 'open');
    const closed = fiscalYears.filter((fy) => fy.status === 'closed');

    const totalPeriods = fiscalYears.reduce(
      (sum, fy) => sum + fy.periods.length,
      0,
    );
    const openPeriods = fiscalYears.reduce(
      (sum, fy) => sum + fy.periods.filter((p) => p.status === 'open').length,
      0,
    );

    return {
      total: fiscalYears.length,
      active: active.length,
      closed: closed.length,
      totalPeriods,
      openPeriods,
      closedPeriods: totalPeriods - openPeriods,
    };
  }

  async getFiscalYearReport(companyId: number, fiscalYearId: string) {
    const fiscalYear = await this.findOneFiscalYear(companyId, fiscalYearId);
    const periods = await this.findAllPeriods(companyId, fiscalYearId);

    // Obtener estadísticas de comprobantes por período
    const periodStats = await Promise.all(
      periods.map(async (period) => {
        const voucherCount = await this.voucherRepo.count({
          where: {
            companyId,
            date: period.startDate,
          },
        });

        const qb = this.voucherRepo
          .createQueryBuilder('v')
          .select('COUNT(*)', 'count')
          .addSelect('SUM(v.totalAmount)', 'totalAmount')
          .where('v.companyId = :companyId', { companyId })
          .andWhere('v.date >= :startDate', { startDate: period.startDate })
          .andWhere('v.date <= :endDate', { endDate: period.endDate });

        const stats = await qb.getRawOne();

        return {
          id: period.id,
          name: period.name,
          year: period.year,
          month: period.month,
          status: period.status,
          startDate: period.startDate,
          endDate: period.endDate,
          voucherCount: voucherCount,
          totalAmount: Number(stats?.totalAmount || 0),
          closedAt: period.closedAt,
          closedBy: period.closedBy,
        };
      }),
    );

    return {
      fiscalYear,
      periods: periodStats,
      summary: {
        totalPeriods: periods.length,
        openPeriods: periodStats.filter((p) => p.status === 'open').length,
        closedPeriods: periodStats.filter((p) => p.status === 'closed').length,
        totalVouchers: periodStats.reduce((sum, p) => sum + p.voucherCount, 0),
        totalAmount: periodStats.reduce((sum, p) => sum + p.totalAmount, 0),
      },
    };
  }

  // ══════════════════════════════════════════════════════════
  // ── VALIDATION HELPERS ──
  // ══════════════════════════════════════════════════════════

  async validateFiscalYearDates(
    companyId: number,
    startDate: string,
    endDate: string,
    excludeId?: string,
  ): Promise<boolean> {
    const qb = this.fiscalYearRepo
      .createQueryBuilder('fy')
      .where('fy.companyId = :companyId', { companyId })
      .andWhere('(fy.startDate <= :endDate AND fy.endDate >= :startDate)', {
        startDate,
        endDate,
      });

    if (excludeId) {
      qb.andWhere('fy.id != :excludeId', { excludeId });
    }

    const overlapping = await qb.getOne();
    return overlapping ? false : true;
  }

  async canDeleteFiscalYear(companyId: number, id: string): Promise<boolean> {
    const fiscalYear = await this.findOneFiscalYear(companyId, id);

    if (fiscalYear.status === 'closed') {
      return false;
    }

    // Verificar si hay comprobantes en el rango del año fiscal
    const voucherCount = await this.voucherRepo.count({
      where: {
        companyId,
        date: fiscalYear.startDate,
      },
    });

    return voucherCount === 0;
  }

  async getFiscalYearForDate(
    companyId: number,
    date: string,
  ): Promise<FiscalYear | null> {
    return this.fiscalYearRepo
      .createQueryBuilder('fy')
      .where('fy.companyId = :companyId', { companyId })
      .andWhere('fy.startDate <= :date', { date })
      .andWhere('fy.endDate >= :date', { date })
      .getOne();
  }
}
