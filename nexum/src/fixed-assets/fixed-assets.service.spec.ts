import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { FixedAssetsService } from './fixed-assets.service';
import { FixedAsset } from '../entities/fixed-asset.entity';
import { FixedAssetArea } from '../entities/fixed-asset-area.entity';
import { DepreciationCatalog } from '../entities/depreciation-catalog.entity';
import { DepreciationHistory } from '../entities/depreciation-history.entity';
import { FixedAssetInventory } from '../entities/fixed-asset-inventory.entity';
import { Employee } from '../entities/employee.entity';
import { Supplier } from '../entities/supplier.entity';
import { CostCenter } from '../entities/cost-center.entity';
import { VoucherService } from '../accounting/voucher.service';
import { AccountMappingService } from '../accounting/account-mapping.service';
import { AuditService } from '../audit/audit.service';
import { FinanceService } from '../finance/finance.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

const makeMockRepo = (): any => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findOneBy: jest.fn(),
  findAndCount: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
  softRemove: jest.fn(),
  count: jest.fn(),
  createQueryBuilder: jest.fn().mockReturnValue({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
  } as any),
});

describe('FixedAssetsService regression (AFT NCC Cuba)', () => {
  let service: FixedAssetsService;
  let assetRepo: Repository<FixedAsset>;
  let historyRepo: Repository<DepreciationHistory>;
  let voucherService: VoucherService;

  const mockVoucherService = {
    findVouchersBySourceDocumentId: jest.fn(),
    createVoucherFromModule: jest.fn(),
  };

  const mockAccountMappingService = {
    getAccountForMapping: jest.fn().mockResolvedValue(null),
  };

  const mockAuditService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  const mockFinanceService = {
    findAllPayables: jest.fn().mockResolvedValue([]),
  };

  const mockDataSource = {
    manager: {
      transaction: jest.fn().mockImplementation(async (cb: any) => cb({
        getRepository: () => ({ find: jest.fn(), save: jest.fn() }),
        save: jest.fn(),
      } as unknown as EntityManager)),
    },
  } as unknown as DataSource;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FixedAssetsService,
        {
          provide: getRepositoryToken(FixedAsset),
          useValue: makeMockRepo(),
        },
        {
          provide: getRepositoryToken(FixedAssetArea),
          useValue: makeMockRepo(),
        },
        {
          provide: getRepositoryToken(DepreciationCatalog),
          useValue: makeMockRepo(),
        },
        {
          provide: getRepositoryToken(DepreciationHistory),
          useValue: makeMockRepo(),
        },
        {
          provide: getRepositoryToken(FixedAssetInventory),
          useValue: makeMockRepo(),
        },
        {
          provide: getRepositoryToken(Employee),
          useValue: makeMockRepo(),
        },
        {
          provide: getRepositoryToken(Supplier),
          useValue: makeMockRepo(),
        },
        {
          provide: getRepositoryToken(CostCenter),
          useValue: makeMockRepo(),
        },
        { provide: VoucherService, useValue: mockVoucherService },
        { provide: AccountMappingService, useValue: mockAccountMappingService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: FinanceService, useValue: mockFinanceService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<FixedAssetsService>(FixedAssetsService);
    assetRepo = module.get<Repository<FixedAsset>>(getRepositoryToken(FixedAsset));
    historyRepo = module.get<Repository<DepreciationHistory>>(getRepositoryToken(DepreciationHistory));
    voucherService = module.get<VoucherService>(VoucherService);

    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('Bloqueo de eliminación (H3)', () => {
    it('debe rechazar DELETE si el activo tiene comprobantes contables asociados', async () => {
      const asset = {
        id: 1,
        assetCode: 'AFT-001',
        companyId: 1,
        status: 'active',
        investigationStatus: null,
      } as unknown as FixedAsset;

      jest.spyOn(assetRepo, 'findOneBy').mockResolvedValue(asset);
      jest.spyOn(voucherService, 'findVouchersBySourceDocumentId').mockResolvedValue([{ id: 'V1' }] as any);
      jest.spyOn(historyRepo, 'count').mockResolvedValue(0);

      await expect(service.remove(1, 1)).rejects.toThrow(BadRequestException);
      expect(voucherService.findVouchersBySourceDocumentId).toHaveBeenCalledWith(1, '1');
    });

    it('debe rechazar DELETE si el activo tiene historial de depreciación', async () => {
      const asset = {
        id: 2,
        assetCode: 'AFT-002',
        companyId: 1,
        status: 'active',
        investigationStatus: null,
      } as unknown as FixedAsset;

      jest.spyOn(assetRepo, 'findOneBy').mockResolvedValue(asset);
      jest.spyOn(voucherService, 'findVouchersBySourceDocumentId').mockResolvedValue([]);
      jest.spyOn(historyRepo, 'count').mockResolvedValue(3);

      await expect(service.remove(1, 2)).rejects.toThrow(BadRequestException);
    });

    it('debe rechazar DELETE si el activo tiene una investigación pendiente', async () => {
      const asset = {
        id: 3,
        assetCode: 'AFT-003',
        companyId: 1,
        status: 'active',
        investigationStatus: 'pending',
        investigationType: 'shortage',
      } as unknown as FixedAsset;

      jest.spyOn(assetRepo, 'findOneBy').mockResolvedValue(asset);
      jest.spyOn(voucherService, 'findVouchersBySourceDocumentId').mockResolvedValue([]);
      jest.spyOn(historyRepo, 'count').mockResolvedValue(0);

      await expect(service.remove(1, 3)).rejects.toThrow(BadRequestException);
    });
  });

  describe('Estadísticas (H2 + H16)', () => {
    it('debe incluir fullyDepreciatedCount y transferredCount', async () => {
      const assets = [
        { status: 'active', acquisitionValue: 100, currentValue: 100, accumulatedDepreciation: 0 },
        { status: 'fully_depreciated', acquisitionValue: 100, currentValue: 0, accumulatedDepreciation: 100 },
        { status: 'transferred', acquisitionValue: 200, currentValue: 200, accumulatedDepreciation: 0 },
        { status: 'disposed', acquisitionValue: 50, currentDepreciation: 50, accumulatedDepreciation: 50 },
      ] as unknown as FixedAsset[];

      jest.spyOn(assetRepo, 'find').mockResolvedValue(assets);

      const result = await service.getStatistics(1);

      expect(result.totalAssets).toBe(4);
      expect(result.activeCount).toBe(1);
      expect(result.fullyDepreciatedCount).toBe(1);
      expect(result.transferredCount).toBe(1);
      expect(result.totalDepreciation).toBe(150);
    });
  });

  describe('Bloqueo de baja directa en update', () => {
    it('debe impedir cambiar manualmente el estado a disposed', async () => {
      const asset = {
        id: 1,
        assetCode: 'AFT-001',
        companyId: 1,
        status: 'active',
      } as unknown as FixedAsset;

      jest.spyOn(assetRepo, 'findOneBy').mockResolvedValue(asset);

      await expect(service.update(1, 1, { status: 'disposed' }))
        .rejects
        .toThrow(BadRequestException);
    });
  });
});
