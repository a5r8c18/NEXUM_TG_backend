/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import { Payroll } from '../entities/payroll.entity';
import { PayrollItem } from '../entities/payroll-item.entity';
import { Employee } from '../entities/employee.entity';
import { Company } from '../entities/company.entity';
import { CostCenter } from '../entities/cost-center.entity';

/** Horas legales mensuales usadas para la tarifa horaria del modelo. */
const MONTHLY_LEGAL_HOURS = 190.6;

/** Letra de categoría ocupacional usada en el modelo SC-4-06. */
const OCCUPATIONAL_LETTER: Record<string, string> = {
  '0010': 'D', // Dirigentes
  '0020': 'T', // Técnicos
  '0030': 'S', // Servicios
  '0040': 'O', // Obreros
  '0050': 'A', // Administrativos / otros
};

const CONCEPT_LABEL: Record<string, string> = {
  salario: 'SALARIO',
  vacaciones: 'VACACIONES',
  subsidio: 'SUBSIDIO',
  maternidad: 'MATERNIDAD',
  paternidad: 'PATERNIDAD',
  libre: 'LIBRE',
};

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

interface AreaGroup {
  name: string;
  items: PayrollItem[];
}

@Injectable()
export class PayrollReportService {
  constructor(
    @InjectRepository(Payroll)
    private readonly payrollRepo: Repository<Payroll>,
    @InjectRepository(PayrollItem)
    private readonly payrollItemRepo: Repository<PayrollItem>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectRepository(CostCenter)
    private readonly costCenterRepo: Repository<CostCenter>,
  ) {}

