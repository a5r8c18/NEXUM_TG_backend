import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PayrollService } from './payroll.service';
import { Payroll } from '../entities/payroll.entity';
import { PayrollItem } from '../entities/payroll-item.entity';
import { Employee } from '../entities/employee.entity';
import { Attendance } from '../entities/attendance.entity';
import { LeaveRequest } from '../entities/leave-request.entity';
import { Payment } from '../entities/payment.entity';
import { VoucherService } from '../accounting/voucher.service';
import { AccountMappingService } from '../accounting/account-mapping.service';
import { FinanceService } from '../finance/finance.service';

jest.setTimeout(30000);

/**
 * Regresión del defecto C-1: las nóminas de subsidio y maternidad generaban un
 * comprobante descuadrado porque el crédito a la 455 por el neto se agregaba
 * sin condicionar el concepto, y la obligación quedaba duplicada (comprobante
 * principal + SUB-/MAT-). Todo comprobante debe cumplir la partida doble y la
 * 455 debe recoger el neto una única vez.
 */
describe('PayrollService.process() — partida doble por concepto', () => {
  let service: PayrollService;
  let payrollRepo: jest.Mocked<Repository<Payroll>>;
  let employeeRepo: { findBy: jest.Mock };
  let voucherService: { createVoucherFromModule: jest.Mock };
  let financeService: { createPayable: jest.Mock };
  let accountMappingService: { getAccountForMapping: jest.Mock };
  let dataSource: { transaction: jest.Mock; query: jest.Mock };
  let voucherCalls: { sourceDocId: string; lines: any[] }[];

  function item(overrides: Partial<PayrollItem> = {}): PayrollItem {
    return {
      id: 1,
      employeeId: 'e1',
      grossSalary: 1000,
      netSalary: 1000,
      totalDeductions: 0,
      socialSecurity: 0,
      taxWithholding: 0,
      otherDeductions: 0,
      healthInsurance: 0,
      pension: 0,
      unionDues: 0,
      vacationProvision: 0,
      subsidyRetention: 0,
      costCenterId: null,
      expenseAccountCode: null,
      costCenter: null,
      ...overrides,
    } as PayrollItem;
  }

  function payrollFixture(concept: string, items: PayrollItem[]): Payroll {
    const totalGross = items.reduce((s, i) => s + Number(i.grossSalary), 0);
    const totalNet = items.reduce((s, i) => s + Number(i.netSalary), 0);
    return {
      id: 1,
      companyId: 10,
      period: '2026-07',
      concept,
      status: 'draft',
      totalGross,
      totalDeductions: 0,
      totalNet,
      endDate: '2026-07-31',
      items,
    } as unknown as Payroll;
  }

  function debits(lines: any[]) {
    return lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  }

  function credits(lines: any[]) {
    return lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  }

  function creditsTo455() {
    return voucherCalls.reduce(
      (s, v) =>
        s +
        v.lines
          .filter((l) => l.accountCode === '455' && Number(l.credit) > 0)
          .reduce((a, l) => a + Number(l.credit), 0),
      0,
    );
  }

  function expectAllBalanced() {
    for (const v of voucherCalls) {
      expect(debits(v.lines)).toBeCloseTo(credits(v.lines), 2);
    }
  }

  async function processPayroll(payroll: Payroll) {
    payrollRepo.findOne.mockResolvedValue(payroll);
    await service.process(10, 1, 'tester');
  }

  beforeEach(async () => {
    voucherCalls = [];

    payrollRepo = { findOne: jest.fn() } as any;
    employeeRepo = { findBy: jest.fn().mockResolvedValue([]) };

    voucherService = {
      createVoucherFromModule: jest
        .fn()
        .mockImplementation(
          (_companyId, _module, sourceDocId, data) => {
            voucherCalls.push({ sourceDocId, lines: data.lines });
            return Promise.resolve({ id: 'v-x' });
          },
        ),
    };

    financeService = {
      createPayable: jest.fn().mockResolvedValue({ id: 'ap-1' }),
    };

    accountMappingService = {
      getAccountForMapping: jest.fn().mockResolvedValue(null),
    };

    const manager = {
      getRepository: jest.fn().mockReturnValue({ save: jest.fn() }),
    };
    dataSource = {
      transaction: jest
        .fn()
        .mockImplementation(async (cb: any) => cb(manager)),
      query: jest.fn().mockResolvedValue([{ balance: 100000 }]),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollService,
        { provide: getRepositoryToken(Payroll), useValue: payrollRepo },
        { provide: getRepositoryToken(PayrollItem), useValue: {} },
        { provide: getRepositoryToken(Employee), useValue: employeeRepo },
        { provide: getRepositoryToken(Attendance), useValue: {} },
        { provide: getRepositoryToken(LeaveRequest), useValue: {} },
        { provide: getRepositoryToken(Payment), useValue: {} },
        { provide: VoucherService, useValue: voucherService },
        { provide: AccountMappingService, useValue: accountMappingService },
        { provide: FinanceService, useValue: financeService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<PayrollService>(PayrollService);
  });

  it('salario: débito a gasto y crédito a la 455 por el neto', async () => {
    await processPayroll(
      payrollFixture('salario', [item({ vacationProvision: 90.9 })]),
    );

    const main = voucherCalls.find((v) => v.sourceDocId === '1');
    expect(main).toBeDefined();
    expectAllBalanced();
    expect(creditsTo455()).toBe(1000);
  });

  it('subsidio sin provisión: solo el comprobante SUB-, 500 contra 455', async () => {
    await processPayroll(payrollFixture('subsidio', [item()]));

    expect(voucherCalls).toHaveLength(1);
    expect(voucherCalls[0].sourceDocId).toBe('SUB-1');
    expectAllBalanced();
    expect(creditsTo455()).toBe(1000);
  });

  it('subsidio con provisión: el comprobante principal solo lleva la provisión y cuadra', async () => {
    await processPayroll(
      payrollFixture('subsidio', [item({ vacationProvision: 90.9 })]),
    );

    const main = voucherCalls.find((v) => v.sourceDocId === '1');
    const sub = voucherCalls.find((v) => v.sourceDocId === 'SUB-1');
    expect(main).toBeDefined();
    expect(sub).toBeDefined();
    expectAllBalanced();
    // La 455 se acredita una sola vez (en el SUB-), no dos.
    expect(creditsTo455()).toBe(1000);
    // El comprobante principal solo contiene la provisión: 90.9 de débito.
    expect(debits(main!.lines)).toBeCloseTo(90.9, 2);
  });

  it('maternidad estatal: 164-0030 contra 455 en el MAT-, sin doble crédito', async () => {
    employeeRepo.findBy.mockResolvedValue([
      { id: 'e1', employmentSector: 'state' },
    ]);
    await processPayroll(
      payrollFixture('maternidad', [item({ vacationProvision: 90.9 })]),
    );

    const mat = voucherCalls.find((v) => v.sourceDocId === 'MAT-1');
    expect(mat).toBeDefined();
    expectAllBalanced();
    expect(creditsTo455()).toBe(1000);
  });

  it('maternidad del sector no estatal: la paga la Filial INSS, sin comprobantes', async () => {
    employeeRepo.findBy.mockResolvedValue([
      { id: 'e1', employmentSector: 'non_state' },
    ]);
    await processPayroll(payrollFixture('maternidad', [item()]));

    expect(voucherCalls).toHaveLength(0);
  });

  it('vacaciones: débito a la 492 y crédito a la 455 por el neto', async () => {
    await processPayroll(payrollFixture('vacaciones', [item()]));

    const main = voucherCalls.find((v) => v.sourceDocId === '1');
    expect(main).toBeDefined();
    expectAllBalanced();
    expect(creditsTo455()).toBe(1000);
  });

  it('los tributos patronales usan solo el devengado, sin la provisión de vacaciones', async () => {
    // Bruto 10 000 + provisión 909: la base del 14 % y del 5 % es 10 000,
    // no 10 909. La provisión es cargo a la reserva 492, no remuneración.
    await processPayroll(
      payrollFixture('salario', [
        item({
          grossSalary: 10000,
          netSalary: 10000,
          vacationProvision: 909,
          subsidyRetention: 150,
        }),
      ]),
    );

    const imp = voucherCalls.find((v) => v.sourceDocId === 'IMP-1');
    expect(imp).toBeDefined();
    const expense855 = imp!.lines.filter(
      (l) => l.accountCode === '855' && Number(l.debit) > 0,
    );
    const ssExpense = expense855.find((l) =>
      l.description.includes('Seguridad Social'),
    );
    const lfExpense = expense855.find((l) =>
      l.description.includes('Fuerza de Trabajo'),
    );
    // 12,5 % presupuesto + 1,5 % provisión = 1 400 sobre 10 000.
    expect(Number(ssExpense!.debit)).toBeCloseTo(1400, 2);
    expect(Number(lfExpense!.debit)).toBeCloseTo(500, 2);
    expectAllBalanced();
  });

  it('vacaciones y liquidación también tributan el aporte patronal y la fuerza de trabajo', async () => {
    // La paga de vacaciones es remuneración: el 14 % y el 5 % patronales no
    // se evaden por pagarse desde el fondo 492.
    await processPayroll(
      payrollFixture('vacaciones', [
        item({ grossSalary: 3750, netSalary: 3750 }),
      ]),
    );

    const imp = voucherCalls.find((v) => v.sourceDocId === 'IMP-1');
    expect(imp).toBeDefined();
    const ssExpense = imp!.lines.find(
      (l) =>
        l.accountCode === '855' &&
        l.description.includes('Seguridad Social'),
    );
    const lfExpense = imp!.lines.find(
      (l) =>
        l.accountCode === '855' &&
        l.description.includes('Fuerza de Trabajo'),
    );
    // 14 % = 525 (468.75 presupuesto + 56.25 provisión) y 5 % = 187.50.
    expect(Number(ssExpense!.debit)).toBeCloseTo(525, 2);
    expect(Number(lfExpense!.debit)).toBeCloseTo(187.5, 2);
    expectAllBalanced();
  });
});
