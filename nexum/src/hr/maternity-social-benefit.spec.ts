import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PayrollConceptService } from './payroll-concept.service';
import { Payroll } from '../entities/payroll.entity';
import { PayrollItem } from '../entities/payroll-item.entity';
import { Employee } from '../entities/employee.entity';
import { Attendance } from '../entities/attendance.entity';
import { LeaveRequest } from '../entities/leave-request.entity';
import { HrReportService } from './hr-report.service';
import { MINIMUM_WAGE, SOCIAL_BENEFIT_RATE } from './payroll-concept';

jest.setTimeout(30000);

/**
 * Prestación social por maternidad (Art. 30.1 DL 56/2021, mod. DL 71/2023):
 * 60 % mensual desde el vencimiento de la posnatal hasta el primer año del
 * menor. Antes de este fix el cálculo existía pero nunca se invocaba.
 */
describe('PayrollConceptService — prestación social (installment 4)', () => {
  let service: PayrollConceptService;
  let leaveRepo: jest.Mocked<Repository<LeaveRequest>>;
  let employeeRepo: jest.Mocked<Repository<Employee>>;
  let payrollRepo: jest.Mocked<Repository<Payroll>>;
  let payrollItemRepo: jest.Mocked<Repository<PayrollItem>>;
  let savedItems: Partial<PayrollItem>[];

  const mother = {
    id: 'emp-mother',
    firstName: 'Ana',
    lastName: 'Pérez',
    documentId: '90010100001',
    salary: 10000,
    employmentSector: 'state',
  } as Employee;

  const father = {
    id: 'emp-father',
    firstName: 'Luis',
    lastName: 'Gómez',
    documentId: '85050500002',
    salary: 15000,
    employmentSector: 'state',
  } as Employee;

  function maternityLeave(over: Partial<LeaveRequest>): LeaveRequest {
    return {
      id: 'leave-1',
      companyId: 10,
      employeeId: mother.id,
      employeeName: 'Ana Pérez',
      type: 'maternity',
      status: 'approved',
      startDate: '2026-01-05', // inicio de la prenatal
      endDate: '2026-04-12', // fin de la posnatal
      birthDate: '2026-02-16',
      ...over,
    } as LeaveRequest;
  }

  const employees: Record<string, Employee> = {
    'emp-mother': mother,
    'emp-father': father,
  };
  const averages: Record<string, number> = {
    'emp-mother': 10000,
    'emp-father': 15000,
  };

  let settledRows: any[];

  /** Cadena de query builder: getRawMany devuelve lo ya liquidado. */
  function qbStub() {
    const qb: any = {};
    for (const m of [
      'innerJoin',
      'select',
      'addSelect',
      'where',
      'andWhere',
      'groupBy',
      'addGroupBy',
      'setLock',
    ]) {
      qb[m] = jest.fn().mockReturnValue(qb);
    }
    qb.getMany = jest.fn().mockResolvedValue([]);
    qb.getRawMany = jest.fn().mockImplementation(() =>
      Promise.resolve(settledRows),
    );
    return qb;
  }

  beforeEach(async () => {
    savedItems = [];
    settledRows = [];

    leaveRepo = {
      find: jest.fn(),
      increment: jest.fn(),
      createQueryBuilder: jest.fn().mockImplementation(() => qbStub()),
    } as any;
    employeeRepo = {
      findOne: jest
        .fn()
        .mockImplementation(({ where }: any) =>
          Promise.resolve(employees[where.id] || null),
        ),
    } as any;
    payrollItemRepo = {
      save: jest
        .fn()
        .mockImplementation((item: any) => {
          savedItems.push(item);
          return Promise.resolve(item);
        }),
      createQueryBuilder: jest.fn().mockImplementation(() => qbStub()),
    } as any;

    let payrollId = 0;
    payrollRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((p: any) => {
        payrollId += 1;
        return Promise.resolve({ ...p, id: payrollId });
      }),
      // La generación guarda dentro de una transacción: el mock la ejecuta
      // directo y devuelve los mismos repositorios por entidad.
      manager: {
        transaction: jest.fn().mockImplementation(async (cb: any) => {
          const em = {
            getRepository: (e: any) =>
              e === Payroll
                ? payrollRepo
                : e === PayrollItem
                  ? payrollItemRepo
                  : e === LeaveRequest
                    ? leaveRepo
                    : ({} as any),
          };
          return cb(em);
        }),
      },
    } as any;
    payrollRepo.findOne.mockImplementation((({ where }: any) => {
      if (where?.id) {
        return Promise.resolve({ id: where.id, items: savedItems });
      }
      return Promise.resolve(null); // ensureUnique
    }) as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollConceptService,
        { provide: getRepositoryToken(Payroll), useValue: payrollRepo },
        { provide: getRepositoryToken(PayrollItem), useValue: payrollItemRepo },
        { provide: getRepositoryToken(Employee), useValue: employeeRepo },
        { provide: getRepositoryToken(Attendance), useValue: {} },
        { provide: getRepositoryToken(LeaveRequest), useValue: leaveRepo },
        { provide: HrReportService, useValue: {} },
      ],
    }).compile();

    service = module.get<PayrollConceptService>(PayrollConceptService);

    // Base salarial controlada por trabajador; se espía además la fecha de
    // referencia para verificar la ventana de 12 meses que pide la norma.
    jest
      .spyOn(service as any, 'averageMonthlySalary')
      .mockImplementation((_c: number, employeeId: string) =>
        Promise.resolve({
          average: averages[employeeId] || 0,
          monthsWithHistory: 12,
        }),
      );
  });

  const period = {
    period: '2026-05',
    startDate: '2026-05-01',
    endDate: '2026-05-31',
    installment: 4,
  };

  it('variante a: paga a la madre el 60 % de su base de cálculo', async () => {
    leaveRepo.find.mockResolvedValue([maternityLeave({ socialBenefitVariant: 'a' })]);

    await service.generateMaternity(10, period);

    expect(savedItems).toHaveLength(1);
    const item = savedItems[0];
    expect(item.employeeId).toBe(mother.id);
    // Período completo dentro de la ventana: 31/31 días × 6000 mensual.
    expect(item.netSalary).toBe(10000 * SOCIAL_BENEFIT_RATE);
    expect(item.appliedRate).toBe(SOCIAL_BENEFIT_RATE);
    expect(item.paidUnits).toBe(31);
    expect(item.leaveRequestId).toBe('leave-1');
    // La base es la prestación económica de la madre: 12 meses antes de la licencia.
    expect(service['averageMonthlySalary']).toHaveBeenCalledWith(
      10,
      mother.id,
      '2026-01-05',
    );
  });

  it('variante c: paga al padre sobre SU salario, 12 meses antes del parto', async () => {
    leaveRepo.find.mockResolvedValue([
      maternityLeave({
        socialBenefitVariant: 'c',
        beneficiaryEmployeeId: father.id,
      }),
    ]);

    await service.generateMaternity(10, period);

    expect(savedItems).toHaveLength(1);
    const item = savedItems[0];
    expect(item.employeeId).toBe(father.id);
    expect(item.netSalary).toBe(15000 * SOCIAL_BENEFIT_RATE);
    // Art. 30.1.c: base = lo percibido por el padre en los 12 meses anteriores
    // al nacimiento del menor, no al inicio de la licencia.
    expect(service['averageMonthlySalary']).toHaveBeenCalledWith(
      10,
      father.id,
      '2026-02-16',
    );
  });

  it('eleva la cuantía al salario mínimo cuando el 60 % queda por debajo (Art. 9)', async () => {
    averages['emp-mother'] = 4000; // 60 % = 2400 < 3210
    leaveRepo.find.mockResolvedValue([maternityLeave({ socialBenefitVariant: 'a' })]);

    await service.generateMaternity(10, period);

    expect(savedItems[0].netSalary).toBe(MINIMUM_WAGE);
  });

  it('variante b: no acumula vacaciones por la prestación (la madre trabaja)', async () => {
    leaveRepo.find.mockResolvedValue([maternityLeave({ socialBenefitVariant: 'b' })]);

    await service.generateMaternity(10, period);

    expect(savedItems[0].employeeId).toBe(mother.id);
    expect(savedItems[0].vacationProvision || 0).toBe(0);
  });

  it('variante a: el tiempo de prestación cuenta como servicio y provisiona', async () => {
    leaveRepo.find.mockResolvedValue([maternityLeave({ socialBenefitVariant: 'a' })]);

    await service.generateMaternity(10, period);

    expect(Number(savedItems[0].vacationProvision)).toBeGreaterThan(0);
  });

  it('ignora licencias sin variante o fuera de la ventana de prestación', async () => {
    leaveRepo.find.mockResolvedValue([
      maternityLeave({ id: 'sin-variante', socialBenefitVariant: null }),
      // El menor ya cumplió un año antes del período.
      maternityLeave({
        id: 'vencida',
        socialBenefitVariant: 'a',
        birthDate: '2025-02-16',
        endDate: '2025-04-12',
      }),
    ]);

    await expect(service.generateMaternity(10, period)).rejects.toThrow(
      BadRequestException,
    );
    expect(savedItems).toHaveLength(0);
  });

  it('exige fecha de parto para fijar el primer año del menor', async () => {
    leaveRepo.find.mockResolvedValue([
      maternityLeave({ socialBenefitVariant: 'a', birthDate: null }),
    ]);

    await expect(service.generateMaternity(10, period)).rejects.toThrow(
      /sin fecha de parto/i,
    );
  });

  it('la variante c exige beneficiario registrado', async () => {
    leaveRepo.find.mockResolvedValue([
      maternityLeave({ socialBenefitVariant: 'c', beneficiaryEmployeeId: null }),
    ]);

    await expect(service.generateMaternity(10, period)).rejects.toThrow(
      /variante c exige el beneficiario/i,
    );
  });

  it('rechaza plazos fuera de 1-4', async () => {
    await expect(
      service.generateMaternity(10, { ...period, installment: 5 }),
    ).rejects.toThrow(BadRequestException);
  });

  // ── Fix 5: el mismo mes de prestación no se paga dos veces ──

  it('no repite la prestación sobre un rango ya liquidado', async () => {
    leaveRepo.find.mockResolvedValue([
      maternityLeave({ socialBenefitVariant: 'a' }),
    ]);
    // Una nómina anterior ya pagó mayo para esta licencia.
    settledRows = [
      {
        leaveId: 'leave-1',
        installment: 4,
        pStart: '2026-05-01',
        pEnd: '2026-05-31',
        days: '31',
        amount: '6000',
      },
    ];

    await expect(service.generateMaternity(10, period)).rejects.toThrow(
      /ya fue liquidada/i,
    );
    expect(savedItems).toHaveLength(0);
  });

  it('el mes siguiente sí genera: rangos disjuntos no son duplicados', async () => {
    leaveRepo.find.mockResolvedValue([
      maternityLeave({ socialBenefitVariant: 'a' }),
    ]);
    settledRows = [
      {
        leaveId: 'leave-1',
        installment: 4,
        pStart: '2026-05-01',
        pEnd: '2026-05-31',
        days: '31',
        amount: '6000',
      },
    ];

    await service.generateMaternity(10, {
      ...period,
      period: '2026-06',
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });

    expect(savedItems).toHaveLength(1);
    expect(savedItems[0].paidUnits).toBe(30);
  });
});