  private getTemplatePath(fileName: string): string {
    const candidates = [
      path.join(__dirname, 'templates', fileName),
      path.join(process.cwd(), 'src', 'hr', 'templates', fileName),
      path.join(process.cwd(), 'dist', 'hr', 'templates', fileName),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return candidates[0];
  }

  private fmt(value: number | null | undefined): string {
    const v = Number(value ?? 0);
    return v.toLocaleString('es-CU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  private esc(text: string | null | undefined): string {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private formatDate(date: string | Date | null | undefined): string {
    if (!date) return '';
    const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : date;
    if (isNaN(d.getTime())) return String(date);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()}`;
  }

  private periodLabel(period: string): string {
    // period: "2026-04" → "Abril 2026"
    const [y, m] = String(period ?? '').split('-');
    const month = MONTHS_ES[parseInt(m, 10) - 1];
    return month ? `${month} ${y}` : period;
  }

  /**
   * Genera el PDF de la nómina en el Modelo SC-4-06 con los datos reales de la
   * empresa, agrupando los trabajadores por centro de costo (área).
   */
  async generateNominaPdf(
    companyId: number,
    payrollId: number,
    unit: 'dias' | 'horas' = 'dias',
    groupBy: 'area' | 'costCenterAccount' | 'none' = 'area',
  ): Promise<Buffer> {
    const payroll = await this.payrollRepo.findOne({
      where: { id: payrollId, companyId },
      relations: ['items', 'items.costCenter'],
    });
    if (!payroll) {
      throw new NotFoundException('Nómina no encontrada');
    }

    const company = await this.companyRepo.findOne({ where: { id: companyId } });

    // Códigos de trabajador para la primera columna del modelo.
    const employeeIds = (payroll.items ?? []).map((i: PayrollItem) => i.employeeId);
    const employees = employeeIds.length
      ? await this.employeeRepo.findByIds(employeeIds)
      : [];
    const codeByEmployee = new Map(employees.map((e) => [e.id, e.employeeCode]));

    // Agrupar según la opción elegida: área, centro de costo-cuenta o sin agrupar.
    const groupLabel =
      groupBy === 'costCenterAccount'
        ? 'Centro de costo / Cuenta'
        : groupBy === 'none'
          ? ''
          : 'Área';
    const showHeader = groupBy !== 'none';

    const groups = new Map<string, AreaGroup>();
    for (const item of payroll.items ?? []) {
      let groupName: string;
      if (groupBy === 'none') {
        groupName = 'Sin agrupar';
      } else if (groupBy === 'costCenterAccount') {
        const cc = item.costCenter?.name ?? 'Sin centro de costo';
        const acc = item.expenseAccountCode ? ` · Cuenta ${item.expenseAccountCode}` : '';
        groupName = `${cc}${acc}`;
      } else {
        groupName = item.costCenter?.name ?? 'Sin área asignada';
      }
      if (!groups.has(groupName)) groups.set(groupName, { name: groupName, items: [] });
      groups.get(groupName)!.items.push(item);
    }
    const areas = [...groups.values()].sort((a, b) =>
      a.name === 'Sin área asignada' || a.name === 'Sin centro de costo'
        ? 1
        : b.name === 'Sin área asignada' || b.name === 'Sin centro de costo'
          ? -1
          : a.name.localeCompare(b.name),
    );

    const isVacations = payroll.concept === 'vacaciones';
    const isHours = unit === 'horas';
    const unitLabel = isHours ? 'Horas' : 'Días';
    const DAYS_PER_MONTH = 30;
    const HOURS_PER_DAY = MONTHLY_LEGAL_HOURS / DAYS_PER_MONTH;
    const round2 = (v: number) => Math.round(v * 100) / 100;

    const rowHtml = (item: PayrollItem): string => {
      const baseForRate = Number(item.baseSalary || item.averageSalary || 0);
      const rate = isHours
        ? baseForRate / MONTHLY_LEGAL_HOURS
        : baseForRate / DAYS_PER_MONTH;
      const rawUnits = Number(item.paidUnits || 0) > 0
        ? Number(item.paidUnits)
        : (isHours ? MONTHLY_LEGAL_HOURS : DAYS_PER_MONTH);
      const timeUnits = isHours ? rawUnits * HOURS_PER_DAY : rawUnits;

      const bonif =
        Number(item.bonuses || 0) +
        Number(item.commissions || 0) +
        Number(item.allowances || 0);
      const pat = Number(item.overtimePay || 0);
      const gross = Number(item.grossSalary || 0);
      const aCobrar = Math.max(0, round2(gross - pat - bonif));

      const vacationTime = isVacations
        ? String(Number(item.paidUnits || 0).toFixed(3))
        : (payroll.concept === 'salario' ? '' : '—');
      const vacationAmount = isVacations
        ? gross
        : (payroll.concept === 'salario'
          ? Number(item.vacationProvision || 0)
          : 0);

      return `<tr>
        <td>${this.esc(codeByEmployee.get(item.employeeId) ?? '')}</td>
        <td class="nombre">${this.esc(item.employeeName)}</td>
        <td>${this.esc(item.employeeDocument)}</td>
        <td>${OCCUPATIONAL_LETTER[item.occupationalCategory] ?? this.esc(item.occupationalCategory)}</td>
        <td>${rate.toFixed(4)}</td>
        <td>${timeUnits.toFixed(3)}</td>
        <td>${this.fmt(aCobrar)}</td>
        <td>${this.fmt(bonif)}</td>
        <td>${this.fmt(pat)}</td>
        <td>${this.fmt(gross)}</td>
        <td>${this.fmt(item.taxWithholding)}</td>
        <td>${this.fmt(item.socialSecurity)}</td>
        <td>${this.fmt(item.totalDeductions)}</td>
        <td>${this.fmt(item.netSalary)}</td>
        <td>${vacationTime}</td>
        <td>${this.fmt(vacationAmount)}</td>
        <td></td>
      </tr>`;
    };

    const sum = (items: PayrollItem[], fn: (i: PayrollItem) => number) =>
      items.reduce((acc, i) => acc + fn(i), 0);

    const areaHtml = (area: AreaGroup): string => {
      const rows = area.items.map(rowHtml).join('\n');
      const t = {
        aCobrar: sum(area.items, (i) => {
          const bonif = Number(i.bonuses || 0) + Number(i.commissions || 0) + Number(i.allowances || 0);
          const pat = Number(i.overtimePay || 0);
          return Math.max(0, round2(Number(i.grossSalary || 0) - pat - bonif));
        }),
        bonif: sum(area.items, (i) => Number(i.bonuses || 0) + Number(i.commissions || 0) + Number(i.allowances || 0)),
        pat: sum(area.items, (i) => Number(i.overtimePay || 0)),
        devengado: sum(area.items, (i) => Number(i.grossSalary || 0)),
        impIngresos: sum(area.items, (i) => Number(i.taxWithholding || 0)),
        segSocial: sum(area.items, (i) => Number(i.socialSecurity || 0)),
        retenciones: sum(area.items, (i) => Number(i.totalDeductions || 0)),
        pagado: sum(area.items, (i) => Number(i.netSalary || 0)),
        vacationTime: isVacations
          ? sum(area.items, (i) => Number(i.paidUnits || 0)).toFixed(3)
          : '',
        vacationImporte: isVacations
          ? sum(area.items, (i) => Number(i.grossSalary || 0))
          : sum(area.items, (i) => (payroll.concept === 'salario' ? Number(i.vacationProvision || 0) : 0)),
      };
      return `
      ${showHeader ? `<div class="area-header">${groupLabel}: ${this.esc(area.name)}</div>` : ''}
      <table>
        <thead>
          <tr>
            <th rowspan="2">Código</th>
            <th rowspan="2">Nombre y Apellidos</th>
            <th rowspan="2">C.I</th>
            <th rowspan="2">Cat. Ocup.</th>
            <th rowspan="2">Tarifa Salarial</th>
            <th rowspan="2">${unitLabel}</th>
            <th rowspan="2">A cobrar</th>
            <th rowspan="2">Bonificaciones</th>
            <th rowspan="2">P.A.T</th>
            <th rowspan="2">Devengado</th>
            <th colspan="2">Impuestos salariales</th>
            <th rowspan="2">Retenciones</th>
            <th rowspan="2">Pagado</th>
            <th colspan="2">Vacaciones</th>
            <th rowspan="2">Firma</th>
          </tr>
          <tr>
            <th>Impuestos sobre ingresos personales</th>
            <th>Seguridad Social Especial</th>
            <th>Tiempo</th>
            <th>Importe</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          ${showHeader ? `<tr class="total-area">
            <td colspan="6">TOTAL GRUPO</td>
            <td>${this.fmt(t.aCobrar)}</td>
            <td>${this.fmt(t.bonif)}</td>
            <td>${this.fmt(t.pat)}</td>
            <td>${this.fmt(t.devengado)}</td>
            <td>${this.fmt(t.impIngresos)}</td>
            <td>${this.fmt(t.segSocial)}</td>
            <td>${this.fmt(t.retenciones)}</td>
            <td>${this.fmt(t.pagado)}</td>
            <td>${t.vacationTime}</td>
            <td>${this.fmt(t.vacationImporte)}</td>
            <td></td>
          </tr>` : ''}
        </tbody>
      </table>`;
    };

    const items = (payroll.items ?? []) as PayrollItem[];
    const template = fs.readFileSync(
      this.getTemplatePath('nomina-sc-4-06.template.html'),
      'utf-8',
    );

    const total = {
      aCobrar: sum(items, (i) => {
        const bonif = Number(i.bonuses || 0) + Number(i.commissions || 0) + Number(i.allowances || 0);
        const pat = Number(i.overtimePay || 0);
        return Math.max(0, round2(Number(i.grossSalary || 0) - pat - bonif));
      }),
      bonif: sum(items, (i) => Number(i.bonuses || 0) + Number(i.commissions || 0) + Number(i.allowances || 0)),
      pat: sum(items, (i) => Number(i.overtimePay || 0)),
      devengado: sum(items, (i) => Number(i.grossSalary || 0)),
      impIngresos: sum(items, (i) => Number(i.taxWithholding || 0)),
      segSocial: sum(items, (i) => Number(i.socialSecurity || 0)),
      retenciones: sum(items, (i) => Number(i.totalDeductions || 0)),
      pagado: sum(items, (i) => Number(i.netSalary || 0)),
      vacationTime: isVacations
        ? sum(items, (i) => Number(i.paidUnits || 0)).toFixed(3)
        : '',
      vacationImporte: isVacations
        ? sum(items, (i) => Number(i.grossSalary || 0))
        : sum(items, (i) => (payroll.concept === 'salario' ? Number(i.vacationProvision || 0) : 0)),
    };

    const totalNomina = `
      <tr class="total-nomina">
        <td colspan="6">TOTAL NOMINA</td>
        <td>${this.fmt(total.aCobrar)}</td>
        <td>${this.fmt(total.bonif)}</td>
        <td>${this.fmt(total.pat)}</td>
        <td>${this.fmt(total.devengado)}</td>
        <td>${this.fmt(total.impIngresos)}</td>
        <td>${this.fmt(total.segSocial)}</td>
        <td>${this.fmt(total.retenciones)}</td>
        <td>${this.fmt(total.pagado)}</td>
        <td>${total.vacationTime}</td>
        <td>${this.fmt(total.vacationImporte)}</td>
        <td></td>
      </tr>`;

    const replacements: Record<string, string> = {
      '{{fecha}}': this.formatDate(payroll.paidAt ?? payroll.endDate),
      '{{periodoPago}}': `${this.formatDate(payroll.startDate)} - ${this.formatDate(payroll.endDate)}`,
      '{{numeroNomina}}': String(payroll.id).padStart(5, '0'),
      '{{periodoLabel}}': this.periodLabel(payroll.period),
      '{{empresa}}': this.esc(company?.name ?? ''),
      '{{instrumentoPago}}': String(payroll.id).padStart(5, '0'),
      '{{elaboradaPor}}': this.esc(payroll.processedBy ?? ''),
      '{{aprobadaPor}}': '',
      '{{revisadaPor}}': '',
      '{{contabilizadaPor}}': '',
      '{{conceptoLabel}}': CONCEPT_LABEL[payroll.concept] ?? String(payroll.concept).toUpperCase(),
      '{{entidad}}': this.esc(company?.name ?? ''),
      '{{areas}}': areas.map(areaHtml).join('\n'),
      '{{totalNomina}}': totalNomina,
    };

    const html = Object.entries(replacements).reduce(
      (h, [key, val]) => h.replaceAll(key, val),
      template,
    );

    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({
        format: 'A4',
        landscape: true,
        printBackground: true,
        margin: { top: '8mm', bottom: '8mm', left: '8mm', right: '8mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
}
