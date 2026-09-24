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
import { overlapWorkingDays } from './payroll-calculations';

jest.setTimeout(30000);

/**
 * Fix 5 — una licencia no se paga dos veces.
 *
 * La unicidad por concepto+período no bastaba: la misma licencia podía
 * entrar en nóminas de períodos distintos cuyos rangos de fechas se
 * solapaban, o en dos generaciones concurrentes que veían lo mismo antes de
 * escribir. Ahora la generación bloquea la licencia dentro de la
 * transacción y reverifica lo ya liquidado antes de insertar.
 */
describe('PayrollConceptService — doble pago de licencias', () => {
  let service: PayrollConceptService;
  let leaveRepo: jest.Mocked<Repository<LeaveRequest>>;
  let employeeRepo: jest.Mocked<Repository<Employee>>;
  let payrollRepo: jest.Mocked<Repository<Payroll>>;
  let payrollItemRepo: jest.Mocked<Repository<PayrollItem>>;
  let savedItems: Partial<PayrollItem>[];
  let savedPayrolls: any[];
  // Cola de resultados de getRawMany: los generadores consultan primero lo
  // acumulado fiscal o lo liquidado (pre-flight) y luego reverifican dentro
  // de la transacción; el orden de consumo lo define cada test.
  let rawManyQueue: any[][];

  const emp = {
    id: 'emp-1',
    firstName: 'Ana',
    lastName: 'Pérez',
    documentId: '90010100001',
    salary: 5000,
    employmentSector: 'state',
  } as Employee;

  function leave(over: Partial<LeaveRequest>): LeaveRequest {
    return {
      id: 'lv-1',
      companyId: 10,
      employeeId: emp.id,
      employeeName: 'Ana Pérez',
      type: 'vacation',
      status: 'approved',
      startDate: '2026-07-01',
      endDate: '2026-07-30',
      days: 30,
      ...over,
    } as LeaveRequest;
  }

  const settledRow = (over: Record<string, any>) => ({
    leaveId: 'lv-1',
    installment: null,
    pStart: '2026-07-01',
    pEnd: '2026-07-31',
    days: '22',
    amount: '4600',
    ...over,
  });

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
    qb.getRawMany = jest
      .fn()
      .mockImplementation(() => Promise.resolve(rawManyQueue.shift() ?? []));
    return qb;
  }

  beforeEach(async () => {
    savedItems = [];
    savedPayrolls = [];
    rawManyQueue = [];

    leaveRepo = {
      find: jest.fn(),
      increment: jest.fn(),
      createQueryBuilder: jest.fn().mockImplementation(() => qbStub()),
    } as any;
    employeeRepo = {
      findOne: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(where.id === emp.id ? emp : null),
      ),
    } as any;
    payrollItemRepo = {
      save: jest.fn().mockImplementation((item: any) => {
        savedItems.push(item);
        return Promise.resolve(item);
      }),
      createQueryBuilder: jest.fn().mockImplementation(() => qbStub()),
    } as any;

    let payrollId = 0;
    payrollRepo = {
      findOne: jest
        .fn()
        .mockImplementation(({ where }: any) =>
          Promise.resolve(
            where?.id ? { id: where.id, items: savedItems } : null,
          ),
        ),
      save: jest.fn().mockImplementation((p: any) => {
        payrollId += 1;
        savedPayrolls.push({ ...p, id: payrollId });
        return Promise.resolve({ ...p, id: payrollId });
      }),
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollConceptService,
        { provide: getRepositoryToken(Payroll), useValue: payrollRepo },
        { provide: getRepositoryToken(PayrollItem), useValue: payrollItemRepo },
        { provide: getRepositoryToken(Employee), useValue: employeeRepo },
        { provide: getRepositoryToken(Attendance), useValue: { find: jest.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(LeaveRequest), useValue: leaveRepo },
        {
          provide: HrReportService,
          useValue: {
            vacationBalances: jest.fn().mockResolvedValue(new Map()),
          },
        },
      ],
    }).compile();

    service = module.get<PayrollConceptService>(PayrollConceptService);
    jest
      .spyOn(service as any, 'averageMonthlySalary')
      .mockResolvedValue({ average: 5000, monthsWithHistory: 12 });
  });

  const july = {
    period: '2026-07',
    startDate: '2026-07-01',
    endDate: '2026-07-31',
  };

  it('vacaciones: rechaza regenerar un rango ya liquidado', async () => {
    leaveRepo.find.mockResolvedValue([leave({})]);
    // monthlyTaxableTotals | settledLeaveRows pre-flight
    rawManyQueue = [[], [settledRow({})]];

    await expect(service.generateVacations(10, july)).rejects.toThrow(
      /rango solapado/i,
    );
    expect(savedPayrolls).toHaveLength(0);
    expect(savedItems).toHaveLength(0);
  });

  it('vacaciones: una nómina cancelada no bloquea la regeneración', async () => {
    leaveRepo.find.mockResolvedValue([leave({})]);
    // La query excluye status='cancelled', así que no hay filas liquidadas.
    rawManyQueue = [[], [], []];

    await service.generateVacations(10, july);

    expect(savedItems).toHaveLength(1);
    expect(savedItems[0].leaveRequestId).toBe('lv-1');
  });

  it('vacaciones: de una licencia a medio pagar solo paga los días restantes', async () => {
    // Licencia 15 jul – 14 ago; julio ya se pagó en su nómina (rango
    // disjunto) y agosto debe pagar solo lo que falta.
    const split = leave({
      startDate: '2026-07-15',
      endDate: '2026-08-14',
      days: 31,
    });
    leaveRepo.find.mockResolvedValue([split]);
    const paidInJuly = overlapWorkingDays(
      '2026-07-15',
      '2026-08-14',
      '2026-07-15',
      '2026-07-31',
    );
    const august = {
      period: '2026-08',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    };
    rawManyQueue = [
      [],
      [settledRow({ pStart: '2026-07-15', pEnd: '2026-07-31', days: String(paidInJuly) })],
      // Reverificación dentro de la transacción.
      [settledRow({ pStart: '2026-07-15', pEnd: '2026-07-31', days: String(paidInJuly) })],
    ];

    await service.generateVacations(10, august);

    const totalWorkingDays = overlapWorkingDays(
      '2026-07-15',
      '2026-08-14',
      '2026-07-15',
      '2026-08-14',
    );
    expect(savedItems).toHaveLength(1);
    expect(savedItems[0].paidUnits).toBe(
      Math.min(
        overlapWorkingDays('2026-07-15', '2026-08-14', '2026-08-01', '2026-08-31'),
        totalWorkingDays - paidInJuly,
      ),
    );
    // El contador de la licencia se incrementa dentro de la transacción.
    expect(leaveRepo.increment).toHaveBeenCalledWith(
      { id: 'lv-1' },
      'settledUnits',
      savedItems[0].paidUnits,
    );
  });

  it('subsidio: rechaza una licencia ya cubierta por un rango solapado', async () => {
    leaveRepo.find.mockResolvedValue([
      leave({
        type: 'sick',
        medicalCertificate: 'CERT-1',
        origin: 'common',
      }),
    ]);
    // settledLeaveRows pre-flight: ya pagada en julio.
    rawManyQueue = [[settledRow({})]];

    await expect(service.generateSubsidy(10, july)).rejects.toThrow(
      /rango solapado/i,
    );
    expect(savedItems).toHaveLength(0);
  });

  it('maternidad: el plazo ya pagado se salta y el siguiente sí genera', async () => {
    const maternity = leave({
      type: 'maternity',
      startDate: '2026-01-05',
      endDate: '2026-04-12',
      birthDate: '2026-02-16',
    });
    leaveRepo.find.mockResolvedValue([maternity]);
    const input = { ...july, period: '2026-02', startDate: '2026-02-01', endDate: '2026-02-28' };

    // Plazo 2 ya liquidado → se salta y no queda nada que generar.
    rawManyQueue = [[settledRow({ installment: 2 })]];
    await expect(
      service.generateMaternity(10, { ...input, installment: 2 }),
    ).rejects.toThrow(/ya fue liquidado/i);
    expect(savedItems).toHaveLength(0);

    // Plazo 3 no está liquidado → genera normalmente.
    rawManyQueue = [[settledRow({ installment: 2 })], [settledRow({ installment: 2 })]];
    await service.generateMaternity(10, { ...input, installment: 3 });
    expect(savedItems).toHaveLength(1);
    expect(savedItems[0].paidUnits).toBe(6); // 6 semanas del plazo 3
  });

  it('concurrencia: la reverificación dentro de la transacción frena el duplicado', async () => {
    leaveRepo.find.mockResolvedValue([leave({})]);
    // Pre-flight no ve nada (la otra generación aún no confirmó); dentro de
    // la transacción la fila ya aparece liquidada → rollback completo.
    rawManyQueue = [[], [], [settledRow({})]];

    await expect(service.generateVacations(10, july)).rejects.toThrow(
      /ya fue liquidada/i,
    );
    expect(savedPayrolls).toHaveLength(0);
    expect(savedItems).toHaveLength(0);
    // El bloqueo pesimista se pidió sobre la licencia.
    expect(leaveRepo.createQueryBuilder).toHaveBeenCalled();
  });
});
