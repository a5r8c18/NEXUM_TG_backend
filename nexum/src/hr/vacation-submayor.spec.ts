import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HrReportService } from './hr-report.service';
import { Payroll } from '../entities/payroll.entity';
import { PayrollItem } from '../entities/payroll-item.entity';
import { Employee } from '../entities/employee.entity';
import { JobPosition } from '../entities/job-position.entity';

/**
 * El submayor de vacaciones es el libro auxiliar de la cuenta 492: por
 * trabajador y período muestra saldo inicial, lo devengado (provisión del
 * Art. 102), lo liquidado (disfrute y liquidación del Art. 52) y el saldo
 * final. Un saldo final negativo es un adelanto de vacaciones.
 */
describe('HrReportService.vacationSubmayor()', () => {
  let service: HrReportService;
  let payrollRepo: { find: jest.Mock };
  let employeeRepo: { find: jest.Mock };

  const ana = {
    id: 'e1',
    companyId: 10,
    firstName: 'Ana',
    lastName: 'Pérez',
    documentId: '90010100001',
    initialVacationDays: 10,
    initialVacationAmount: 909,
  } as Employee;
  const luis = {
    id: 'e2',
    companyId: 10,
    firstName: 'Luis',
    lastName: 'Gómez',
    documentId: '91020200002',
    initialVacationDays: 0,
    initialVacationAmount: 0,
  } as Employee;

  function item(overrides: Partial<PayrollItem>): PayrollItem {
    return { companyId: 10, ...overrides } as PayrollItem;
  }

  function payroll(
    concept: string,
    period: string,
    items: PayrollItem[],
    status = 'processed',
  ): Payroll {
    return { id: 1, companyId: 10, concept, period, status, items } as Payroll;
  }

  /** El mock respeta los filtros del where como lo haría la base de datos. */
  function withPayrolls(list: Payroll[]) {
    payrollRepo.find.mockImplementation(({ where }: any) => {
      const maxPeriod = where.period.value as string;
      const statuses = where.status.value as string[];
      const concepts = where.concept.value as string[];
      return Promise.resolve(
        list.filter(
          (p) =>
            p.period <= maxPeriod &&
            statuses.includes(p.status) &&
            concepts.includes(p.concept),
        ),
      );
    });
  }

  beforeEach(async () => {
    payrollRepo = { find: jest.fn().mockResolvedValue([]) };
    employeeRepo = { find: jest.fn().mockResolvedValue([ana, luis]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HrReportService,
        { provide: getRepositoryToken(Payroll), useValue: payrollRepo },
        { provide: getRepositoryToken(Employee), useValue: employeeRepo },
        { provide: getRepositoryToken(JobPosition), useValue: {} },
      ],
    }).compile();

    service = module.get<HrReportService>(HrReportService);
  });

  it('saldo inicial + devengado del mes − liquidado del mes = saldo final', async () => {
    withPayrolls([
      // Junio: Ana acumula 2,18 días / 545,40.
      payroll('salario', '2026-06', [
        item({ employeeId: 'e1', vacationDays: 2.18, vacationProvision: 545.4, paidUnits: 24 }),
      ]),
      // Julio: Ana acumula 2,18 / 545,40 y disfruta 5 días por 1 250.
      payroll('salario', '2026-07', [
        item({ employeeId: 'e1', vacationDays: 2.18, vacationProvision: 545.4, paidUnits: 24 }),
      ]),
      payroll('vacaciones', '2026-07', [
        item({ employeeId: 'e1', paidUnits: 5, grossSalary: 1250 }),
      ]),
    ]);

    const rows = await service.vacationSubmayor(10, '2026-07');
    expect(rows).toHaveLength(1);

    const r = rows[0];
    expect(r.employeeName).toBe('Ana Pérez');
    // Inicial: 10 + 2,18 días y 909 + 545,40 de junio.
    expect(r.openingDays).toBeCloseTo(12.18, 2);
    expect(r.openingAmount).toBeCloseTo(1454.4, 2);
    // Devengado del mes: solo la provisión de julio.
    expect(r.accruedDays).toBeCloseTo(2.18, 2);
    expect(r.accruedAmount).toBeCloseTo(545.4, 2);
    // Liquidado del mes: el disfrute de julio.
    expect(r.settledDays).toBe(5);
    expect(r.settledAmount).toBe(1250);
    // Final = inicial + devengado − liquidado.
    expect(r.closingDays).toBeCloseTo(9.36, 2);
    expect(r.closingAmount).toBeCloseTo(749.8, 2);
  });

  it('la liquidación del Art. 52 consume todo el saldo acumulado', async () => {
    withPayrolls([
      payroll('salario', '2026-06', [
        item({ employeeId: 'e1', vacationDays: 2.18, vacationProvision: 545.4, paidUnits: 24 }),
      ]),
      payroll('liquidacion', '2026-07', [
        item({ employeeId: 'e1', paidUnits: 12.18, grossSalary: 1454.4 }),
      ]),
    ]);

    const rows = await service.vacationSubmayor(10, '2026-07');
    const r = rows[0];
    expect(r.settledDays).toBeCloseTo(12.18, 2);
    expect(r.settledAmount).toBeCloseTo(1454.4, 2);
    expect(r.closingDays).toBeCloseTo(0, 2);
    expect(r.closingAmount).toBeCloseTo(0, 2);
  });

  it('disfrutar sin acumulado deja el saldo final en negativo (adelanto)', async () => {
    withPayrolls([
      payroll('vacaciones', '2026-07', [
        item({ employeeId: 'e2', paidUnits: 10, grossSalary: 2000 }),
      ]),
    ]);

    const rows = await service.vacationSubmayor(10, '2026-07');
    const r = rows.find((x) => x.employeeName === 'Luis Gómez');
    expect(r).toBeDefined();
    expect(r!.openingDays).toBe(0);
    expect(r!.closingDays).toBe(-10);
    expect(r!.closingAmount).toBe(-2000);
  });

  it('empleados sin saldo ni movimiento no aparecen en el submayor', async () => {
    withPayrolls([
      payroll('salario', '2026-07', [
        item({ employeeId: 'e1', vacationDays: 0, vacationProvision: 0, paidUnits: 0 }),
      ]),
    ]);

    // Luis nunca tuvo movimientos ni saldo de apertura: no sale.
    const rows = await service.vacationSubmayor(10, '2026-07');
    expect(rows.map((r) => r.employeeName)).not.toContain('Luis Gómez');
  });

  it('las nóminas del período se separan del saldo inicial aunque compartan consulta', async () => {
    withPayrolls([
      payroll('salario', '2026-05', [
        item({ employeeId: 'e2', vacationDays: 2.18, vacationProvision: 500, paidUnits: 24 }),
      ]),
      payroll('salario', '2026-06', [
        item({ employeeId: 'e2', vacationDays: 2.18, vacationProvision: 500, paidUnits: 24 }),
      ]),
      payroll('salario', '2026-07', [
        item({ employeeId: 'e2', vacationDays: 2.18, vacationProvision: 500, paidUnits: 24 }),
      ]),
    ]);

    const rows = await service.vacationSubmayor(10, '2026-06');
    const r = rows.find((x) => x.employeeName === 'Luis Gómez');
    // Solo mayo alimenta el inicial; junio es el devengado; julio no existe aún.
    expect(r!.openingDays).toBeCloseTo(2.18, 2);
    expect(r!.openingAmount).toBeCloseTo(500, 2);
    expect(r!.accruedDays).toBeCloseTo(2.18, 2);
    expect(r!.accruedAmount).toBeCloseTo(500, 2);
    expect(r!.closingDays).toBeCloseTo(4.36, 2);
    expect(r!.closingAmount).toBeCloseTo(1000, 2);
  });

  it('la consulta solo toma nóminas contabilizadas (procesadas o pagadas)', async () => {
    await service.vacationSubmayor(10, '2026-07');

    const where = payrollRepo.find.mock.calls[0][0].where;
    expect(where.status.value).toEqual(['processed', 'paid']);
    expect(where.concept.value).toEqual(
      expect.arrayContaining(['salario', 'vacaciones', 'liquidacion']),
    );
  });
});
