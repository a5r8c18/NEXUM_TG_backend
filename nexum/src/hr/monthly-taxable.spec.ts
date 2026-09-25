import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HrReportService } from './hr-report.service';
import { Payroll } from '../entities/payroll.entity';
import { PayrollItem } from '../entities/payroll-item.entity';
import { Employee } from '../entities/employee.entity';
import { JobPosition } from '../entities/job-position.entity';
import { incrementalTaxes, monthlyTaxableTotals } from './monthly-taxable';
import {
  calculateIncomeTaxSalaried,
  calculateSocialSecurity,
} from './payroll-calculations';
import { TAXABLE_INCOME_CONCEPTS } from './payroll-concept';

jest.setTimeout(30000);

/**
 * Fix 9 — el IIP y la CESS (Res. 41/2023) gravan el acumulado
 * mensual "por todos los conceptos de pago; incluyendo el pago por descanso
 * retribuido". Antes cada nómina aplicaba la escala progresiva sobre su propio
 * devengado, infra-reteniendo cuando había varios conceptos en el mes; la
 * acreditación y el CNC solo incluían la nómina de salario.
 */
describe('incrementalTaxes — base imponible mensual', () => {
  it('sin nóminas previas retiene igual que el cálculo por nómina', () => {
    const result = incrementalTaxes(undefined, 5000);
    expect(result.socialSecurity).toBe(calculateSocialSecurity(5000));
    expect(result.taxWithholding).toBe(calculateIncomeTaxSalaried(5000));
  });

  it('la segunda nómina del mes retiene la diferencia del acumulado', () => {
    // Salario 5000 ya retenido; llegan vacaciones de 4000.
    const prior = {
      gross: 5000,
      socialSecurity: calculateSocialSecurity(5000),
      taxWithheld: calculateIncomeTaxSalaried(5000),
    };
    const result = incrementalTaxes(prior, 4000);

    // Regresión: aislado hubieran sido cess 200 / iip 22.20.
    expect(result.taxWithholding).toBeCloseTo(
      calculateIncomeTaxSalaried(9000) - calculateIncomeTaxSalaried(5000),
      2,
    );
    expect(result.taxWithholding).toBeCloseTo(120, 2);
    expect(result.socialSecurity).toBeCloseTo(
      calculateSocialSecurity(9000) - calculateSocialSecurity(5000),
      2,
    );
  });

  it('aplica el tramo alto de la CESS al cruzar 15 000 entre nóminas', () => {
    const prior = {
      gross: 14000,
      socialSecurity: calculateSocialSecurity(14000),
      taxWithheld: calculateIncomeTaxSalaried(14000),
    };
    const result = incrementalTaxes(prior, 4000);
    // Aislado serían 200 (5 %); el acumulado de 18 000 paga 10 % sobre el exceso.
    expect(result.socialSecurity).toBeCloseTo(350, 2);
  });

  it('retención negativa cuando una nómina del período se editó a la baja', () => {
    const prior = {
      gross: 9000,
      socialSecurity: calculateSocialSecurity(9000),
      taxWithheld: calculateIncomeTaxSalaried(9000),
    };
    // La nueva línea es de 1000 pero el acumulado "real" baja a 1000.
    const result = incrementalTaxes({ ...prior, gross: 0 }, 1000);
    expect(result.taxWithholding).toBeLessThan(0);
  });
});

describe('monthlyTaxableTotals — consulta de acumulados', () => {
  function qbReturning(rows: any[]) {
    const qb: any = {
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(rows),
    };
    return qb;
  }

  it('agrupa el devengado y las retenciones por trabajador', async () => {
    const qb = qbReturning([
      { employeeId: 'e1', gross: '5000', socialSecurity: '250', taxWithheld: '52.2' },
      { employeeId: 'e2', gross: '3000', socialSecurity: '150', taxWithheld: '0' },
    ]);
    const repo = { createQueryBuilder: jest.fn().mockReturnValue(qb) } as any;

    const totals = await monthlyTaxableTotals(repo, 10, '2026-05');

    expect(totals.get('e1')).toEqual({
      gross: 5000,
      socialSecurity: 250,
      taxWithheld: 52.2,
    });
    expect(totals.get('e2')?.gross).toBe(3000);
  });

  it('solo cuenta conceptos gravables y excluye nóminas canceladas', async () => {
    const qb = qbReturning([]);
    const repo = { createQueryBuilder: jest.fn().mockReturnValue(qb) } as any;

    await monthlyTaxableTotals(repo, 10, '2026-05');

    const andWhereArgs = qb.andWhere.mock.calls.map((c) => c[1] || {});
    const conceptFilter = andWhereArgs.find((a) => a.concepts);
    expect(conceptFilter.concepts).toEqual(TAXABLE_INCOME_CONCEPTS);
    expect(andWhereArgs.find((a) => a.cancelled)?.cancelled).toBe('cancelled');
  });
});

