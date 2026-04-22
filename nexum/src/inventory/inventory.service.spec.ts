/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { InventoryService } from './inventory.service';
import { Repository } from 'typeorm';
import { Inventory } from '../entities/inventory.entity';
import { Movement } from '../entities/movement.entity';
import { getRepositoryToken } from '@nestjs/typeorm';

describe('InventoryService', () => {
  let service: InventoryService;
  let inventoryRepo: Repository<Inventory>;
  let movementRepo: Repository<Movement>;

  const mockInventory: Inventory = {
    id: 1,
    companyId: 1,
    productCode: 'PROD001',
    productName: 'Test Product',
    productDescription: 'Test Description',
    productUnit: 'units',
    entries: 100,
    exits: 20,
    stock: 80,
    stockLimit: 10,
    unitPrice: 99.99,
    warehouse: 'Warehouse A',
    entity: 'Entity A',
    createdAt: new Date(),
    updatedAt: new Date(),
    company: {} as any,
  };

  const mockMovement: Movement = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    companyId: 1,
    movementType: 'entry',
    productCode: 'PROD001',
    quantity: 10,
    reason: 'Test entry',
    label: 'Test label',
    sourceWarehouse: 'Warehouse A',
    destinationWarehouse: null,
    userName: 'Test User',
    purchaseId: 'PURCHASE001',
    createdAt: new Date(),
    company: {} as any,
  };

  const mockInventoryRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOneBy: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockMovementRepo = {
    find: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        {
          provide: getRepositoryToken(Inventory),
          useValue: mockInventoryRepo,
        },
        {
          provide: getRepositoryToken(Movement),
          useValue: mockMovementRepo,
        },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
    inventoryRepo = module.get<Repository<Inventory>>(
      getRepositoryToken(Inventory),
    );
    movementRepo = module.get<Repository<Movement>>(
      getRepositoryToken(Movement),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getInventory', () => {
    it('should return inventory for a company', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockInventory]),
      };

      jest
        .spyOn(inventoryRepo, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);

      const result = await service.getInventory(1);

      expect(result).toEqual({ inventory: [mockInventory] });
      expect(inventoryRepo.createQueryBuilder).toHaveBeenCalledWith('inv');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'inv.company_id = :companyId',
        { companyId: 1 },
      );
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'inv.product_name',
        'ASC',
      );
    });

    it('should apply filters correctly', async () => {
      const filters = {
        product: 'test',
        warehouse: 'Warehouse A',
        entity: 'Entity A',
        minStock: 5,
        maxStock: 100,
        fromDate: '2023-01-01',
        toDate: '2023-12-31',
      };

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockInventory]),
      };

      jest
        .spyOn(inventoryRepo, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);

      await service.getInventory(1, filters);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(LOWER(inv.product_name) LIKE :search OR LOWER(inv.product_code) LIKE :search OR LOWER(inv.product_description) LIKE :search)',
        { search: '%test%' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'inv.warehouse = :warehouse',
        {
          warehouse: 'Warehouse A',
        },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'inv.entity = :entity',
        {
          entity: 'Entity A',
        },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'inv.stock >= :minStock',
        {
          minStock: 5,
        },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'inv.stock <= :maxStock',
        {
          maxStock: 100,
        },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'inv.created_at >= :fromDate',
        {
          fromDate: '2023-01-01',
        },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'inv.created_at <= :toDate',
        {
          toDate: '2023-12-31',
        },
      );
    });
  });

  describe('findByCode', () => {
    it('should find inventory by product code and company', async () => {
      jest.spyOn(inventoryRepo, 'findOneBy').mockResolvedValue(mockInventory);

      const result = await service.findByCode(1, 'PROD001');

      expect(result).toEqual(mockInventory);
      expect(inventoryRepo.findOneBy).toHaveBeenCalledWith({
        companyId: 1,
        productCode: 'PROD001',
      });
    });

    it('should return null when not found', async () => {
      jest.spyOn(inventoryRepo, 'findOneBy').mockResolvedValue(null);

      const result = await service.findByCode(1, 'NONEXISTENT');

      expect(result).toBeNull();
    });
  });

  describe('updateStock', () => {
    it('should update stock for entry', async () => {
      const updatedInventory = { ...mockInventory, entries: 110, stock: 90 };
      jest.spyOn(inventoryRepo, 'findOneBy').mockResolvedValue(mockInventory);
      jest.spyOn(inventoryRepo, 'save').mockResolvedValue(updatedInventory);

      const result = await service.updateStock(1, 'PROD001', 10, 'entry');

      expect(result).toEqual(updatedInventory);
      expect(inventoryRepo.findOneBy).toHaveBeenCalledWith({
        companyId: 1,
        productCode: 'PROD001',
      });
      expect(inventoryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          entries: 110,
          stock: 90,
        }),
      );
    });

    it('should update stock for exit', async () => {
      const baseInventory = {
        ...mockInventory,
        entries: 100,
        exits: 20,
        stock: 80,
      };
      const updatedInventory = { ...baseInventory, exits: 30, stock: 70 };
      jest.spyOn(inventoryRepo, 'findOneBy').mockResolvedValue(baseInventory);
      jest.spyOn(inventoryRepo, 'save').mockResolvedValue(updatedInventory);

      const result = await service.updateStock(1, 'PROD001', 10, 'exit');

      expect(result).toEqual(updatedInventory);
      expect(inventoryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          exits: 30,
          stock: 70,
        }),
      );
    });

    it('should throw NotFoundException when product not found', async () => {
      jest.spyOn(inventoryRepo, 'findOneBy').mockResolvedValue(null);

      await expect(
        service.updateStock(1, 'NONEXISTENT', 10, 'entry'),
      ).rejects.toThrow('Producto NONEXISTENT no encontrado');
    });

    it('should throw BadRequestException when insufficient stock for exit', async () => {
      const lowStockItem = { ...mockInventory, entries: 100, exits: 20, stock: 80 };
      jest.spyOn(inventoryRepo, 'findOneBy').mockResolvedValue(lowStockItem);

      await expect(
        service.updateStock(1, 'PROD001', 100, 'exit'),
      ).rejects.toThrow(
        'Stock insuficiente para Test Product. Disponible: 80, Requerido: 100',
      );
    });
  });

  describe('ensureProduct', () => {
    it('should create new product if not exists', async () => {
      const productData = {
        productCode: 'NEW001',
        productName: 'New Product',
        productUnit: 'kg',
        unitPrice: 50.0,
        warehouse: 'Warehouse B',
        entity: 'Entity B',
        productDescription: 'New Description',
      };

      const newInventory = { ...mockInventory, id: 2, ...productData };
      jest.spyOn(inventoryRepo, 'findOneBy').mockResolvedValue(null);
      jest.spyOn(inventoryRepo, 'create').mockReturnValue(newInventory as any);
      jest.spyOn(inventoryRepo, 'save').mockResolvedValue(newInventory);

      const result = await service.ensureProduct(1, productData);

      expect(result).toEqual(newInventory);
      expect(inventoryRepo.findOneBy).toHaveBeenCalledWith({
        companyId: 1,
        productCode: 'NEW001',
      });
      expect(inventoryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          productCode: 'NEW001',
          productName: 'New Product',
          companyId: 1,
          entries: 0,
          exits: 0,
          stock: 0,
        }),
      );
    });

    it('should update existing product unit price if provided', async () => {
      const productData = {
        productCode: 'PROD001',
        productName: 'Test Product',
        unitPrice: 150.0,
      };

      const updatedInventory = { ...mockInventory, unitPrice: 150.0 };
      jest.spyOn(inventoryRepo, 'findOneBy').mockResolvedValue(mockInventory);
      jest.spyOn(inventoryRepo, 'save').mockResolvedValue(updatedInventory);

      const result = await service.ensureProduct(1, productData);

      expect(result).toEqual(updatedInventory);
      expect(inventoryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          unitPrice: 150.0,
        }),
      );
    });

    it('should return existing product if no unit price update needed', async () => {
      const productData = {
        productCode: 'PROD001',
        productName: 'Test Product',
      };

      jest.spyOn(inventoryRepo, 'findOneBy').mockResolvedValue(mockInventory);

      const result = await service.ensureProduct(1, productData);

      expect(result).toEqual(mockInventory);
      expect(inventoryRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('getLowStockItems', () => {
    it('should return items with low stock', async () => {
      const lowStockInventory = { ...mockInventory, stock: 5, stockLimit: 10 };
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([lowStockInventory]),
      };

      jest
        .spyOn(inventoryRepo, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);

      const result = await service.getLowStockItems(1);

      expect(result).toEqual([lowStockInventory]);
      expect(inventoryRepo.createQueryBuilder).toHaveBeenCalledWith('inv');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'inv.company_id = :companyId',
        { companyId: 1 },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'inv.stock_limit > 0',
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'inv.stock <= inv.stock_limit',
      );
    });
  });

  describe('getProductHistory', () => {
    it('should return product history with movements', async () => {
      const baseInventory = {
        ...mockInventory,
        entries: 100,
        exits: 20,
        stock: 80,
      };
      const movements = [mockMovement];
      jest.spyOn(inventoryRepo, 'findOneBy').mockResolvedValue(baseInventory);
      jest.spyOn(movementRepo, 'find').mockResolvedValue(movements);

      const result = await service.getProductHistory(1, 'PROD001');

      expect(result).toEqual({
        productCode: 'PROD001',
        productName: 'Test Product',
        currentStock: 80,
        entries: 100,
        exits: 20,
        movements,
      });
      expect(inventoryRepo.findOneBy).toHaveBeenCalledWith({
        companyId: 1,
        productCode: 'PROD001',
      });
      expect(movementRepo.find).toHaveBeenCalledWith({
        where: { productCode: 'PROD001', companyId: 1 },
        order: { createdAt: 'DESC' },
      });
    });

    it('should throw NotFoundException when product not found', async () => {
      jest.spyOn(inventoryRepo, 'findOneBy').mockResolvedValue(null);

      await expect(service.getProductHistory(1, 'NONEXISTENT')).rejects.toThrow(
        'Producto no encontrado',
      );
    });
  });
});
