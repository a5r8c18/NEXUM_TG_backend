import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
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

describe('PayrollService.cancel() transaccional', () => {
  let service: PayrollService;
  let payrollRepo: jest.Mocked<Repository<Payroll>>;
  let voucherService: jest.Mocked<VoucherService>;
  let financeService: jest.Mocked<FinanceService>;
  let dataSource: { transaction: jest.Mock };

  function paidPayrollFixture(): Payroll {
    return {
      id: 1,
      companyId: 10,
      period: '2026-07',
      status: 'paid',
      bankTransactionId: 'bank-tx-uuid',
      notes: '',
    } as Payroll;
  }

  const paidPayroll = paidPayrollFixture();

  const processedPayroll = {
    ...paidPayroll,
    status: 'processed',
    bankTransactionId: null,
  } as unknown as Payroll;

  function createManagerMock(payroll: Payroll = paidPayroll) {
    const save = jest.fn().mockResolvedValue(payroll);
    const findOne = jest.fn().mockImplementation((args: any) => {
      // El Payment asociado se busca por paymentNumber, no por id.
      if (args?.where?.paymentNumber) return Promise.resolve(null);
      return Promise.resolve({ ...payroll });
    });
    const query = jest.fn().mockResolvedValue(undefined);
    return {
      getRepository: jest.fn().mockReturnValue({ findOne, save }),
      query,
    } as any;
  }

  beforeEach(async () => {
    payrollRepo = {
      findOne: jest.fn().mockImplementation(() => Promise.resolve({ ...paidPayroll })),
    } as any;

    voucherService = {
      findVouchersBySourceDocumentId: jest.fn().mockResolvedValue([]),
      updateVoucherStatus: jest.fn().mockResolvedValue(undefined),
    } as any;

    financeService = {
      cancelPayablesByInvoiceNumber: jest
        .fn()
        .mockResolvedValue({ cancelled: 0, blocked: [] }),
      reverseBankTransaction: jest.fn().mockResolvedValue({ id: 'rev-tx-uuid' } as any),
    } as any;

    dataSource = { transaction: jest.fn() } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollService,
        { provide: getRepositoryToken(Payroll), useValue: payrollRepo },
        { provide: getRepositoryToken(PayrollItem), useValue: {} },
        { provide: getRepositoryToken(Employee), useValue: {} },
        { provide: getRepositoryToken(Attendance), useValue: {} },
        { provide: getRepositoryToken(LeaveRequest), useValue: {} },
        { provide: getRepositoryToken(Payment), useValue: {} },
        { provide: VoucherService, useValue: voucherService },
        { provide: AccountMappingService, useValue: {} },
        { provide: FinanceService, useValue: financeService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<PayrollService>(PayrollService);
    (service as any).dataSource = dataSource;
  });

  it('cancela una nómina paid de punta a punta en una transacción', async () => {
    const manager = createManagerMock();
    dataSource.transaction.mockImplementation(async (cb: any) => cb(manager));

    const voucher = { id: 'v-1', status: 'posted', voucherNumber: 'C-001' } as any;
    voucherService.findVouchersBySourceDocumentId
      .mockResolvedValueOnce([voucher]);

    const result = await service.cancel(10, 1, 'error en pago');

    expect(payrollRepo.findOne).toHaveBeenCalledWith({ where: { id: 1, companyId: 10 } });
    expect(voucherService.findVouchersBySourceDocumentId).toHaveBeenCalledWith(
      10,
      String(1),
      'payroll',
    );
    expect(voucherService.updateVoucherStatus).toHaveBeenCalledWith(
      10,
      'v-1',
      'cancelled',
      manager,
    );
    expect(financeService.cancelPayablesByInvoiceNumber).toHaveBeenCalledWith(
      10,
      'IMP-2026-07-1',
      'Anulada por cancelación de nómina 2026-07',
      manager,
    );
    expect(financeService.reverseBankTransaction).toHaveBeenCalledWith(
      10,
      'PAGO-NOM-2026-07-1',
      'Reverso por cancelación de nómina 2026-07',
      manager,
      'bank-tx-uuid',
    );

    const save = manager.getRepository(Payroll).save;
    expect(save).toHaveBeenCalled();
    expect(save.mock.calls[0][0].status).toBe('cancelled');
    expect(save.mock.calls[0][0].notes).toContain('Cancelada: error en pago');
    expect(result.payroll.status).toBe('cancelled');
  });

  it('no marca la nómina como cancelada si falla la reversa bancaria', async () => {
    const manager = createManagerMock();
    dataSource.transaction.mockImplementation(async (cb: any) => cb(manager));

    financeService.reverseBankTransaction.mockRejectedValue(
      new NotFoundException('BankTransaction no encontrada'),
    );

    await expect(service.cancel(10, 1)).rejects.toThrow(NotFoundException);

    const save = manager.getRepository(Payroll).save;
    expect(save).not.toHaveBeenCalled();
  });

  it('reintenta la cancelación y tiene éxito una vez solventado el problema', async () => {
    const manager = createManagerMock();
    dataSource.transaction.mockImplementation(async (cb: any) => cb(manager));

    financeService.reverseBankTransaction
      .mockRejectedValueOnce(new NotFoundException('BankTransaction no encontrada'))
      .mockResolvedValueOnce({ id: 'rev-tx-uuid' } as any);

    await expect(service.cancel(10, 1)).rejects.toThrow(NotFoundException);

    const result = await service.cancel(10, 1);
    expect(financeService.reverseBankTransaction).toHaveBeenCalledTimes(2);
    expect(result.payroll.status).toBe('cancelled');
  });

  it('no requiere reversa bancaria si la nómina solo estaba procesada', async () => {
    payrollRepo.findOne.mockResolvedValue(processedPayroll);
    const manager = createManagerMock(processedPayroll);
    dataSource.transaction.mockImplementation(async (cb: any) => cb(manager));

    await service.cancel(10, 1);

    expect(financeService.reverseBankTransaction).not.toHaveBeenCalled();
    expect(manager.getRepository(Payroll).save).toHaveBeenCalled();
    const saved = manager.getRepository(Payroll).save.mock.calls[0][0];
    expect(saved.status).toBe('cancelled');
  });

  it('restituye a la licencia lo liquidado para que pueda regenerarse', async () => {
    const withLeave = {
      ...paidPayroll,
      items: [
        { leaveRequestId: 'lv-1', paidUnits: 22, grossSalary: 4600 },
        { leaveRequestId: null, paidUnits: 24, grossSalary: 5000 },
      ],
    } as unknown as Payroll;
    payrollRepo.findOne.mockResolvedValue(withLeave);
    const manager = createManagerMock(withLeave);
    dataSource.transaction.mockImplementation(async (cb: any) => cb(manager));

    await service.cancel(10, 1);

    // Solo la línea vinculada a la licencia decrementa sus contadores.
    expect(manager.query).toHaveBeenCalledTimes(1);
    const [sql, params] = manager.query.mock.calls[0];
    expect(sql).toContain('leave_requests');
    expect(sql).toContain('GREATEST');
    expect(params).toEqual([22, 4600, 'lv-1']);
  });

  it('no intenta reversa bancaria si la nómina pagada no tuvo movimiento', async () => {
    const paidCash = {
      ...paidPayroll,
      bankTransactionId: null,
    } as unknown as Payroll;
    payrollRepo.findOne.mockResolvedValue(paidCash);
    const manager = createManagerMock(paidCash);
    dataSource.transaction.mockImplementation(async (cb: any) => cb(manager));

    const result = await service.cancel(10, 1);

    expect(financeService.reverseBankTransaction).not.toHaveBeenCalled();
    expect(result.payroll.status).toBe('cancelled');
  });

  it('rechaza la cancelación si una obligación ya tiene pagos aplicados', async () => {
    const manager = createManagerMock();
    dataSource.transaction.mockImplementation(async (cb: any) => cb(manager));
    financeService.cancelPayablesByInvoiceNumber.mockResolvedValue({
      cancelled: 1,
      blocked: ['CXP-2026-0007'],
    });

    await expect(service.cancel(10, 1)).rejects.toThrow(
      /CXP-2026-0007/,
    );

    // La nómina no queda cancelada.
    const save = manager.getRepository(Payroll).save;
    const savedStatuses = save.mock.calls.map((c) => c[0].status);
    expect(savedStatuses).not.toContain('cancelled');
  });

  it('anula el Payment asociado al pago por banco', async () => {
    const manager = createManagerMock();
    const paymentFindOne = jest.fn().mockResolvedValue({
      id: 'pay-1',
      paymentNumber: 'PAG-NOM-1',
      status: 'completed',
    });
    const paymentSave = jest.fn().mockResolvedValue(undefined);
    manager.getRepository.mockImplementation((entity: any) =>
      entity === Payment
        ? { findOne: paymentFindOne, save: paymentSave }
        : { findOne: jest.fn().mockResolvedValue({ ...paidPayroll }), save: jest.fn() },
    );
    dataSource.transaction.mockImplementation(async (cb: any) => cb(manager));

    await service.cancel(10, 1);

    expect(paymentFindOne).toHaveBeenCalledWith({
      where: { companyId: 10, paymentNumber: 'PAG-NOM-1' },
    });
    expect(paymentSave).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled' }),
    );
  });
});
