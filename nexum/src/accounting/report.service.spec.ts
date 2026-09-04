import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReportService, ReportOptions } from './report.service';
import { VoucherLine } from '../entities/voucher-line.entity';
import { Voucher } from '../entities/voucher.entity';
import { Account } from '../entities/account.entity';
import { GeneratedReport } from '../entities/generated-report.entity';
import { FiscalYear } from '../entities/fiscal-year.entity';
import { Company } from '../entities/company.entity';
import { CacheService } from '../cache/cache.service';

describe('ReportService', () => {
  let service: ReportService;

  const mockVoucherLineRepo = {
    createQueryBuilder: jest.fn(),
    query: jest.fn(),
  };

  const mockVoucherRepo = {
    createQueryBuilder: jest.fn(),
  };

  const mockAccountRepo = {};
  const mockGeneratedReportRepo = {};
  const mockFiscalYearRepo = {};

  const mockCompanyRepo = {
    findOne: jest.fn(),
  };

  const mockCacheService = {
    getOrSet: jest.fn((key: string, fn: () => any) => fn()),
    invalidatePattern: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportService,
        {
          provide: getRepositoryToken(VoucherLine),
          useValue: mockVoucherLineRepo,
        },
        {
          provide: getRepositoryToken(Voucher),
          useValue: mockVoucherRepo,
        },
        {
          provide: getRepositoryToken(Account),
          useValue: mockAccountRepo,
        },
        {
          provide: getRepositoryToken(GeneratedReport),
          useValue: mockGeneratedReportRepo,
        },
        {
          provide: getRepositoryToken(FiscalYear),
          useValue: mockFiscalYearRepo,
        },
        {
          provide: getRepositoryToken(Company),
          useValue: mockCompanyRepo,
        },
        {
          provide: CacheService,
          useValue: mockCacheService,
        },
      ],
    }).compile();

    service = module.get<ReportService>(ReportService);
  });

  describe('filters', () => {
    it('should return only posted vouchers by default', () => {
      expect((service as any)['voucherStatuses']()).toEqual(['posted']);
    });

    it('should include drafts when includeDrafts is true', () => {
      expect((service as any)['voucherStatuses'](true)).toEqual([
        'posted',
        'draft',
      ]);
    });

    it('should build a cache key with the active filter flags', () => {
      expect(
        (service as any)['optionsCacheKey']({
          includeDrafts: true,
          beforeClosing: true,
          accountsOnly: true,
        }),
      ).toBe('drafts:preclose:accounts');
    });

    it('should apply status and before-closing filters to a query builder', () => {
      const qb = { andWhere: jest.fn().mockReturnThis() } as any;

      (service as any)['applyVoucherFilters'](qb, {
        includeDrafts: true,
        beforeClosing: true,
      });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'v.status IN (:...statuses)',
        { statuses: ['posted', 'draft'] },
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        'v.type != :closingType',
        { closingType: 'cierre' },
      );
    });
  });

  describe('account range parsing', () => {
    it('should translate numeric ranges into CAST predicates', () => {
      const qb = { andWhere: jest.fn().mockReturnThis() } as any;

      (service as any)['applyCodeRanges'](qb, ['900-913', '805-809']);

      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining(
          "SPLIT_PART(vl.account_code, '-', 1) ~ '^[0-9]+$'",
        ),
        expect.objectContaining({
          from0: 900,
          to0: 913,
          from1: 805,
          to1: 809,
        }),
      );
    });

    it('should treat single codes as equality predicates', () => {
      const qb = { andWhere: jest.fn().mockReturnThis() } as any;

      (service as any)['applyCodeRanges'](qb, ['849', '873']);

      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining("= :code0"),
        expect.objectContaining({ code0: '849', code1: '873' }),
      );
    });
  });

  describe('SIEN 5921 - Estado de Rendimiento Financiero', () => {
    const defaultOptions: ReportOptions = {
      includeDrafts: true,
      beforeClosing: true,
      accountsOnly: true,
    };

    beforeEach(() => {
      mockCompanyRepo.findOne.mockResolvedValue({
        id: 1,
        name: 'Empresa de prueba',
        taxId: '123456789',
      });

      jest
        .spyOn(service as any, 'getAccountRangePeriodAmount')
        .mockImplementation(
          async (_: number, codeRanges: string[], ...args: any[]) => {
            const range = codeRanges[0];

            const creditRanges: Record<string, number> = {
              '900-913': 10000,
              '920-922': 500,
              '950-952': 300,
            };

            const debitRanges: Record<string, number> = {
              '805-809': 1300,
              '810-813': 4000,
              '822-824': 600,
              '826-833': 1200,
              '835-838': 800,
              '845-848': 500,
              '849': 100,
              '855-864': 700,
              '865-866': 200,
              '873': 50,
            };

            const lastArg = args[args.length - 1];
            const options =
              typeof lastArg === 'object' && lastArg !== null
                ? lastArg
                : undefined;

            return {
              debit: debitRanges[range] ?? 0,
              credit: creditRanges[range] ?? 0,
              passedOptions: options,
            };
          },
        );
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should call the official 5921 account ranges in order', async () => {
      await service.getEfe5921Data(1, '2024-01-01', '2024-01-31', defaultOptions);

      const ranges = (service as any)['getAccountRangePeriodAmount'].mock.calls.map(
        (call: any[]) => call[1][0],
      );

      expect(ranges).toEqual([
        '900-913',
        '805-809',
        '810-813',
        '822-824',
        '826-833',
        '835-838',
        '845-848',
        '849',
        '855-864',
        '865-866',
        '873',
        '920-922',
        '950-952',
      ]);
    });

    it('should pass report options to the underlying range queries', async () => {
      await service.getEfe5921Data(1, '2024-01-01', '2024-01-31', defaultOptions);

      const calls = (service as any)['getAccountRangePeriodAmount'].mock.calls;
      for (const call of calls) {
        expect(call[call.length - 1]).toEqual(defaultOptions);
      }
    });

    it('should compute subtotals using the official 5921 formulas', async () => {
      const data = await service.getEfe5921Data(
        1,
        '2024-01-01',
        '2024-01-31',
        defaultOptions,
      );

      // Ventas - Impuesto sobre ventas
      expect(data.lineas.ventas.real).toBe(10000);
      expect(data.lineas.impuestoVentas.real).toBe(1300);
      expect(data.lineas.ventasNetas.real).toBe(8700);

      // Utilidad bruta = ventas netas - costo de ventas
      expect(data.lineas.utilidadBrutaVentas.real).toBe(4700);

      // Utilidad neta en ventas = utilidad bruta (no se restan gastos administrativos)
      expect(data.lineas.utilidadNetaVentas.real).toBe(4700);

      // Utilidad operaciones = utilidad neta en ventas - gastos de operación
      expect(data.lineas.utilidadOperaciones.real).toBe(3500);

      // Utilidad antes de impuesto = utilidad operaciones
      // menos gastos financieros, pérdidas, impuestos y otros gastos,
      // más ingresos financieros y otros ingresos
      const expected =
        3500 - 800 - 500 - 100 - 700 - 200 - 50 + 500 + 300;
      expect(data.lineas.utilidadAntesImpuesto.real).toBe(expected);
    });
  });

  describe('SIEN 5923 - Estado de Resultados', () => {
    it('should cover the complete 900-949 income range without gaps', async () => {
      mockCompanyRepo.findOne.mockResolvedValue({
        id: 1,
        name: 'Empresa de prueba',
        taxId: '123456789',
        incomeTaxRate: 35,
      });

      jest
        .spyOn(service as any, 'getAccountRangePeriodAmount')
        .mockImplementation(async (_: number, codeRanges: string[]) => {
          const map: Record<string, { debit: number; credit: number }> = {
            '900-915': { debit: 0, credit: 12000 },
            '916-949': { debit: 0, credit: 800 },
            '814-815': { debit: 3000, credit: 0 },
            '810-813': { debit: 2000, credit: 0 },
            '820-824': { debit: 500, credit: 0 },
            '826-834': { debit: 700, credit: 0 },
            '835-839': { debit: 300, credit: 0 },
            '950-953': { debit: 0, credit: 1000 },
            '845-849': { debit: 400, credit: 0 },
          };

          return map[codeRanges[0]] ?? { debit: 0, credit: 0 };
        });

      const data = await service.getEfe5923Data(
        1,
        '2024-01-01',
        '2024-01-31',
        { includeDrafts: true },
      );

      expect(data.ingresos.ventasNetas.real).toBe(12000);
      expect(data.ingresos.otrosIngresos.real).toBe(800);
      expect(data.ingresos.totalIngresos.real).toBe(12800);

      expect(data.costoVentas.totalCostoVentas.real).toBe(5000);

      const utilidadBruta = 12800 - 5000;
      expect(data.utilidadBruta.real).toBe(utilidadBruta);

      const totalGastosOperativos = 500 + 700 + 300;
      expect(data.gastosOperativos.totalGastosOperativos.real).toBe(
        totalGastosOperativos,
      );

      const utilidadOperativa = utilidadBruta - totalGastosOperativos;
      expect(data.utilidadOperativa.real).toBe(utilidadOperativa);

      const totalOtros = 1000 - 400;
      const utilidadAntesImpuestos = utilidadOperativa + totalOtros;
      expect(data.utilidadAntesImpuestos.real).toBe(utilidadAntesImpuestos);

      const impuestoRenta = utilidadAntesImpuestos * 0.35;
      expect(data.impuestoRenta.real).toBeCloseTo(impuestoRenta);
      expect(data.utilidadNeta.real).toBeCloseTo(
        utilidadAntesImpuestos - impuestoRenta,
      );

      jest.restoreAllMocks();
    });
  });
});
