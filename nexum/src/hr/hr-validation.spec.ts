import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreatePayrollDto, GenerateMaternityDto } from './dto/create-payroll.dto';
import { CreateEmployeeDto } from './dto/employee.dto';
import { CreatePositionDto } from './dto/position.dto';
import { CreateContractDto } from './dto/contract.dto';
import { CreateAttendanceDto } from './dto/attendance.dto';
import { CreateLeaveDto, SetLeaveStatusDto } from './dto/leave.dto';

describe('HR DTO validation (ValidationPipe)', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: false,
  });

  async function transform<T>(metatype: new () => T, value: unknown) {
    return pipe.transform(value, { type: 'body', metatype: metatype as any });
  }

  const validLineItem = {
    employeeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    employeeName: 'Juan Pérez',
    employeeDocument: '12345678901',
    position: 'Contador',
    baseSalary: 5000,
    overtimeHours: 0,
    overtimePay: 0,
    bonuses: 0,
    commissions: 0,
    allowances: 0,
    socialSecurity: 0,
    healthInsurance: 0,
    pension: 0,
    taxWithholding: 0,
    otherDeductions: 0,
  };

  it('accepts a valid CreatePayrollDto and strips unknown fields', async () => {
    const payload = {
      period: '2026-07',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      processedBy: 'admin',
      extraField: 'should be removed',
      items: [validLineItem],
    };

    const result = await transform(CreatePayrollDto, payload);
    expect(result).toBeInstanceOf(CreatePayrollDto);
    expect((result as any).extraField).toBeUndefined();
    expect(result.items[0]).toBeInstanceOf(Object);
    expect(result.items[0].employeeId).toBe('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
  });

  it('rejects CreatePayrollDto with missing required processedBy', async () => {
    const payload = {
      period: '2026-07',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      items: [validLineItem],
    };

    await expect(transform(CreatePayrollDto, payload)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects CreatePayrollDto with negative gross salary', async () => {
    const payload = {
      period: '2026-07',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      processedBy: 'admin',
      items: [
        {
          ...validLineItem,
          baseSalary: -100,
        },
      ],
    };

    await expect(transform(CreatePayrollDto, payload)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('accepts a valid GenerateMaternityDto', async () => {
    const payload = {
      period: '2026-07',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      installment: 1,
    };

    const result = await transform(GenerateMaternityDto, payload);
    expect(result).toBeInstanceOf(GenerateMaternityDto);
    expect(result.installment).toBe(1);
  });

  it('rejects GenerateMaternityDto with installment out of range', async () => {
    const payload = {
      period: '2026-07',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      installment: 5,
    };

    await expect(transform(GenerateMaternityDto, payload)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('accepts a valid CreateEmployeeDto', async () => {
    const payload = {
      firstName: 'Juan',
      lastName: 'Pérez',
      salary: 5000,
      occupationalCategory: '0020',
      unionMember: false,
    };

    const result = await transform(CreateEmployeeDto, payload);
    expect(result).toBeInstanceOf(CreateEmployeeDto);
    expect(result.firstName).toBe('Juan');
  });

  it('rejects CreateEmployeeDto without firstName and lastName', async () => {
    const payload = {
      salary: 5000,
    };

    await expect(transform(CreateEmployeeDto, payload)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects CreateEmployeeDto with invalid occupationalCategory', async () => {
    const payload = {
      firstName: 'Juan',
      lastName: 'Pérez',
      occupationalCategory: '0099',
    };

    await expect(transform(CreateEmployeeDto, payload)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('accepts a valid CreatePositionDto', async () => {
    const payload = {
      name: 'Contador',
      baseSalary: 6000,
      timeUnit: 'hours',
      approvedCount: 3,
    };

    const result = await transform(CreatePositionDto, payload);
    expect(result).toBeInstanceOf(CreatePositionDto);
    expect(result.name).toBe('Contador');
  });

  it('rejects CreatePositionDto without name', async () => {
    const payload = { baseSalary: 6000 };

    await expect(transform(CreatePositionDto, payload)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('accepts a valid CreateContractDto', async () => {
    const payload = {
      employeeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      startDate: '2026-07-01',
      salary: 5000,
    };

    const result = await transform(CreateContractDto, payload);
    expect(result).toBeInstanceOf(CreateContractDto);
    expect(result.employeeId).toBe('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
  });

  it('rejects CreateContractDto without employeeId', async () => {
    const payload = {
      startDate: '2026-07-01',
    };

    await expect(transform(CreateContractDto, payload)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('accepts contractType/contractTerm within the Ley 116 taxonomy', async () => {
    const payload = {
      employeeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      startDate: '2026-07-01',
      contractType: 'work_execution',
      contractTerm: 'determinate',
    };

    const result = await transform(CreateContractDto, payload);
    expect(result.contractType).toBe('work_execution');
    expect(result.contractTerm).toBe('determinate');
  });

  it('rejects the legacy foreign contractType values', async () => {
    for (const contractType of ['full_time', 'part_time', 'contractor', 'intern']) {
      await expect(
        transform(CreateContractDto, {
          employeeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          startDate: '2026-07-01',
          contractType,
        }),
      ).rejects.toThrow(BadRequestException);
    }
  });

  it('rejects an invalid contractTerm', async () => {
    await expect(
      transform(CreateContractDto, {
        employeeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        startDate: '2026-07-01',
        contractTerm: 'permanent',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects legacy contractType on CreateEmployeeDto too', async () => {
    await expect(
      transform(CreateEmployeeDto, {
        firstName: 'Juan',
        lastName: 'Pérez',
        contractType: 'full_time',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts a valid CreateAttendanceDto', async () => {
    const payload = {
      employeeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      date: '2026-07-01',
      status: 'present',
      overtimeHours: 2,
    };

    const result = await transform(CreateAttendanceDto, payload);
    expect(result).toBeInstanceOf(CreateAttendanceDto);
    expect(result.status).toBe('present');
  });

  it('rejects CreateAttendanceDto with negative overtimeHours', async () => {
    const payload = {
      employeeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      date: '2026-07-01',
      overtimeHours: -1,
    };

    await expect(transform(CreateAttendanceDto, payload)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('accepts a valid CreateLeaveDto', async () => {
    const payload = {
      employeeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      type: 'vacation',
      startDate: '2026-07-01',
      endDate: '2026-07-15',
      reason: 'Descanso anual',
    };

    const result = await transform(CreateLeaveDto, payload);
    expect(result).toBeInstanceOf(CreateLeaveDto);
    expect(result.type).toBe('vacation');
  });

  it('rejects CreateLeaveDto with invalid leave type', async () => {
    const payload = {
      employeeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      type: 'sabbatical',
      startDate: '2026-07-01',
      endDate: '2026-07-15',
    };

    await expect(transform(CreateLeaveDto, payload)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('accepts a valid SetLeaveStatusDto', async () => {
    const payload = { status: 'approved', approvedBy: 'admin' };

    const result = await transform(SetLeaveStatusDto, payload);
    expect(result).toBeInstanceOf(SetLeaveStatusDto);
    expect(result.status).toBe('approved');
  });

  it('rejects SetLeaveStatusDto with invalid status', async () => {
    const payload = { status: 'paid' };

    await expect(transform(SetLeaveStatusDto, payload)).rejects.toThrow(
      BadRequestException,
    );
  });
});
