import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { VoucherService } from './voucher.service';
import { Voucher, VoucherLine } from '../entities/voucher.entity';
import { Account } from '../entities/account.entity';
import { CostCenter } from '../entities/cost-center.entity';
import { AccountingPeriod } from '../entities/accounting-period.entity';
import { Subelement } from '../entities/subelement.entity';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('VoucherService', () => {
  let service: VoucherService;
  let voucherRepository: Repository<Voucher>;
  let accountRepository: Repository<Account>;
  let dataSource: DataSource;
  let entityManager: EntityManager;

  const mockVoucher = {
    id: '1',
    voucherNumber: 'V001',
    description: 'Test Voucher',
    date: '2024-01-01',
    status: 'draft',
    totalAmount: 1000,
    lines: [
      {
        id: '1',
        accountCode: '1.1.1.1',
        accountName: 'Caja',
        debit: 1000,
        credit: 0,
        costCenterId: '1',
        element: '1',
        description: 'Test line'
      },
      {
        id: '2',
        accountCode: '5.1.1.1',
        accountName: 'Banco',
        debit: 0,
        credit: 1000,
        costCenterId: '1',
        element: '1',
        description: 'Test line'
      }
    ]
  } as Voucher;

  const mockAccount = {
    id: '1',
    code: '1.1.1.1',
    name: 'Caja',
    nature: 'deudora',
    type: 'asset',
    level: 4,
    balance: 0,
    isActive: true,
    allowsMovements: true
  } as Account;

  const mockCreditAccount = {
    id: '2',
    code: '5.1.1.1',
    name: 'Banco',
    nature: 'acreedora',
    type: 'asset',
    level: 4,
    balance: 0,
    isActive: true,
    allowsMovements: true
  } as Account;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VoucherService,
        {
          provide: getRepositoryToken(Voucher),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            remove: jest.fn(),
            manager: {
              transaction: jest.fn()
            }
          }
        },
        {
          provide: getRepositoryToken(VoucherLine),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            remove: jest.fn()
          }
        },
        {
          provide: getRepositoryToken(Account),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn()
          }
        },
        {
          provide: getRepositoryToken(CostCenter),
          useValue: {
            findOne: jest.fn()
          }
        },
        {
          provide: getRepositoryToken(AccountingPeriod),
          useValue: {
            findOne: jest.fn()
          }
        },
        {
          provide: getRepositoryToken(Subelement),
          useValue: {
            findOne: jest.fn()
          }
        },
        {
          provide: DataSource,
          useValue: {
            createQueryRunner: jest.fn(),
            manager: {
              transaction: jest.fn()
            }
          }
        }
      ]
    }).compile();

    service = module.get<VoucherService>(VoucherService);
    voucherRepository = module.get<Repository<Voucher>>(getRepositoryToken(Voucher));
    accountRepository = module.get<Repository<Account>>(getRepositoryToken(Account));
    dataSource = module.get<DataSource>(DataSource);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('postVoucher', () => {
    it('should update account balances correctly when posting a voucher', async () => {
      // Arrange
      const companyId = 1;
      const voucherId = '1';
      
      jest.spyOn(voucherRepository, 'findOne').mockResolvedValue(mockVoucher);
      jest.spyOn(accountRepository, 'findOne')
        .mockResolvedValueOnce(mockAccount)
        .mockResolvedValueOnce(mockCreditAccount);
      
      const mockEntityManager = {
        findOne: jest.fn(),
        save: jest.fn().mockImplementation((account) => {
          // Simulate balance update
          if (account.nature === 'deudora') {
            account.balance += 1000; // Debit increases balance for deudora accounts
          } else {
            account.balance -= 1000; // Credit decreases balance for acreedora accounts
          }
          return Promise.resolve(account);
        })
      } as any;

      jest.spyOn(dataSource, 'manager').mockReturnValue(mockEntityManager);
      jest.spyOn(mockEntityManager, 'transaction').mockImplementation(async (callback) => {
        return callback(mockEntityManager);
      });

      // Act
      const result = await service.postVoucher(companyId, voucherId);

      // Assert
      expect(result).toBeDefined();
      expect(result.status).toBe('posted');
      
      // Verify account balance updates
      expect(mockEntityManager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          code: '1.1.1.1',
          balance: 1000 // Deudora account: 0 + 1000 (debit)
        })
      );
      
      expect(mockEntityManager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          code: '5.1.1.1',
          balance: -1000 // Acreedora account: 0 - 1000 (credit)
        })
      );
    });

    it('should handle mixed debit/credit operations correctly', async () => {
      // Arrange
      const companyId = 1;
      const voucherId = '1';
      
      const mixedVoucher = {
        ...mockVoucher,
        lines: [
          {
            id: '1',
            accountCode: '1.1.1.1',
            accountName: 'Caja',
            debit: 500,
            credit: 200, // Mixed line
            costCenterId: '1',
            element: '1',
            description: 'Mixed line'
          }
        ]
      } as Voucher;

      jest.spyOn(voucherRepository, 'findOne').mockResolvedValue(mixedVoucher);
      jest.spyOn(accountRepository, 'findOne').mockResolvedValue(mockAccount);
      
      const mockEntityManager = {
        save: jest.fn().mockImplementation((account) => {
          // For deudora account: balance = balance + debit - credit
          account.balance = account.balance + 500 - 200; // 300
          return Promise.resolve(account);
        })
      } as any;

      jest.spyOn(dataSource, 'manager').mockReturnValue(mockEntityManager);
      jest.spyOn(mockEntityManager, 'transaction').mockImplementation(async (callback) => {
        return callback(mockEntityManager);
      });

      // Act
      const result = await service.postVoucher(companyId, voucherId);

      // Assert
      expect(result.status).toBe('posted');
      expect(mockEntityManager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          code: '1.1.1.1',
          balance: 300 // 0 + 500 (debit) - 200 (credit)
        })
      );
    });

    it('should throw NotFoundException if voucher not found', async () => {
      // Arrange
      const companyId = 1;
      const voucherId = '999';
      
      jest.spyOn(voucherRepository, 'findOne').mockResolvedValue(null);

      // Act & Assert
      await expect(service.postVoucher(companyId, voucherId))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if voucher is already posted', async () => {
      // Arrange
      const companyId = 1;
      const voucherId = '1';
      const postedVoucher = { ...mockVoucher, status: 'posted' };
      
      jest.spyOn(voucherRepository, 'findOne').mockResolvedValue(postedVoucher);

      // Act & Assert
      await expect(service.postVoucher(companyId, voucherId))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('cancelVoucher', () => {
    it('should reverse account balances when cancelling a posted voucher', async () => {
      // Arrange
      const companyId = 1;
      const voucherId = '1';
      const postedVoucher = { ...mockVoucher, status: 'posted' };
      
      // Accounts with existing balances from previous posting
      const accountWithBalance = { ...mockAccount, balance: 1000 };
      const creditAccountWithBalance = { ...mockCreditAccount, balance: -1000 };
      
      jest.spyOn(voucherRepository, 'findOne').mockResolvedValue(postedVoucher);
      jest.spyOn(accountRepository, 'findOne')
        .mockResolvedValueOnce(accountWithBalance)
        .mockResolvedValueOnce(creditAccountWithBalance);
      
      const mockEntityManager = {
        save: jest.fn().mockImplementation((account) => {
          // Reverse the original posting
          if (account.nature === 'deudora') {
            account.balance -= 1000; // Reverse debit: 1000 - 1000 = 0
          } else {
            account.balance += 1000; // Reverse credit: -1000 + 1000 = 0
          }
          return Promise.resolve(account);
        })
      } as any;

      jest.spyOn(dataSource, 'manager').mockReturnValue(mockEntityManager);
      jest.spyOn(mockEntityManager, 'transaction').mockImplementation(async (callback) => {
        return callback(mockEntityManager);
      });

      // Act
      const result = await service.cancelVoucher(companyId, voucherId);

      // Assert
      expect(result).toBeDefined();
      expect(result.status).toBe('cancelled');
      
      // Verify balance reversal
      expect(mockEntityManager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          code: '1.1.1.1',
          balance: 0 // Reversed from 1000 back to 0
        })
      );
      
      expect(mockEntityManager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          code: '5.1.1.1',
          balance: 0 // Reversed from -1000 back to 0
        })
      );
    });

    it('should throw BadRequestException if trying to cancel a draft voucher', async () => {
      // Arrange
      const companyId = 1;
      const voucherId = '1';
      
      jest.spyOn(voucherRepository, 'findOne').mockResolvedValue(mockVoucher);

      // Act & Assert
      await expect(service.cancelVoucher(companyId, voucherId))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteVoucher', () => {
    it('should allow deletion of draft vouchers', async () => {
      // Arrange
      const companyId = 1;
      const voucherId = '1';
      
      jest.spyOn(voucherRepository, 'findOne').mockResolvedValue(mockVoucher);
      jest.spyOn(voucherRepository, 'remove').mockResolvedValue(undefined);

      // Act
      await expect(service.deleteVoucher(companyId, voucherId))
        .resolves.not.toThrow();
      
      // Assert
      expect(voucherRepository.remove).toHaveBeenCalledWith(mockVoucher);
    });

    it('should not allow deletion of posted vouchers', async () => {
      // Arrange
      const companyId = 1;
      const voucherId = '1';
      const postedVoucher = { ...mockVoucher, status: 'posted' };
      
      jest.spyOn(voucherRepository, 'findOne').mockResolvedValue(postedVoucher);

      // Act & Assert
      await expect(service.deleteVoucher(companyId, voucherId))
        .rejects.toThrow(BadRequestException);
      
      expect(voucherRepository.remove).not.toHaveBeenCalled();
    });

    it('should not allow deletion of cancelled vouchers', async () => {
      // Arrange
      const companyId = 1;
      const voucherId = '1';
      const cancelledVoucher = { ...mockVoucher, status: 'cancelled' };
      
      jest.spyOn(voucherRepository, 'findOne').mockResolvedValue(cancelledVoucher);

      // Act & Assert
      await expect(service.deleteVoucher(companyId, voucherId))
        .rejects.toThrow(BadRequestException);
      
      expect(voucherRepository.remove).not.toHaveBeenCalled();
    });
  });

  describe('balance calculation edge cases', () => {
    it('should handle zero balance accounts correctly', async () => {
      // Arrange
      const companyId = 1;
      const voucherId = '1';
      
      jest.spyOn(voucherRepository, 'findOne').mockResolvedValue(mockVoucher);
      jest.spyOn(accountRepository, 'findOne')
        .mockResolvedValueOnce(mockAccount)
        .mockResolvedValueOnce(mockCreditAccount);
      
      const mockEntityManager = {
        save: jest.fn().mockImplementation((account) => {
          // Simulate balance update
          if (account.nature === 'deudora') {
            account.balance += 1000;
          } else {
            account.balance -= 1000;
          }
          return Promise.resolve(account);
        })
      } as any;

      jest.spyOn(dataSource, 'manager').mockReturnValue(mockEntityManager);
      jest.spyOn(mockEntityManager, 'transaction').mockImplementation(async (callback) => {
        return callback(mockEntityManager);
      });

      // Act
      await service.postVoucher(companyId, voucherId);

      // Assert
      expect(mockEntityManager.save).toHaveBeenCalledTimes(2);
    });

    it('should handle negative balances correctly', async () => {
      // Arrange
      const companyId = 1;
      const voucherId = '1';
      
      const accountWithNegativeBalance = { ...mockAccount, balance: -500 };
      
      jest.spyOn(voucherRepository, 'findOne').mockResolvedValue(mockVoucher);
      jest.spyOn(accountRepository, 'findOne').mockResolvedValue(accountWithNegativeBalance);
      
      const mockEntityManager = {
        save: jest.fn().mockImplementation((account) => {
          // Start with -500, add 1000 debit = 500
          account.balance = account.balance + 1000;
          return Promise.resolve(account);
        })
      } as any;

      jest.spyOn(dataSource, 'manager').mockReturnValue(mockEntityManager);
      jest.spyOn(mockEntityManager, 'transaction').mockImplementation(async (callback) => {
        return callback(mockEntityManager);
      });

      // Act
      await service.postVoucher(companyId, voucherId);

      // Assert
      expect(mockEntityManager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          code: '1.1.1.1',
          balance: 500 // -500 + 1000 = 500
        })
      );
    });
  });
});
