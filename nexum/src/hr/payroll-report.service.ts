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
  async generateNominaPdf(companyId: number, payrollId: number): Promise<Buffer> {
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

    // Agrupar por centro de costo (área). Las líneas sin centro van a un grupo
    // "Sin área asignada" al final.
    const groups = new Map<string, AreaGroup>();
    for (const item of payroll.items ?? []) {
      const areaName = item.costCenter?.name ?? 'Sin área asignada';
      if (!groups.has(areaName)) groups.set(areaName, { name: areaName, items: [] });
      groups.get(areaName)!.items.push(item);
    }
    const areas = [...groups.values()].sort((a, b) =>
      a.name === 'Sin área asignada' ? 1 : b.name === 'Sin área asignada' ? -1 : a.name.localeCompare(b.name),
    );

    const isVacations = payroll.concept === 'vacaciones';

    const rowHtml = (item: PayrollItem): string => {
      const hourlyRate = Number(item.baseSalary || 0) / MONTHLY_LEGAL_HOURS;
      const days = Number(item.paidUnits || 0) > 0 ? Number(item.paidUnits) : 24;
      const devenVac = isVacations ? Number(item.grossSalary || 0) : 0;
      return `<tr>
        <td>${this.esc(codeByEmployee.get(item.employeeId) ?? '')}</td>
        <td class="nombre">${this.esc(item.employeeName)}</td>
        <td>${this.esc(item.employeeDocument)}</td>
        <td>${OCCUPATIONAL_LETTER[item.occupationalCategory] ?? this.esc(item.occupationalCategory)}</td>
        <td>${hourlyRate.toFixed(4)}</td>
        <td>${days.toFixed(3)}</td>
        <td>${this.fmt(item.grossSalary)}</td>
        <td>${this.fmt(devenVac)}</td>
        <td>${this.fmt(item.taxWithholding)}</td>
        <td>${this.fmt(item.grossSalary)}</td>
        <td>${this.fmt(item.totalDeductions)}</td>
        <td></td>
        <td>${this.fmt(item.netSalary)}</td>
      </tr>`;
    };

    const sum = (items: PayrollItem[], fn: (i: PayrollItem) => number) =>
      items.reduce((acc, i) => acc + fn(i), 0);

    const areaHtml = (area: AreaGroup): string => {
      const rows = area.items.map(rowHtml).join('\n');
      const t = {
        pat: sum(area.items, (i) => Number(i.grossSalary || 0)),
        devenVac: isVacations ? sum(area.items, (i) => Number(i.grossSalary || 0)) : 0,
        imp: sum(area.items, (i) => Number(i.taxWithholding || 0)),
        sRetImp: sum(area.items, (i) => Number(i.grossSalary || 0)),
        pagado: sum(area.items, (i) => Number(i.totalDeductions || 0)),
        salTarf: sum(area.items, (i) => Number(i.netSalary || 0)),
      };
      return `
      <div class="area-header">Área: ${this.esc(area.name)}</div>
      <table>
        <thead>
          <tr>
            <th rowspan="2">Código</th>
            <th rowspan="2">Nombre y Apellidos</th>
            <th rowspan="2">C.I</th>
            <th rowspan="2">Cat. Ocup.</th>
            <th rowspan="2">Días A cobrar</th>
            <th rowspan="2">Bon. Tiemp.</th>
            <th colspan="4">Devengado</th>
            <th rowspan="2">Pagado</th>
            <th rowspan="2">Firma</th>
            <th rowspan="2">Sal. Tarf.</th>
          </tr>
          <tr>
            <th>P.A.T</th>
            <th>Deven. Vac.</th>
            <th>Imp.</th>
            <th>S. Ret. Imp.</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr class="total-area">
            <td colspan="6">TOTAL ÁREA</td>
            <td>${this.fmt(t.pat)}</td>
            <td>${this.fmt(t.devenVac)}</td>
            <td>${this.fmt(t.imp)}</td>
            <td>${this.fmt(t.sRetImp)}</td>
            <td>${this.fmt(t.pagado)}</td>
            <td></td>
            <td>${this.fmt(t.salTarf)}</td>
          </tr>
        </tbody>
      </table>`;
    };

    const items = (payroll.items ?? []) as PayrollItem[];
    const template = fs.readFileSync(
      this.getTemplatePath('nomina-sc-4-06.template.html'),
      'utf-8',
    );

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
      '{{totalPat}}': this.fmt(sum(items, (i) => Number(i.grossSalary || 0))),
      '{{totalDevenVac}}': this.fmt(isVacations ? sum(items, (i) => Number(i.grossSalary || 0)) : 0),
      '{{totalImp}}': this.fmt(sum(items, (i) => Number(i.taxWithholding || 0))),
      '{{totalSRetImp}}': this.fmt(sum(items, (i) => Number(i.grossSalary || 0))),
      '{{totalPagado}}': this.fmt(sum(items, (i) => Number(i.totalDeductions || 0))),
      '{{totalSalTarf}}': this.fmt(sum(items, (i) => Number(i.netSalary || 0))),
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
