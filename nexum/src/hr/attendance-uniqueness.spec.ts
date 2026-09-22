import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ValidationPipe } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HrManagementService } from './hr-management.service';
import { HrService } from './hr.service';
import { EmployeeContract } from '../entities/employee-contract.entity';
import { Attendance } from '../entities/attendance.entity';
import { LeaveRequest } from '../entities/leave-request.entity';
import { JobPosition } from '../entities/job-position.entity';
import { Employee } from '../entities/employee.entity';
import { Department } from '../entities/department.entity';
import { CostCenter } from '../entities/cost-center.entity';
import { EmployeeSalaryHistory } from '../entities/employee-salary-history.entity';
import { CreateAttendanceDto } from './dto/attendance.dto';

jest.setTimeout(30000);

/**
 * Fix 11 — unicidad de partes de asistencia y de códigos de trabajador, y
 * tope de horas extra. Sin ellos, un parte duplicado duplicaba las horas
 * extra en la nómina y un código repetido rompía la acreditación bancaria.
 */
describe('HrManagementService — unicidad de asistencia', () => {
  let service: HrManagementService;
  let attendanceRepo: jest.Mocked<Repository<Attendance>>;

  beforeEach(async () => {
    attendanceRepo = {
      findOneBy: jest.fn(),
      create: jest.fn().mockImplementation((a: any) => a),
      save: jest.fn().mockImplementation((a: any) => Promise.resolve(a)),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HrManagementService,
        { provide: getRepositoryToken(EmployeeContract), useValue: {} },
        { provide: getRepositoryToken(Attendance), useValue: attendanceRepo },
        { provide: getRepositoryToken(LeaveRequest), useValue: {} },
        { provide: getRepositoryToken(JobPosition), useValue: {} },
      ],
    }).compile();

    service = module.get<HrManagementService>(HrManagementService);
  });

  const payload = {
    employeeId: 'e1',
    date: '2026-05-10',
    status: 'present' as const,
    hoursWorked: 8,
    overtimeHours: 2,
  };

  it('rechaza un segundo parte del mismo trabajador el mismo día', async () => {
    attendanceRepo.findOneBy.mockResolvedValue({
      id: 'prev',
      ...payload,
    } as Attendance);

    await expect(service.createAttendance(10, payload)).rejects.toThrow(
      ConflictException,
    );
    expect(attendanceRepo.save).not.toHaveBeenCalled();
  });

  it('permite el parte cuando el día está libre', async () => {
    attendanceRepo.findOneBy.mockResolvedValue(null);

    await service.createAttendance(10, payload);

    expect(attendanceRepo.save).toHaveBeenCalled();
  });

  it('al editar, rechaza mover el parte a un día ya ocupado', async () => {
    const existing = { id: 'a1', companyId: 10, employeeId: 'e1', date: '2026-05-10' } as Attendance;
    attendanceRepo.findOneBy
      // Primera llamada: el parte que se edita.
      .mockResolvedValueOnce(existing)
      // Segunda: el conflicto en la fecha destino.
      .mockResolvedValueOnce({ id: 'a2', companyId: 10, employeeId: 'e1', date: '2026-05-11' } as Attendance);

    await expect(
      service.updateAttendance(10, 'a1', { date: '2026-05-11' }),
    ).rejects.toThrow(ConflictException);
  });

  it('al editar sin cambiar trabajador ni fecha no hay conflicto', async () => {
    const existing = { id: 'a1', companyId: 10, employeeId: 'e1', date: '2026-05-10' } as Attendance;
    attendanceRepo.findOneBy.mockResolvedValue(existing);

    await service.updateAttendance(10, 'a1', { overtimeHours: 3 });

    expect(attendanceRepo.save).toHaveBeenCalled();
  });
});

describe('HrService — unicidad del código de trabajador', () => {
  let service: HrService;
  let employeeRepo: jest.Mocked<Repository<Employee>>;

  beforeEach(async () => {
    employeeRepo = {
      findOneBy: jest.fn(),
      create: jest.fn().mockImplementation((e: any) => e),
      save: jest.fn().mockImplementation((e: any) => Promise.resolve(e)),
      createQueryBuilder: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HrService,
        { provide: getRepositoryToken(Employee), useValue: employeeRepo },
        { provide: getRepositoryToken(Department), useValue: {} },
        { provide: getRepositoryToken(CostCenter), useValue: {} },
        { provide: getRepositoryToken(JobPosition), useValue: {} },
        { provide: getRepositoryToken(EmployeeSalaryHistory), useValue: {} },
      ],
    }).compile();

    service = module.get<HrService>(HrService);
  });

  it('rechaza un código ya asignado a otro trabajador', async () => {
    employeeRepo.findOneBy.mockResolvedValue({ id: 'otro', employeeCode: 'EMP-0001' } as Employee);

    await expect(
      service.createEmployee(10, {
        employeeCode: 'EMP-0001',
        firstName: 'Ana',
        lastName: 'Pérez',
      } as Partial<Employee>),
    ).rejects.toThrow(ConflictException);
    expect(employeeRepo.save).not.toHaveBeenCalled();
  });

  it('autogenera el código desde el mayor sufijo, no desde el conteo', async () => {
    // Sin el sufijo máximo, borrar el último trabajador reutilizaba su código.
    const qb: any = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        { code: 'EMP-0003' },
        { code: 'EMP-0010' },
        { code: 'OTRO-7' },
      ]),
    };
    employeeRepo.createQueryBuilder.mockReturnValue(qb);
    employeeRepo.findOneBy.mockResolvedValue(null);

    await service.createEmployee(10, {
      firstName: 'Ana',
      lastName: 'Pérez',
    } as Partial<Employee>);

    expect(employeeRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ employeeCode: 'EMP-0011' }),
    );
  });

  it('al editar permite conservar el propio código', async () => {
    const emp = { id: 'e1', companyId: 10, employeeCode: 'EMP-0001' } as Employee;
    employeeRepo.findOneBy
      .mockResolvedValueOnce(emp) // findOneEmployee
      .mockResolvedValueOnce(emp); // ensureEmployeeCodeUnique (mismo id)

    await service.updateEmployee(10, 'e1', { employeeCode: 'EMP-0001' });

    expect(employeeRepo.save).toHaveBeenCalled();
  });
});

describe('AttendanceDto — tope de horas extra', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });

  const base = {
    employeeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    date: '2026-05-10',
  };

  it('acepta un parte dentro del tope diario', async () => {
    const result = await pipe.transform(
      { ...base, overtimeHours: 8, hoursWorked: 16 },
      { type: 'body', metatype: CreateAttendanceDto as any },
    );
    expect(result).toBeInstanceOf(CreateAttendanceDto);
  });

  it('rechaza horas extra imposibles de registrar en un día', async () => {
    await expect(
      pipe.transform(
        { ...base, overtimeHours: 500 },
        { type: 'body', metatype: CreateAttendanceDto as any },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza horas trabajadas por encima del día físico', async () => {
    await expect(
      pipe.transform(
        { ...base, hoursWorked: 30 },
        { type: 'body', metatype: CreateAttendanceDto as any },
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
