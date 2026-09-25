/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { VoucherService } from './voucher.service';
import { Voucher } from '../entities/voucher.entity';
import { VoucherLine } from '../entities/voucher-line.entity';
import { Account } from '../entities/account.entity';
import { AccountingPeriod } from '../entities/accounting-period.entity';
import { Subelement } from '../entities/subelement.entity';
import { AuditService } from '../audit/audit.service';
import { PaginationService } from '../common/pagination/pagination.service';
import { CacheService } from '../cache/cache.service';
import { DocumentSequenceService } from '../common/sequence/document-sequence.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('VoucherService', () => {
  let service: VoucherService;
  let voucherRepoTx: { findOne: jest.Mock; save: jest.Mock; remove: jest.Mock };
  let accountRepoTx: { findOneBy: jest.Mock; save: jest.Mock };
  let voucherLineRepoTx: { remove: jest.Mock };
  let auditService: { log: jest.Mock };
  let periodRepo: { findOne: jest.Mock };

  const companyId = 1;

  const draftVoucher = () =>
    ({
      id: 'v1',
      voucherNumber: 'V001',
      description: 'Test',
      date: '2024-01-15',
      status: 'draft',
      totalAmount: 1000,
      sourceModule: 'manual',
      createdBy: 'tester',
      lines: [
        { id: 'l1', accountId: 'a-debit', debit: 1000, credit: 0 },
        { id: 'l2', accountId: 'a-credit', debit: 0, credit: 1000 },
      ],
    }) as any;

  const deudora = () =>
    ({ id: 'a-debit', code: '101', nature: 'deudora', balance: 0 }) as any;
  const acreedora = () =>
    ({ id: 'a-credit', code: '455', nature: 'acreedora', balance: 0 }) as any;

  beforeEach(async () => {
    voucherRepoTx = {
      findOne: jest.fn(),
      save: jest.fn((v) => Promise.resolve(v)),
      remove: jest.fn((v) => Promise.resolve(v)),
    };
    accountRepoTx = {
      findOneBy: jest.fn(),
      save: jest.fn((a) => Promise.resolve(a)),
    };
    voucherLineRepoTx = { remove: jest.fn().mockResolvedValue([]) };

    const txRepos = new Map<any, any>([
      [Voucher, voucherRepoTx],
      [Account, accountRepoTx],
      [VoucherLine, voucherLineRepoTx],
    ]);
    const mockManager = {
      getRepository: jest.fn((entity) => txRepos.get(entity)),
    };

    const entityManager = {
      transaction: jest.fn((cb: (m: any) => any) => cb(mockManager)),
    } as unknown as EntityManager;

    auditService = { log: jest.fn() };
    periodRepo = {
      findOne: jest.fn().mockResolvedValue({ status: 'open' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VoucherService,
        {
          provide: getRepositoryToken(Voucher),
          useValue: { find: jest.fn(), findOne: jest.fn() },
        },
        { provide: getRepositoryToken(VoucherLine), useValue: {} },
        { provide: getRepositoryToken(Account), useValue: {} },
        { provide: getRepositoryToken(Subelement), useValue: {} },
        { provide: getRepositoryToken(AccountingPeriod), useValue: periodRepo },
        { provide: EntityManager, useValue: entityManager },
        { provide: AuditService, useValue: auditService },
        {
          provide: PaginationService,
          useValue: { applySearchAndSort: jest.fn(), paginate: jest.fn() },
        },
        {
          provide: CacheService,
          useValue: { invalidatePattern: jest.fn() },
        },
        {
          provide: DocumentSequenceService,
          useValue: { nextFormatted: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<VoucherService>(VoucherService);
  });

  describe('updateVoucherStatus → posted', () => {
    it('contabiliza el borrador y actualiza saldos según naturaleza', async () => {
      const voucher = draftVoucher();
      voucherRepoTx.findOne.mockResolvedValue(voucher);
      accountRepoTx.findOneBy.mockImplementation(({ id }: any) =>
        Promise.resolve(id === 'a-debit' ? deudora() : acreedora()),
      );

      const result = await service.updateVoucherStatus(companyId, 'v1', 'posted');

      expect(result.status).toBe('posted');
      // Deudora: balance + debit − credit → 0 + 1000
      expect(accountRepoTx.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'a-debit', balance: 1000 }),
      );
      // Acreedora: balance + credit − debit → 0 + 1000
      expect(accountRepoTx.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'a-credit', balance: 1000 }),
      );
      expect(auditService.log).toHaveBeenCalled();
    });

    it('rechaza un comprobante ya contabilizado', async () => {
      voucherRepoTx.findOne.mockResolvedValue({
        ...draftVoucher(),
        status: 'posted',
      });

      await expect(
        service.updateVoucherStatus(companyId, 'v1', 'posted'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza postear en un período cerrado', async () => {
      voucherRepoTx.findOne.mockResolvedValue(draftVoucher());
      periodRepo.findOne.mockResolvedValue({ status: 'closed' });

      await expect(
        service.updateVoucherStatus(companyId, 'v1', 'posted'),
      ).rejects.toThrow(BadRequestException);
      expect(accountRepoTx.save).not.toHaveBeenCalled();
    });

    it('lanza NotFoundException si el comprobante no existe', async () => {
      voucherRepoTx.findOne.mockResolvedValue(null);

      await expect(
        service.updateVoucherStatus(companyId, 'vX', 'posted'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateVoucherStatus → cancelled', () => {
    it('revierte los saldos de un comprobante posteado', async () => {
      const posted = { ...draftVoucher(), status: 'posted' };
      voucherRepoTx.findOne.mockResolvedValue(posted);
      accountRepoTx.findOneBy.mockImplementation(({ id }: any) =>
        Promise.resolve(
          id === 'a-debit'
            ? { ...deudora(), balance: 1000 }
            : { ...acreedora(), balance: 1000 },
        ),
      );

      const result = await service.updateVoucherStatus(
        companyId,
        'v1',
        'cancelled',
      );

      expect(result.status).toBe('cancelled');
      // Deudora: balance − debit + credit → 1000 − 1000 = 0
      expect(accountRepoTx.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'a-debit', balance: 0 }),
      );
      // Acreedora: balance − credit + debit → 1000 − 1000 = 0
      expect(accountRepoTx.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'a-credit', balance: 0 }),
      );
    });

    it('anula un borrador sin tocar saldos', async () => {
      voucherRepoTx.findOne.mockResolvedValue(draftVoucher());

      const result = await service.updateVoucherStatus(
        companyId,
        'v1',
        'cancelled',
      );

      expect(result.status).toBe('cancelled');
      expect(accountRepoTx.findOneBy).not.toHaveBeenCalled();
    });
  });

  describe('deleteVoucher', () => {
    it('elimina un borrador manual y sus líneas', async () => {
      voucherRepoTx.findOne.mockResolvedValue(draftVoucher());

      await service.deleteVoucher(companyId, 'v1');

      expect(voucherLineRepoTx.remove).toHaveBeenCalledWith(
        draftVoucher().lines,
      );
      expect(voucherRepoTx.remove).toHaveBeenCalled();
    });

    it('rechaza eliminar un comprobante posteado', async () => {
      voucherRepoTx.findOne.mockResolvedValue({
        ...draftVoucher(),
        status: 'posted',
      });

      await expect(service.deleteVoucher(companyId, 'v1')).rejects.toThrow(
        BadRequestException,
      );
      expect(voucherRepoTx.remove).not.toHaveBeenCalled();
    });

    it('rechaza eliminar comprobantes generados por otros módulos', async () => {
      voucherRepoTx.findOne.mockResolvedValue({
        ...draftVoucher(),
        sourceModule: 'payroll',
      });

      await expect(service.deleteVoucher(companyId, 'v1')).rejects.toThrow(
        BadRequestException,
      );
      expect(voucherRepoTx.remove).not.toHaveBeenCalled();
    });
  });

  describe('findVouchersBySourceDocumentId', () => {
    it('filtra por sourceModule cuando se indica (evita colisiones entre módulos)', async () => {
      const repo = (service as any).voucherRepo;
      repo.find.mockResolvedValue([]);

      await service.findVouchersBySourceDocumentId(companyId, '42', 'payroll');

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId,
            sourceDocumentId: '42',
            sourceModule: 'payroll',
          }),
        }),
      );
    });

    it('no agrega sourceModule al filtro si se omite', async () => {
      const repo = (service as any).voucherRepo;
      repo.find.mockResolvedValue([]);

      await service.findVouchersBySourceDocumentId(companyId, '42');

      const where = repo.find.mock.calls[0][0].where;
      expect(where.sourceModule).toBeUndefined();
    });
  });

  describe('resolvePostableAccount', () => {
    const resolve = (code: string, sub?: string) =>
      (service as any).resolvePostableAccount(
        (service as any).accountRepo,
        companyId,
        code,
        sub,
      );

    it('devuelve la subcuenta explícita cuando permite movimientos', async () => {
      const accountRepo = (service as any).accountRepo;
      const sub = { code: '455-0020', allowsMovements: true };
      accountRepo.findOneBy = jest.fn().mockResolvedValue(sub);

      await expect(resolve('455', '455-0020')).resolves.toBe(sub);
    });

    it('redirige una subcuenta agrupadora a su hija posteable', async () => {
      const accountRepo = (service as any).accountRepo;
      accountRepo.findOneBy = jest
        .fn()
        .mockResolvedValue({ code: '455', allowsMovements: false });
      accountRepo.find = jest.fn().mockResolvedValue([
        { code: '455-0010', allowsMovements: true },
        { code: '455-0020', allowsMovements: true },
      ]);

      const resolved = await resolve('455', '455');
      expect(resolved.code).toBe('455-0020');
    });

    it('rechaza una agrupadora sin hijas posteables', async () => {
      const accountRepo = (service as any).accountRepo;
      accountRepo.findOneBy = jest
        .fn()
        .mockResolvedValue({ code: '455', allowsMovements: false });
      accountRepo.find = jest.fn().mockResolvedValue([]);

      await expect(resolve('455', '455')).rejects.toThrow(BadRequestException);
    });

    it('rechaza una subcuenta inexistente', async () => {
      const accountRepo = (service as any).accountRepo;
      accountRepo.findOneBy = jest.fn().mockResolvedValue(null);

      await expect(resolve('455', '455-9999')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