describe('HrReportService — CNC y acreditación por todos los conceptos', () => {
  let service: HrReportService;
  let payrollRepo: jest.Mocked<Repository<Payroll>>;
  let employeeRepo: jest.Mocked<Repository<Employee>>;

  const emp = {
    id: 'e1',
    firstName: 'Ana',
    lastName: 'Pérez',
    documentId: '90010100001',
    bankName: 'BPA',
    bankAccount: '92049598765',
    employmentSector: 'state',
  } as Employee;

  const nonStateEmp = {
    ...emp,
    id: 'e2',
    documentId: '85050500002',
    employmentSector: 'non_state',
  } as Employee;

  function payroll(concept: string, items: Partial<PayrollItem>[]): Payroll {
    return { concept, period: '2026-05', status: 'paid', items } as Payroll;
  }

  function item(over: Partial<PayrollItem>): Partial<PayrollItem> {
    return {
      employeeId: emp.id,
      employeeName: 'Ana Pérez',
      employeeDocument: '90010100001',
      grossSalary: 0,
      socialSecurity: 0,
      taxWithholding: 0,
      netSalary: 0,
      ...over,
    };
  }

  beforeEach(async () => {
    payrollRepo = { find: jest.fn() } as any;
    employeeRepo = { find: jest.fn() } as any;

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

  it('CNC agrega salario + vacaciones del mismo trabajador en una fila', async () => {
    payrollRepo.find.mockResolvedValue([
      payroll('salario', [
        item({ grossSalary: 5000, socialSecurity: 250, taxWithholding: 52.2, netSalary: 4647.8 }),
      ]),
      payroll('vacaciones', [
        item({ grossSalary: 4000, socialSecurity: 200, taxWithholding: 120, netSalary: 3680 }),
      ]),
    ]);

    const rows = await service.payrollCnc(10, '2026-05');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      employeeName: 'Ana Pérez',
      grossSalary: 9000,
      socialSecurity: 450,
      taxWithholding: 172.2,
      netSalary: 8327.8,
    });
  });

  it('CNC solo consulta los conceptos gravables del período', async () => {
    payrollRepo.find.mockResolvedValue([]);
    await service.payrollCnc(10, '2026-05');

    const where = payrollRepo.find.mock.calls[0][0]?.where as any;
    expect(where.period).toBe('2026-05');
    // In() de TypeORM: el valor interno lleva el array de conceptos.
    expect(where.concept._value).toEqual(TAXABLE_INCOME_CONCEPTS);
    expect(where.status._value).toEqual(['processed', 'paid']);
  });

  it('acreditación: una fila por trabajador con el neto de todas las nóminas', async () => {
    payrollRepo.find.mockResolvedValue([
      payroll('salario', [item({ netSalary: 4647.8 })]),
      payroll('vacaciones', [item({ netSalary: 3680 })]),
      payroll('libre', [item({ netSalary: 500 })]),
    ]);
    employeeRepo.find.mockResolvedValue([emp]);

    const rows = await service.accreditationFile(10, '2026-05');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      documentId: '90010100001',
      employeeName: 'Ana Pérez',
      bankName: 'BPA',
      bankAccount: '92049598765',
      amount: 8827.8,
    });
  });

  it('acreditación excluye la maternidad del sector no estatal (la paga el INSS)', async () => {
    payrollRepo.find.mockResolvedValue([
      // Madre estatal: sí se acredita por el banco de la empresa.
      payroll('maternidad', [
        item({ employeeId: emp.id, netSalary: 6000 }),
      ]),
      // Madre TCP: la Filial INSS le paga directo; no va en el fichero.
      payroll('maternidad', [
        item({
          employeeId: nonStateEmp.id,
          employeeName: 'Luisa TCP',
          employeeDocument: '85050500002',
          netSalary: 3210,
        }),
      ]),
    ]);
    employeeRepo.find.mockResolvedValue([emp, nonStateEmp]);

    const rows = await service.accreditationFile(10, '2026-05');

    expect(rows).toHaveLength(1);
    expect(rows[0].documentId).toBe('90010100001');
    expect(rows[0].amount).toBe(6000);
  });

  it('acreditación toma todas las nóminas liquidadas del período, sin filtro de concepto', async () => {
    payrollRepo.find.mockResolvedValue([]);
    employeeRepo.find.mockResolvedValue([]);

    await service.accreditationFile(10, '2026-05');

    const where = payrollRepo.find.mock.calls[0][0]?.where as any;
    expect(where.period).toBe('2026-05');
    expect(where.concept).toBeUndefined();
    expect(where.status._value).toEqual(['processed', 'paid']);
  });
});
