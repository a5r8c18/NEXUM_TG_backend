import 'reflect-metadata';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UserRole } from '../entities/user.entity';
import { HrService } from './hr.service';
import { HrManagementService } from './hr-management.service';
import { HrReportService } from './hr-report.service';
import { PayrollController } from './payroll.controller';
import { HrController } from './hr.controller';
import {
  ContractsController,
  LeavesController,
} from './hr-management.controller';
import { HrReportController } from './hr-report.controller';
import { Employee } from '../entities/employee.entity';
import { LeaveRequest } from '../entities/leave-request.entity';

/**
 * Auditoría RRHH — puntos 2 y 3.
 *
 * Punto 2: los actos de administración (generar, procesar, pagar o anular
 * nóminas, aprobar licencias, dar de alta/baja fichas y consultar reportes
 * salariales) quedan reservados a SUPERADMIN/ADMIN mediante `@Roles` de
 * método, que el guard resuelve con getAllAndOverride por encima del de la
 * clase. La metadata es la misma que lee RolesGuard en ejecución.
 *
 * Punto 3: ni un trabajador ni una licencia con líneas de nómina pueden
 * borrarse físicamente — se perdería el saldo de apertura del submayor o la
 * referencia del control de doble pago.
 */
const ADMIN = [UserRole.SUPERADMIN, UserRole.ADMIN];

function rolesOf(target: object): UserRole[] | undefined {
  return Reflect.getMetadata('roles', target);
}

describe('Permisos de administración sobre RRHH y nómina', () => {
  it('toda la mutación de nóminas exige administrador', () => {
    for (const method of [
      'create',
      'generate',
      'generateVacations',
      'generateSubsidy',
      'generateVacationSettlement',
      'generateMaternity',
      'generateFree',
      'updateItems',
      'process',
      'markAsPaid',
      'cancel',
    ] as const) {
      expect(rolesOf(PayrollController.prototype[method])).toEqual(ADMIN);
    }
  });

  it('la consulta de nóminas queda abierta al rol de usuario', () => {
    // Sin metadata de método, el guard aplica el de la clase (los tres roles).
    expect(rolesOf(PayrollController.prototype.findAll)).toBeUndefined();
    expect(rolesOf(PayrollController)).toEqual([
      UserRole.SUPERADMIN,
      UserRole.ADMIN,
      UserRole.USER,
    ]);
  });

  it('aprobar o borrar una licencia exige administrador; solicitarla no', () => {
    expect(rolesOf(LeavesController.prototype.setStatus)).toEqual(ADMIN);
    expect(rolesOf(LeavesController.prototype.remove)).toEqual(ADMIN);
    expect(rolesOf(LeavesController.prototype.create)).toBeUndefined();
  });

  it('la gestión contractual exige administrador', () => {
    expect(rolesOf(ContractsController.prototype.create)).toEqual(ADMIN);
    expect(rolesOf(ContractsController.prototype.update)).toEqual(ADMIN);
    expect(rolesOf(ContractsController.prototype.remove)).toEqual(ADMIN);
  });

  it('altas, bajas y historial salarial del expediente exigen administrador', () => {
    expect(rolesOf(HrController.prototype.createEmployee)).toEqual(ADMIN);
    expect(rolesOf(HrController.prototype.updateEmployee)).toEqual(ADMIN);
    expect(rolesOf(HrController.prototype.deleteEmployee)).toEqual(ADMIN);
    expect(rolesOf(HrController.prototype.getSalaryHistory)).toEqual(ADMIN);
    expect(rolesOf(HrController.prototype.findAllEmployees)).toBeUndefined();
  });

  it('los reportes salariales no admiten el rol de usuario', () => {
    expect(rolesOf(HrReportController)).toEqual(ADMIN);
  });
});

