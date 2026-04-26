/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { AppModule } from '../src/app.module';
import { AccountingService } from '../src/accounting/accounting.service';
import { VoucherService } from '../src/accounting/voucher.service';
import { AccountService } from '../src/accounting/account.service';
import { ReportService } from '../src/accounting/report.service';
import { Company } from '../src/entities/company.entity';
import { User } from '../src/entities/user.entity';
import { Account } from '../src/entities/account.entity';
import { Voucher } from '../src/entities/voucher.entity';
import { VoucherLine } from '../src/entities/voucher-line.entity';
import { FiscalYear } from '../src/entities/fiscal-year.entity';
import { AccountingPeriod } from '../src/entities/accounting-period.entity';
import { CreateVoucherDto } from '../src/accounting/dto/voucher.dto';
import { CreateAccountDto } from '../src/accounting/dto/account.dto';

describe('Accounting Integration Tests', () => {
  let app: INestApplication;
  let accountingService: AccountingService;
  let voucherService: VoucherService;
  let accountService: AccountService;
  let reportService: ReportService;
  let moduleRef: TestingModule;

  // Test data
  let testCompany: Company;
  let testUser: User;
  let testAccounts: Account[];
  let testFiscalYear: FiscalYear;
  let testPeriod: AccountingPeriod;

  beforeAll(async () => {
    // Create test database configuration
    const testDbConfig: TypeOrmModuleOptions = {
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'postgres',
      password: 'test_password',
      database: 'nexum_test_db',
      entities: [__dirname + '/../src/entities/*.entity.ts'],
      synchronize: true, // Only for testing
      logging: false,
    };

    moduleRef = await Test.createTestingModule({
      imports: [
        AppModule,
        TypeOrmModule.forRoot(testDbConfig),
        TypeOrmModule.forFeature([
          Company,
          User,
          Account,
          Voucher,
          VoucherLine,
          FiscalYear,
          AccountingPeriod,
        ]),
      ],
      providers: [
        AccountingService,
        VoucherService,
        AccountService,
        ReportService,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    accountingService = moduleRef.get<AccountingService>(AccountingService);
    voucherService = moduleRef.get<VoucherService>(VoucherService);
    accountService = moduleRef.get<AccountService>(AccountService);
    reportService = moduleRef.get<ReportService>(ReportService);

    // Setup test data
    await setupTestData();
  });

  afterAll(async () => {
    // Clean up test data
    await cleanupTestData();
    await app.close();
    await moduleRef.close();
  });

  async function setupTestData() {
    // Create test company
    testCompany = await moduleRef.get('CompanyRepository').save({
      name: 'Test Company Integration',
      taxId: 'TEST123',
      address: 'Test Address',
      phone: '123456789',
      email: 'test@company.com',
      isActive: true,
    });

    // Create test user
    testUser = await moduleRef.get('UserRepository').save({
      email: 'test.user@example.com',
      password: 'hashedPassword',
      firstName: 'Test',
      lastName: 'User',
      role: 'admin',
      companyId: testCompany.id,
      isActive: true,
    });

    // Create test fiscal year
    testFiscalYear = await moduleRef.get('FiscalYearRepository').save({
      companyId: testCompany.id,
      year: 2026,
      name: 'Año Fiscal 2026',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      isActive: true,
      createdBy: testUser.id,
    });

    // Create test accounting period
    testPeriod = await moduleRef.get('AccountingPeriodRepository').save({
      fiscalYearId: testFiscalYear.id,
      companyId: testCompany.id,
      name: 'Enero 2026',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-01-31'),
      isActive: true,
      createdBy: testUser.id,
    });

    // Create test accounts
    const accountData: CreateAccountDto[] = [
      {
        code: '101',
        name: 'Caja',
        level: 3,
        nature: 'deudora',
        type: 'asset',
        groupNumber: '1',
        isActive: true,
        allowsMovements: true,
      },
      {
        code: '102',
        name: 'Banco',
        level: 3,
        nature: 'deudora',
        type: 'asset',
        groupNumber: '1',
        isActive: true,
        allowsMovements: true,
      },
      {
        code: '401',
        name: 'Proveedores',
        level: 3,
        nature: 'acreedora',
        type: 'liability',
        groupNumber: '4',
        isActive: true,
        allowsMovements: true,
      },
      {
        code: '501',
        name: 'Compras',
        level: 3,
        nature: 'deudora',
        type: 'expense',
        groupNumber: '5',
        isActive: true,
        allowsMovements: true,
      },
      {
        code: '601',
        name: 'Ventas',
        level: 3,
        nature: 'acreedora',
        type: 'income',
        groupNumber: '6',
        isActive: true,
        allowsMovements: true,
      },
    ];

    testAccounts = [];
    for (const accountDto of accountData) {
      const account = await accountService.createAccount(
        testCompany.id,
        accountDto,
      );
      testAccounts.push(account);
    }
  }

  async function cleanupTestData() {
    const repositories = [
      'VoucherLineRepository',
      'VoucherRepository',
      'AccountingPeriodRepository',
      'FiscalYearRepository',
      'AccountRepository',
      'UserRepository',
      'CompanyRepository',
    ];

    for (const repoName of repositories) {
      try {
        await moduleRef.get(repoName).clear();
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }

  describe('Voucher Creation Integration', () => {
    it('should create a complete voucher with multiple lines', async () => {
      const voucherData: CreateVoucherDto = {
        description: 'Test Integration Voucher',
        date: '2026-01-15',
        lines: [
          {
            accountCode: '101',
            debit: 1000,
            credit: 0,
            description: 'Débito a Caja',
          },
          {
            accountCode: '601',
            debit: 0,
            credit: 1000,
            description: 'Crédito a Ventas',
          },
        ],
      };

      const voucher = await voucherService.createVoucher(
        testCompany.id,
        voucherData,
      );

      expect(voucher).toBeDefined();
      expect(voucher.voucherNumber).toBe('INV-001');
      expect(voucher.description).toBe('Test Integration Voucher');
      expect(voucher.status).toBe('draft');
      expect(voucher.totalAmount).toBe(1000);
      expect(voucher.lines).toHaveLength(2);
      expect(voucher.periodId).toBe(testPeriod.id);

      // Verify balance
      const totalDebit = voucher.lines.reduce(
        (sum, line) => sum + line.debit,
        0,
      );
      const totalCredit = voucher.lines.reduce(
        (sum, line) => sum + line.credit,
        0,
      );
      expect(totalDebit).toBe(totalCredit);
    });

    it('should reject voucher with unbalanced lines', async () => {
      const voucherData: CreateVoucherDto = {
        description: 'Unbalanced Voucher',
        date: '2026-01-15',
        lines: [
          {
            accountCode: '101',
            debit: 1000,
            credit: 0,
            description: 'Débito a Caja',
          },
          {
            accountCode: '601',
            debit: 0,
            credit: 800, // Unbalanced
            description: 'Crédito a Ventas',
          },
        ],
      };

      await expect(
        voucherService.createVoucher(testCompany.id, voucherData),
      ).rejects.toThrow();
    });

    it('should reject voucher with invalid account codes', async () => {
      const voucherData: CreateVoucherDto = {
        description: 'Invalid Account Voucher',
        date: '2026-01-15',
        lines: [
          {
            accountCode: '999', // Invalid account
            debit: 1000,
            credit: 0,
            description: 'Débito a cuenta inválida',
          },
          {
            accountCode: '601',
            debit: 0,
            credit: 1000,
            description: 'Crédito a Ventas',
          },
        ],
      };

      await expect(
        voucherService.createVoucher(testCompany.id, voucherData),
      ).rejects.toThrow();
    });
  });

  describe('Account Management Integration', () => {
    it('should create account hierarchy correctly', async () => {
      const parentAccount = testAccounts[0]; // Caja

      const subaccountData = {
        code: '101.1',
        name: 'Caja Principal',
        description: 'Caja principal',
        level: 4,
        nature: 'deudora',
        type: 'asset',
        groupNumber: '1',
        isActive: true,
        allowsMovements: true,
        parentAccountId: parentAccount.id,
      };

      const subaccount = await accountService.createSubaccount(testCompany.id, {
        accountId: parentAccount.id,
        subaccountCode: subaccountData.code,
        subaccountName: subaccountData.name,
        description: subaccountData.description,
      });

      expect(subaccount).toBeDefined();
      expect(subaccount.code).toBe('101.1');
      expect(subaccount.name).toBe('Caja Principal');
      expect(subaccount.parentAccountId).toBe(parentAccount.id);
      expect(subaccount.level).toBe(4);

      // Verify subaccount can be retrieved
      const subaccounts = await accountService.getSubaccountsByAccount(
        testCompany.id,
        parentAccount.id,
      );
      expect(subaccounts).toHaveLength(1);
      expect(subaccounts[0].id).toBe(subaccount.id);
    });

    it('should filter accounts by level correctly', async () => {
      const level3Accounts = await accountService.findAllAccounts(
        testCompany.id,
        {
          level: '3',
        },
      );

      expect(level3Accounts.length).toBeGreaterThan(0);
      expect(level3Accounts.every((account) => account.level === 3)).toBe(true);

      const level4Accounts = await accountService.findAllAccounts(
        testCompany.id,
        {
          level: '4',
        },
      );

      expect(level4Accounts.every((account) => account.level === 4)).toBe(true);
    });
  });

  describe('Financial Reports Integration', () => {
    beforeEach(async () => {
      // Create test vouchers for reports
      const voucherData1: CreateVoucherDto = {
        description: 'Voucher para Reportes 1',
        date: '2026-01-10',
        lines: [
          {
            accountCode: '101',
            debit: 5000,
            credit: 0,
            description: 'Aumento de caja',
          },
          {
            accountCode: '601',
            debit: 0,
            credit: 5000,
            description: 'Ingreso por ventas',
          },
        ],
      };

      const voucherData2: CreateVoucherDto = {
        description: 'Voucher para Reportes 2',
        date: '2026-01-20',
        lines: [
          {
            accountCode: '102',
            debit: 3000,
            credit: 0,
            description: 'Aumento de banco',
          },
          {
            accountCode: '601',
            debit: 0,
            credit: 3000,
            description: 'Ingreso por ventas',
          },
        ],
      };

      await voucherService.createVoucher(testCompany.id, voucherData1);
      await voucherService.createVoucher(testCompany.id, voucherData2);
    });

    it('should generate trial balance correctly', async () => {
      const trialBalance = await reportService.getTrialBalance(
        testCompany.id,
        testPeriod.startDate,
        testPeriod.endDate,
      );

      expect(trialBalance).toBeDefined();
      expect(Array.isArray(trialBalance)).toBe(true);

      // Verify totals balance
      const totalDebit = trialBalance.reduce((sum, account) => {
        const debit = account.periodDebit || 0;
        return sum + debit;
      }, 0);

      const totalCredit = trialBalance.reduce((sum, account) => {
        const credit = account.periodCredit || 0;
        return sum + credit;
      }, 0);

      expect(Math.abs(totalDebit - totalCredit)).toBeLessThan(0.01);
    });

    it('should generate balance sheet correctly', async () => {
      const balanceSheet = await reportService.getBalanceSheet(
        testCompany.id,
        testPeriod.endDate,
      );

      expect(balanceSheet).toBeDefined();
      expect(balanceSheet.assets).toBeDefined();
      expect(balanceSheet.liabilities).toBeDefined();
      expect(balanceSheet.equity).toBeDefined();

      // Verify balance sheet structure
      expect(Array.isArray(balanceSheet.assets)).toBe(true);
      expect(Array.isArray(balanceSheet.liabilities)).toBe(true);
      expect(Array.isArray(balanceSheet.equity)).toBe(true);
    });

    it('should generate income statement correctly', async () => {
      const incomeStatement = await reportService.getIncomeStatement(
        testCompany.id,
        testPeriod.startDate,
        testPeriod.endDate,
      );

      expect(incomeStatement).toBeDefined();
      expect(incomeStatement.income).toBeDefined();
      expect(incomeStatement.expenses).toBeDefined();
      expect(incomeStatement.totals).toBeDefined();

      const totalIncome = parseFloat(
        String(incomeStatement.totals.totalIncome || '0'),
      );
      const totalExpenses = parseFloat(
        String(incomeStatement.totals.totalExpenses || '0'),
      );
      const netIncome = parseFloat(
        String(incomeStatement.totals.netIncome || '0'),
      );

      expect(totalIncome).toBeGreaterThan(0);
      expect(netIncome).toBe(totalIncome - totalExpenses);
    });
  });

  describe('Voucher Update Integration', () => {
    let createdVoucher: any;

    beforeEach(async () => {
      const voucherData: CreateVoucherDto = {
        description: 'Voucher para Update',
        date: '2026-01-15',
        lines: [
          {
            accountCode: '101',
            debit: 1000,
            credit: 0,
            description: 'Débito original',
          },
          {
            accountCode: '601',
            debit: 0,
            credit: 1000,
            description: 'Crédito original',
          },
        ],
      };

      createdVoucher = await voucherService.createVoucher(
        testCompany.id,
        voucherData,
      );
    });

    it('should update voucher in draft status', async () => {
      const updateData = {
        description: 'Voucher Actualizado',
        lines: [
          {
            accountCode: '101',
            debit: 1500,
            credit: 0,
            description: 'Débito actualizado',
          },
          {
            accountCode: '601',
            debit: 0,
            credit: 1500,
            description: 'Crédito actualizado',
          },
        ],
      };

      const updatedVoucher = await voucherService.updateVoucher(
        testCompany.id,
        createdVoucher.id,
        updateData,
      );

      expect(updatedVoucher.description).toBe('Voucher Actualizado');
      expect(updatedVoucher.totalAmount).toBe(1500);
      expect(updatedVoucher.lines).toHaveLength(2);

      // Verify balance is maintained
      const totalDebit = updatedVoucher.lines.reduce(
        (sum, line) => sum + line.debit,
        0,
      );
      const totalCredit = updatedVoucher.lines.reduce(
        (sum, line) => sum + line.credit,
        0,
      );
      expect(totalDebit).toBe(totalCredit);
    });

    it('should reject update of confirmed voucher', async () => {
      // First confirm the voucher
      await voucherService.updateVoucherStatus(
        testCompany.id,
        createdVoucher.id,
        'posted',
      );

      const updateData = {
        description: 'Intento de actualizar',
      };

      await expect(
        voucherService.updateVoucher(
          testCompany.id,
          createdVoucher.id,
          updateData,
        ),
      ).rejects.toThrow();
    });
  });

  describe('Period Validation Integration', () => {
    it('should reject voucher outside fiscal year', async () => {
      const voucherData: CreateVoucherDto = {
        description: 'Voucher fuera de año fiscal',
        date: '2025-12-31', // Outside fiscal year 2026
        lines: [
          {
            accountCode: '101',
            debit: 1000,
            credit: 0,
            description: 'Débito fuera de período',
          },
          {
            accountCode: '601',
            debit: 0,
            credit: 1000,
            description: 'Crédito fuera de período',
          },
        ],
      };

      await expect(
        voucherService.createVoucher(testCompany.id, voucherData),
      ).rejects.toThrow();
    });

    it('should reject voucher for inactive period', async () => {
      // Deactivate the test period
      await moduleRef.get('AccountingPeriodRepository').update(testPeriod.id, {
        isActive: false,
      });

      const voucherData: CreateVoucherDto = {
        description: 'Voucher en período inactivo',
        date: '2026-01-15',
        lines: [
          {
            accountCode: '101',
            debit: 1000,
            credit: 0,
            description: 'Débito en período inactivo',
          },
          {
            accountCode: '601',
            debit: 0,
            credit: 1000,
            description: 'Crédito en período inactivo',
          },
        ],
      };

      await expect(
        voucherService.createVoucher(testCompany.id, voucherData),
      ).rejects.toThrow();

      // Reactivate period for other tests
      await moduleRef.get('AccountingPeriodRepository').update(testPeriod.id, {
        isActive: true,
      });
    });
  });
});
