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
import { WORKING_DAYS_PER_MONTH } from './payroll-concept';

jest.setTimeout(30000);

/**
 * Edición de líneas en borrador: reconstruir los ítems no debe perder la
 * trazabilidad del cálculo (licencia origen, salario promedio, tasa) — cancel()
 * la necesita para restituir lo liquidado — ni convertir un paidUnits
 * explícito de 0 en el mes completo.
 */
describe('PayrollService.updateItems()', () => {
  let service: PayrollService;
  let payrollRepo: { findOne: jest.Mock; save: jest.Mock };
  let payrollItemRepo: {
    delete: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let employeeRepo: { findBy: jest.Mock };
  let savedItems: any[];

  function draftPayroll(items: Partial<PayrollItem>[]): Payroll {
    return {
      id: 1,
      companyId: 10,
      period: '2026-07',
      concept: 'salario',
      status: 'draft',
      items,
    } as unknown as Payroll;
  }

  beforeEach(async () => {
    savedItems = [];
    payrollRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    };
    payrollItemRepo = {
      delete: jest.fn().mockResolvedValue(undefined),
      save: jest
        .fn()
        .mockImplementation((item: any) => {
          savedItems.push(item);
          return Promise.resolve(item);
        }),
      createQueryBuilder: jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      }),
    };
    employeeRepo = { findBy: jest.fn().mockResolvedValue([]) };

    const txManager = {
      getRepository: jest.fn((entity: any) =>
        entity === PayrollItem ? payrollItemRepo : payrollRepo,
      ),
    };
    const dataSource = {
      transaction: (cb: (m: typeof txManager) => Promise<unknown>) =>
        cb(txManager),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollService,
        { provide: getRepositoryToken(Payroll), useValue: payrollRepo },
        { provide: getRepositoryToken(PayrollItem), useValue: payrollItemRepo },
        { provide: getRepositoryToken(Employee), useValue: employeeRepo },
        { provide: getRepositoryToken(Attendance), useValue: {} },
        { provide: getRepositoryToken(LeaveRequest), useValue: {} },
        { provide: getRepositoryToken(Payment), useValue: {} },
        { provide: VoucherService, useValue: {} },
        { provide: AccountMappingService, useValue: {} },
        { provide: FinanceService, useValue: {} },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<PayrollService>(PayrollService);
  });

  it('conserva leaveRequestId, averageSalary y appliedRate de la línea previa', async () => {
    payrollRepo.findOne.mockResolvedValue(
      draftPayroll([
        {
          id: 7,
          employeeId: 'e1',
          leaveRequestId: 'lv-9',
          averageSalary: 24000,
          appliedRate: 0.6,
        } as Partial<PayrollItem>,
      ]),
    );

    // El frontend reenvía solo los campos editables.
    await service.updateItems(10, 1, [
      { employeeId: 'e1', employeeName: 'Ana', baseSalary: 5000 },
    ]);

    expect(savedItems).toHaveLength(1);
    expect(savedItems[0].leaveRequestId).toBe('lv-9');
    expect(savedItems[0].averageSalary).toBe(24000);
    expect(savedItems[0].appliedRate).toBe(0.6);
  });

  it('respeta un paidUnits explícito de 0 (ausencia total)', async () => {
    payrollRepo.findOne.mockResolvedValue(
      draftPayroll([{ id: 8, employeeId: 'e1' } as Partial<PayrollItem>]),
    );

    await service.updateItems(10, 1, [
      { employeeId: 'e1', employeeName: 'Ana', baseSalary: 4800, paidUnits: 0 },
    ]);

    expect(savedItems[0].paidUnits).toBe(0);
    expect(savedItems[0].grossSalary).toBe(0);
    expect(savedItems[0].vacationDays).toBe(0);
  });

  it('asume el mes completo solo cuando paidUnits viene ausente', async () => {
    payrollRepo.findOne.mockResolvedValue(
      draftPayroll([{ id: 9, employeeId: 'e1' } as Partial<PayrollItem>]),
    );

    await service.updateItems(10, 1, [
      { employeeId: 'e1', employeeName: 'Ana', baseSalary: 4800 },
    ]);

    expect(savedItems[0].paidUnits).toBe(WORKING_DAYS_PER_MONTH);
    expect(savedItems[0].grossSalary).toBe(4800);
  });

  it('prefiere el leaveRequestId que envía el cliente sobre el previo', async () => {
    payrollRepo.findOne.mockResolvedValue(
      draftPayroll([
        {
          id: 10,
          employeeId: 'e1',
          leaveRequestId: 'lv-old',
        } as Partial<PayrollItem>,
      ]),
    );

    await service.updateItems(10, 1, [
      {
        employeeId: 'e1',
        employeeName: 'Ana',
        baseSalary: 5000,
        leaveRequestId: 'lv-new',
      },
    ]);

    expect(savedItems[0].leaveRequestId).toBe('lv-new');
  });

  it('recalcula CESS e IIP en servidor e ignora lo que envía el cliente', async () => {
    payrollRepo.findOne.mockResolvedValue(
      draftPayroll([{ id: 11, employeeId: 'e1' } as Partial<PayrollItem>]),
    );

    await service.updateItems(10, 1, [
      {
        employeeId: 'e1',
        employeeName: 'Ana',
        baseSalary: 4800,
        // Intentos de retención arbitraria: deben ignorarse.
        socialSecurity: 1,
        taxWithholding: 1,
      },
    ]);

    // Primera nómina del período: CESS 5 % de 4 800; IIP 3 % de (4 800-3 260).
    expect(savedItems[0].socialSecurity).toBeCloseTo(240, 2);
    expect(savedItems[0].taxWithholding).toBeCloseTo(46.2, 2);
    expect(savedItems[0].netSalary).toBeCloseTo(4800 - 240 - 46.2, 2);
  });

  it('retiene solo el delta incremental sobre el acumulado del mes', async () => {
    payrollRepo.findOne.mockResolvedValue(
      draftPayroll([{ id: 12, employeeId: 'e1' } as Partial<PayrollItem>]),
    );

    // Otra nómina del período ya devengó 10 000 y retuvo su cuota.
    const qb = payrollItemRepo.createQueryBuilder();
    qb.getRawMany.mockResolvedValue([
      {
        employeeId: 'e1',
        gross: '10000',
        socialSecurity: '500',
        taxWithheld: '212',
      },
    ]);

    await service.updateItems(10, 1, [
      { employeeId: 'e1', employeeName: 'Ana', baseSalary: 20000 },
    ]);

    // Acumulado 30 000: CESS = 2 250 → delta 1 750; IIP = 2 087 → delta 1 875.
    expect(savedItems[0].socialSecurity).toBeCloseTo(1750, 2);
    expect(savedItems[0].taxWithholding).toBeCloseTo(1875, 2);
  });

  it('devuelve retención de más cuando el mes se edita a la baja', async () => {
    payrollRepo.findOne.mockResolvedValue(
      draftPayroll([{ id: 13, employeeId: 'e1' } as Partial<PayrollItem>]),
    );

    // El resto del mes ya retuvo por encima de lo que marca la escala.
    const qb = payrollItemRepo.createQueryBuilder();
    qb.getRawMany.mockResolvedValue([
      {
        employeeId: 'e1',
        gross: '30000',
        socialSecurity: '3000',
        taxWithheld: '2500',
      },
    ]);

    await service.updateItems(10, 1, [
      { employeeId: 'e1', employeeName: 'Ana', baseSalary: 1000 },
    ]);

    // Acumulado 31 000: CESS legal 2 350 (-650) e IIP legal 2 287 (-213).
    expect(savedItems[0].socialSecurity).toBeCloseTo(-650, 2);
    expect(savedItems[0].taxWithholding).toBeCloseTo(-213, 2);
    expect(savedItems[0].netSalary).toBeGreaterThan(savedItems[0].grossSalary);
  });

  it('fuerza retenciones a 0 en conceptos exentos (subsidio)', async () => {
    const subsidy = draftPayroll([
      { id: 14, employeeId: 'e1' } as Partial<PayrollItem>,
    ]);
    subsidy.concept = 'subsidio';
    payrollRepo.findOne.mockResolvedValue(subsidy);

    await service.updateItems(10, 1, [
      {
        employeeId: 'e1',
        employeeName: 'Ana',
        baseSalary: 5000,
        socialSecurity: 500,
        taxWithholding: 300,
      },
    ]);

    // Prestación social exenta: ni CESS ni IIP, envíe lo que envíe el cliente.
    expect(savedItems[0].socialSecurity).toBe(0);
    expect(savedItems[0].taxWithholding).toBe(0);
  });
});