describe('Protección del histórico de nómina', () => {
  const employee = {
    id: 'e1',
    companyId: 10,
    firstName: 'Ana',
    lastName: 'Pérez',
  } as Employee;

  function hrService(payrollItemRepo: any, employeeRepo: any) {
    return new HrService(
      employeeRepo,
      payrollItemRepo,
      {} as any,
      {} as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      {} as any,
    );
  }

  function hrManagement(payrollItemRepo: any, leaveRepo: any) {
    return new HrManagementService(
      {} as any,
      {} as any,
      leaveRepo,
      {} as any,
      payrollItemRepo,
      { vacationBalances: jest.fn() } as unknown as HrReportService,
    );
  }

  it('no borra un trabajador con líneas de nómina', async () => {
    const employeeRepo = {
      findOneBy: jest.fn().mockResolvedValue(employee),
      remove: jest.fn(),
    };
    const payrollItemRepo = { count: jest.fn().mockResolvedValue(3) };

    await expect(
      hrService(payrollItemRepo, employeeRepo).deleteEmployee(10, 'e1'),
    ).rejects.toThrow(ConflictException);
    expect(employeeRepo.remove).not.toHaveBeenCalled();
    expect(payrollItemRepo.count).toHaveBeenCalledWith({
      where: { companyId: 10, employeeId: 'e1' },
    });
  });

  it('borra un trabajador sin historial de nómina', async () => {
    const employeeRepo = {
      findOneBy: jest.fn().mockResolvedValue(employee),
      remove: jest.fn().mockResolvedValue(employee),
    };
    const payrollItemRepo = { count: jest.fn().mockResolvedValue(0) };

    await hrService(payrollItemRepo, employeeRepo).deleteEmployee(10, 'e1');
    expect(employeeRepo.remove).toHaveBeenCalledWith(employee);
  });

  it('no borra una licencia liquidada en nómina', async () => {
    const leave = {
      id: 'l1',
      companyId: 10,
      employeeName: 'Ana Pérez',
      settledUnits: 0,
    } as LeaveRequest;
    const leaveRepo = {
      findOneBy: jest.fn().mockResolvedValue(leave),
      remove: jest.fn(),
    };
    const payrollItemRepo = { count: jest.fn().mockResolvedValue(2) };

    await expect(
      hrManagement(payrollItemRepo, leaveRepo).deleteLeave(10, 'l1'),
    ).rejects.toThrow(ConflictException);
    expect(leaveRepo.remove).not.toHaveBeenCalled();
    expect(payrollItemRepo.count).toHaveBeenCalledWith({
      where: { companyId: 10, leaveRequestId: 'l1' },
    });
  });

  it('no borra una licencia con unidades liquidadas aunque falte la línea', async () => {
    const leave = {
      id: 'l1',
      companyId: 10,
      employeeName: 'Ana Pérez',
      settledUnits: 5,
    } as LeaveRequest;
    const leaveRepo = {
      findOneBy: jest.fn().mockResolvedValue(leave),
      remove: jest.fn(),
    };
    const payrollItemRepo = { count: jest.fn().mockResolvedValue(0) };

    await expect(
      hrManagement(payrollItemRepo, leaveRepo).deleteLeave(10, 'l1'),
    ).rejects.toThrow(ConflictException);
    expect(leaveRepo.remove).not.toHaveBeenCalled();
  });

  it('borra una licencia que nunca se retribuyó', async () => {
    const leave = {
      id: 'l1',
      companyId: 10,
      employeeName: 'Ana Pérez',
      settledUnits: 0,
    } as LeaveRequest;
    const leaveRepo = {
      findOneBy: jest.fn().mockResolvedValue(leave),
      remove: jest.fn().mockResolvedValue(leave),
    };
    const payrollItemRepo = { count: jest.fn().mockResolvedValue(0) };

    await hrManagement(payrollItemRepo, leaveRepo).deleteLeave(10, 'l1');
    expect(leaveRepo.remove).toHaveBeenCalledWith(leave);
  });

  it('sigue devolviendo 404 cuando la licencia no existe', async () => {
    const leaveRepo = { findOneBy: jest.fn().mockResolvedValue(null) };
    const payrollItemRepo = { count: jest.fn() };

    await expect(
      hrManagement(payrollItemRepo, leaveRepo).deleteLeave(10, 'l1'),
    ).rejects.toThrow(NotFoundException);
    expect(payrollItemRepo.count).not.toHaveBeenCalled();
  });
});
