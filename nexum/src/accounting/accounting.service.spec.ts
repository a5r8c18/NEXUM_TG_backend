import { Test, TestingModule } from '@nestjs/testing';
import { AccountingService } from './accounting.service';
import { Repository } from 'typeorm';
import { Voucher, VoucherLine } from '../entities/voucher.entity';
import { Account } from '../entities/account.entity';
import { Company } from '../entities/company.entity';
import { getRepositoryToken } from '@nestjs/typeorm';

describe('AccountingService', () => {
  let service: AccountingService;
  let voucherRepo: Repository<Voucher>;
  let voucherLineRepo: Repository<VoucherLine>;
  let accountRepo: Repository<Account>;
  let companyRepo: Repository<Company>;

  const mockVoucherRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockVoucherLineRepo = {
    createQueryBuilder: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    delete: jest.fn(),
  };

  const mockAccountRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockCompanyRepo = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountingService,
        {
          provide: getRepositoryToken(Voucher),
          useValue: mockVoucherRepo,
        },
        {
          provide: getRepositoryToken(VoucherLine),
          useValue: mockVoucherLineRepo,
        },
        {
          provide: getRepositoryToken(Account),
          useValue: mockAccountRepo,
        },
        {
          provide: getRepositoryToken(Company),
          useValue: mockCompanyRepo,
        },
      ],
    }).compile();

    service = module.get<AccountingService>(AccountingService);
    voucherRepo = module.get<Repository<Voucher>>(getRepositoryToken(Voucher));
    voucherLineRepo = module.get<Repository<VoucherLine>>(getRepositoryToken(VoucherLine));
    accountRepo = module.get<Repository<Account>>(getRepositoryToken(Account));
    companyRepo = module.get<Repository<Company>>(getRepositoryToken(Company));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createVoucher', () => {
    it('should create a voucher with valid data', async () => {
      const mockVoucherData = {
        voucherNumber: 'COP-001',
        date: '2024-04-24',
        description: 'Test voucher',
        lines: [
          {
            accountCode: '101',
            accountName: 'Caja',
            debit: 1000,
            credit: 0,
          },
          {
            accountCode: '201',
            accountName: 'Bancos',
            debit: 0,
            credit: 1000,
          },
        ],
      };

      const mockAccount = {
        id: 'acc-1',
        accountCode: '101',
        accountName: 'Caja',
        nature: 'deudora',
        type: 'asset',
      };

      const mockCompany = {
        id: 1,
        name: 'Test Company',
      };

      const mockVoucher = {
        id: 'v-1',
        ...mockVoucherData,
        status: 'draft',
        companyId: 1,
        createdAt: new Date(),
      };

      mockCompanyRepo.findOne.mockResolvedValue(mockCompany);
      mockAccountRepo.findOne.mockResolvedValue(mockAccount);
      mockVoucherRepo.create.mockReturnValue(mockVoucher);
      mockVoucherRepo.save.mockResolvedValue(mockVoucher);

      const result = await service.createVoucher(1, mockVoucherData);

      expect(result).toEqual(mockVoucher);
      expect(mockCompanyRepo.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(mockAccountRepo.findOne).toHaveBeenCalledTimes(2);
      expect(mockVoucherRepo.create).toHaveBeenCalled();
      expect(mockVoucherRepo.save).toHaveBeenCalledWith(mockVoucher);
    });

    it('should throw error if company does not exist', async () => {
      const mockVoucherData = {
        voucherNumber: 'COP-001',
        date: '2024-04-24',
        description: 'Test voucher',
        lines: [],
      };

      mockCompanyRepo.findOne.mockResolvedValue(null);

      await expect(service.createVoucher(1, mockVoucherData)).rejects.toThrow(
        'Company not found',
      );
    });

    it('should throw error if debits do not equal credits', async () => {
      const mockVoucherData = {
        voucherNumber: 'COP-001',
        date: '2024-04-24',
        description: 'Test voucher',
        lines: [
          {
            accountCode: '101',
            accountName: 'Caja',
            debit: 1000,
            credit: 0,
          },
          {
            accountCode: '201',
            accountName: 'Bancos',
            debit: 0,
            credit: 500, // Not equal to debit
          },
        ],
      };

      const mockCompany = { id: 1, name: 'Test Company' };
      mockCompanyRepo.findOne.mockResolvedValue(mockCompany);

      await expect(service.createVoucher(1, mockVoucherData)).rejects.toThrow(
        'Debits must equal credits',
      );
    });

    it('should throw error if account does not exist', async () => {
      const mockVoucherData = {
        voucherNumber: 'COP-001',
        date: '2024-04-24',
        description: 'Test voucher',
        lines: [
          {
            accountCode: '999',
            accountName: 'Non-existent account',
            debit: 1000,
            credit: 0,
          },
          {
            accountCode: '201',
            accountName: 'Bancos',
            debit: 0,
            credit: 1000,
          },
        ],
      };

      const mockCompany = { id: 1, name: 'Test Company' };
      mockCompanyRepo.findOne.mockResolvedValue(mockCompany);
      mockAccountRepo.findOne.mockResolvedValue(null);

      await expect(service.createVoucher(1, mockVoucherData)).rejects.toThrow(
        'Account not found',
      );
    });
  });

  describe('getTrialBalance', () => {
    it('should return trial balance data', async () => {
      const mockQueryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          {
            accountCode: '101',
            accountName: 'Caja',
            nature: 'deudora',
            accountType: 'asset',
            openingBalance: 1000,
            periodDebit: 5000,
            periodCredit: 2000,
          },
        ]),
        getRawOne: jest.fn().mockResolvedValue({
          openingBalance: 1000,
          periodDebit: 5000,
          periodCredit: 2000,
        }),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
      };

      mockVoucherLineRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getTrialBalance(1);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        accountCode: '101',
        accountName: 'Caja',
        nature: 'deudora',
        accountType: 'asset',
        openingBalance: 1000,
        periodDebit: 5000,
        periodCredit: 2000,
        closingBalance: 4000, // 1000 + (5000 - 2000)
      });
    });

    it('should calculate closing balance correctly for deudora accounts', async () => {
      const mockQueryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
        getRawOne: jest.fn().mockResolvedValue({
          openingBalance: 1000,
          periodDebit: 5000,
          periodCredit: 2000,
        }),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
      };

      mockVoucherLineRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getTrialBalance(1);

      // For deudora accounts: closingBalance = openingBalance + (debit - credit)
      expect(result[0].closingBalance).toBe(4000); // 1000 + (5000 - 2000)
    });

    it('should calculate closing balance correctly for acreedora accounts', async () => {
      const mockQueryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          {
            accountCode: '201',
            accountName: 'Bancos',
            nature: 'acreedora',
            accountType: 'liability',
            openingBalance: 2000,
            periodDebit: 1000,
            periodCredit: 3000,
          },
        ]),
        getRawOne: jest.fn().mockResolvedValue({
          openingBalance: 2000,
          periodDebit: 1000,
          periodCredit: 3000,
        }),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
      };

      mockVoucherLineRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getTrialBalance(1);

      // For acreedora accounts: closingBalance = openingBalance + (credit - debit)
      expect(result[0].closingBalance).toBe(4000); // 2000 + (3000 - 1000)
    });
  });

  describe('getBalanceSheet', () => {
    it('should return balance sheet data', async () => {
      const mockQueryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          {
            accountType: 'asset',
            accountCode: '101',
            accountName: 'Caja',
            balance: 4000,
          },
          {
            accountType: 'liability',
            accountCode: '201',
            accountName: 'Bancos',
            balance: 8000,
          },
          {
            accountType: 'equity',
            accountCode: '301',
            accountName: 'Capital',
            balance: 5000,
          },
        ]),
      };

      mockVoucherLineRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getBalanceSheet(1);

      expect(result).toMatchObject({
        assets: {
          items: expect.arrayContaining([
            expect.objectContaining({
              accountType: 'asset',
              accountCode: '101',
              accountName: 'Caja',
              balance: 4000,
            }),
          ]),
          total: 4000,
        },
        liabilities: {
          items: expect.arrayContaining([
            expect.objectContaining({
              accountType: 'liability',
              accountCode: '201',
              accountName: 'Bancos',
              balance: 8000,
            }),
          ]),
          total: 8000,
        },
        equity: {
          items: expect.arrayContaining([
            expect.objectContaining({
              accountType: 'equity',
              accountCode: '301',
              accountName: 'Capital',
              balance: 5000,
            }),
          ]),
          total: 5000,
        },
        balanced: false, // 4000 != 8000 + 5000
      });
    });

    it('should return balanced when assets equal liabilities plus equity', async () => {
      const mockQueryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          {
            accountType: 'asset',
            accountCode: '101',
            accountName: 'Caja',
            balance: 13000,
          },
          {
            accountType: 'liability',
            accountCode: '201',
            accountName: 'Bancos',
            balance: 8000,
          },
          {
            accountType: 'equity',
            accountCode: '301',
            accountName: 'Capital',
            balance: 5000,
          },
        ]),
      };

      mockVoucherLineRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getBalanceSheet(1);

      expect(result.balanced).toBe(true); // 13000 = 8000 + 5000
    });
  });

  describe('getIncomeStatement', () => {
    it('should return income statement data', async () => {
      const mockQueryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          {
            accountType: 'income',
            accountCode: '401',
            accountName: 'Ventas',
            totalDebit: 0,
            totalCredit: 50000,
          },
          {
            accountType: 'expense',
            accountCode: '501',
            accountName: 'Costo de Ventas',
            totalDebit: 30000,
            totalCredit: 0,
          },
        ]),
      };

      mockVoucherLineRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getIncomeStatement(1);

      expect(result).toMatchObject({
        income: {
          items: expect.arrayContaining([
            expect.objectContaining({
              accountType: 'income',
              accountCode: '401',
              accountName: 'Ventas',
              totalDebit: 0,
              totalCredit: 50000,
            }),
          ]),
          total: 50000,
        },
        expenses: {
          items: expect.arrayContaining([
            expect.objectContaining({
              accountType: 'expense',
              accountCode: '501',
              accountName: 'Costo de Ventas',
              totalDebit: 30000,
              totalCredit: 0,
            }),
          ]),
          total: 30000,
        },
        netProfit: 20000, // 50000 - 30000
      });
    });

    it('should calculate net loss when expenses exceed income', async () => {
      const mockQueryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          {
            accountType: 'income',
            accountCode: '401',
            accountName: 'Ventas',
            totalDebit: 0,
            totalCredit: 30000,
          },
          {
            accountType: 'expense',
            accountCode: '501',
            accountName: 'Costo de Ventas',
            totalDebit: 50000,
            totalCredit: 0,
          },
        ]),
      };

      mockVoucherLineRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getIncomeStatement(1);

      expect(result.netProfit).toBe(-20000); // 30000 - 50000
    });
  });

  describe('getExpenseBreakdown', () => {
    it('should return expense breakdown by elements and subelements', async () => {
      const mockQueryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn()
          .mockResolvedValueOnce([
            {
              elementCode: '1',
              elementName: 'Gastos de Personal',
              totalDebit: 20000,
              totalCredit: 0,
            },
          ])
          .mockResolvedValue([
            {
              subelementCode: '1.1',
              subelementName: 'Salarios',
              totalDebit: 15000,
              totalCredit: 0,
            },
            {
              subelementCode: '1.2',
              subelementName: 'Seguridad Social',
              totalDebit: 5000,
              totalCredit: 0,
            },
          ]),
      };

      mockVoucherLineRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getExpenseBreakdown(1);

      expect(result).toMatchObject({
        elements: [
          {
            elementCode: '1',
            elementName: 'Gastos de Personal',
            total: 20000,
            subelements: [
              {
                subelementCode: '1.1',
                subelementName: 'Salarios',
                total: 15000,
              },
              {
                subelementCode: '1.2',
                subelementName: 'Seguridad Social',
                total: 5000,
              },
            ],
          },
        ],
        grandTotal: 20000,
      });
    });

    it('should return empty result when no expense data exists', async () => {
      const mockQueryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      mockVoucherLineRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getExpenseBreakdown(1);

      expect(result).toMatchObject({
        elements: [],
        grandTotal: 0,
      });
    });
  });
});
