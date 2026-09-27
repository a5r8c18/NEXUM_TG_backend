import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException } from '@nestjs/common';
import { HrManagementService } from './hr-management.service';
import { HrReportService } from './hr-report.service';
import { EmployeeContract } from '../entities/employee-contract.entity';
import { Attendance } from '../entities/attendance.entity';
import { LeaveRequest } from '../entities/leave-request.entity';
import { JobPosition } from '../entities/job-position.entity';

/**
 * Una licencia de vacaciones solo puede aprobarse si el trabajador tiene
 * devengado en el submayor lo que va a disfrutar (Art. 102 Ley 116). No se
 * exige el año completo: puede salir por cualquiera de los períodos del
 * Art. 105 —30, 20, 15, 10 o 7 días— siempre que los tenga acumulados.
 *
 * El exceso solo se admite marcado como adelanto de vacaciones, que es lo que
 * deja la provisión 492 en débito y el submayor en negativo.
 */
describe('HrManagementService.setLeaveStatus() — saldo de vacaciones', () => {
  let service: HrManagementService;
  let leaveRepo: { findOneBy: jest.Mock; save: jest.Mock };
  let vacationBalances: jest.Mock;

  /** Licencia del 6 al 17 de julio de 2026: 10 días laborables. */
  function leave(overrides: Partial<LeaveRequest> = {}): LeaveRequest {
    return {
      id: 'l1',
      companyId: 10,
      employeeId: 'e1',
      employeeName: 'Ana Pérez',
      type: 'vacation',
      startDate: '2026-07-06',
      endDate: '2026-07-17',
      days: 12,
      status: 'pending',
      advanceAuthorized: false,
      ...overrides,
    } as LeaveRequest;
  }

  beforeEach(async () => {
    leaveRepo = {
      findOneBy: jest.fn(),
      save: jest.fn().mockImplementation((l) => Promise.resolve(l)),
    };
    vacationBalances = jest.fn().mockResolvedValue(new Map());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HrManagementService,
        { provide: getRepositoryToken(EmployeeContract), useValue: {} },
        { provide: getRepositoryToken(Attendance), useValue: {} },
        { provide: getRepositoryToken(LeaveRequest), useValue: leaveRepo },
        { provide: getRepositoryToken(JobPosition), useValue: {} },
        { provide: HrReportService, useValue: { vacationBalances } },
      ],
    }).compile();

    service = module.get(HrManagementService);
  });

  it('aprueba cuando el saldo acumulado cubre los días solicitados', async () => {
    leaveRepo.findOneBy.mockResolvedValue(leave());
    vacationBalances.mockResolvedValue(
      new Map([['e1', { days: 12, amount: 2500 }]]),
    );

    const saved = await service.setLeaveStatus(10, 'l1', 'approved', 'Admin');

    expect(saved.status).toBe('approved');
    expect(saved.advanceAuthorized).toBe(false);
  });

  it('rechaza cuando los días solicitados exceden el acumulado', async () => {
    leaveRepo.findOneBy.mockResolvedValue(leave());
    vacationBalances.mockResolvedValue(
      new Map([['e1', { days: 4, amount: 800 }]]),
    );

    await expect(
      service.setLeaveStatus(10, 'l1', 'approved', 'Admin'),
    ).rejects.toThrow(ConflictException);
    expect(leaveRepo.save).not.toHaveBeenCalled();
  });

  it('rechaza al trabajador sin ningún acumulado', async () => {
    leaveRepo.findOneBy.mockResolvedValue(leave());

    await expect(
      service.setLeaveStatus(10, 'l1', 'approved', 'Admin'),
    ).rejects.toThrow(/no tiene vacaciones suficientes acumuladas/);
  });

  it('permite un período corto del Art. 105 con acumulado parcial', async () => {
    // 13 al 17 de julio: 5 días laborables, cubiertos por 6 devengados.
    leaveRepo.findOneBy.mockResolvedValue(
      leave({ startDate: '2026-07-13', endDate: '2026-07-17', days: 5 }),
    );
    vacationBalances.mockResolvedValue(
      new Map([['e1', { days: 6, amount: 1200 }]]),
    );

    const saved = await service.setLeaveStatus(10, 'l1', 'approved', 'Admin');

    expect(saved.status).toBe('approved');
  });

  it('aprueba el exceso cuando se autoriza como adelanto y lo registra', async () => {
    leaveRepo.findOneBy.mockResolvedValue(leave());
    vacationBalances.mockResolvedValue(
      new Map([['e1', { days: 4, amount: 800 }]]),
    );

    const saved = await service.setLeaveStatus(
      10,
      'l1',
      'approved',
      'Admin',
      true,
    );

    expect(saved.status).toBe('approved');
    expect(saved.advanceAuthorized).toBe(true);
  });

  it('usa el saldo del mes en que comienza el disfrute', async () => {
    leaveRepo.findOneBy.mockResolvedValue(leave());
    vacationBalances.mockResolvedValue(
      new Map([['e1', { days: 12, amount: 2500 }]]),
    );

    await service.setLeaveStatus(10, 'l1', 'approved', 'Admin');

    expect(vacationBalances).toHaveBeenCalledWith(10, '2026-07');
  });

  it('no valida saldo en licencias que no son de vacaciones', async () => {
    leaveRepo.findOneBy.mockResolvedValue(leave({ type: 'sick' }));

    const saved = await service.setLeaveStatus(10, 'l1', 'approved', 'Admin');

    expect(saved.status).toBe('approved');
    expect(vacationBalances).not.toHaveBeenCalled();
  });

  it('no valida saldo al rechazar o cancelar', async () => {
    leaveRepo.findOneBy.mockResolvedValue(leave());

    const saved = await service.setLeaveStatus(10, 'l1', 'rejected');

    expect(saved.status).toBe('rejected');
    expect(vacationBalances).not.toHaveBeenCalled();
  });
});
