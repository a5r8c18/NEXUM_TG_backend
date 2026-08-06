import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { InventoryWarehouse } from '../entities/inventory-warehouse.entity';
import { Movement } from '../entities/movement.entity';
import { WarehousesService } from '../warehouses/warehouses.service';

@Injectable()
export class InventoryWarehouseService {
  constructor(
    @InjectRepository(InventoryWarehouse)
    private readonly inventoryWarehouseRepo: Repository<InventoryWarehouse>,
    @InjectRepository(Movement)
    private readonly movementRepo: Repository<Movement>,
    private readonly warehousesService: WarehousesService,
  ) {}

  // Obtener inventario por empresa y almacén
  async findByCompanyAndWarehouse(
    companyId: number,
    warehouseId: string,
  ): Promise<InventoryWarehouse[]> {
    return this.inventoryWarehouseRepo.find({
      where: { companyId, warehouseId, isActive: true },
      order: { productName: 'ASC' },
    });
  }

  // Obtener inventario por empresa, producto y almacén
  async findByCompanyProductAndWarehouse(
    companyId: number,
    productCode: string,
    warehouseId: string,
    manager?: EntityManager,
  ): Promise<InventoryWarehouse | null> {
    const repo = manager ? manager.getRepository(InventoryWarehouse) : this.inventoryWarehouseRepo;
    return repo.findOne({
      where: { companyId, productCode, warehouseId, isActive: true },
    });
  }

  // Obtener todo el inventario de una empresa
  async findByCompany(companyId: number): Promise<InventoryWarehouse[]> {
    return this.inventoryWarehouseRepo.find({
      where: { companyId, isActive: true },
      order: { warehouseName: 'ASC', productName: 'ASC' },
    });
  }

  // Obtener producto específico
  async findByCode(
    companyId: number,
    productCode: string,
  ): Promise<InventoryWarehouse[]> {
    return this.inventoryWarehouseRepo.find({
      where: { companyId, productCode, isActive: true },
      order: { warehouseName: 'ASC' },
    });
  }

  // Batch: obtener inventario para múltiples códigos de producto en una sola query
  async findByCodes(
    companyId: number,
    productCodes: string[],
  ): Promise<Map<string, InventoryWarehouse[]>> {
    if (!productCodes.length) return new Map();

    const unique = [...new Set(productCodes)];
    const rows = await this.inventoryWarehouseRepo.find({
      where: { companyId, productCode: In(unique), isActive: true },
      order: { warehouseName: 'ASC' },
    });

    const map = new Map<string, InventoryWarehouse[]>();
    for (const code of unique) {
      map.set(code, []);
    }
    for (const row of rows) {
      map.get(row.productCode)!.push(row);
    }
    return map;
  }

  // Asegurar que exista un registro de inventario
  async ensureProduct(
    companyId: number,
    data: {
      productCode: string;
      productName: string;
      productDescription?: string;
      productUnit?: string;
      unitPrice?: number;
      warehouseId: string;
      entity?: string;
      location?: string;
    },
    manager?: EntityManager,
  ): Promise<InventoryWarehouse> {
    // Verificar que el almacén exista (soporta UUID o código de almacén)
    const warehouse = await this.warehousesService.findByIdOrCode(
      companyId,
      data.warehouseId,
    );
    if (!warehouse) {
      throw new NotFoundException(`Almacén ${data.warehouseId} no encontrado`);
    }

    let inventory = await this.findByCompanyProductAndWarehouse(
      companyId,
      data.productCode,
      data.warehouseId,
      manager,
    );

    const repo = manager ? manager.getRepository(InventoryWarehouse) : this.inventoryWarehouseRepo;
    if (!inventory) {
      inventory = repo.create({
        companyId,
        productCode: data.productCode,
        productName: data.productName,
        productDescription: data.productDescription || null,
        productUnit: data.productUnit || 'und',
        unitPrice: data.unitPrice || 0,
        warehouseId: data.warehouseId,
        warehouseName: warehouse.name,
        entity: data.entity || null,
        location: data.location || null,
        entries: 0,
        exits: 0,
        stock: 0,
        stockLimit: 0,
        isActive: true,
      });
      inventory = await repo.save(inventory);
    } else {
      // Completar datos que pudieron quedar con el valor por defecto al crearse
      const incomingUnit = data.productUnit?.trim();
      let dirty = false;

      if (
        incomingUnit &&
        incomingUnit !== inventory.productUnit &&
        (!inventory.productUnit || inventory.productUnit === 'und')
      ) {
        inventory.productUnit = incomingUnit;
        dirty = true;
      }

      if (data.productDescription && !inventory.productDescription) {
        inventory.productDescription = data.productDescription;
        dirty = true;
      }

      if (dirty) {
        inventory = await repo.save(inventory);
      }
    }

    return inventory;
  }

  // Actualizar stock en un almacén específico con Costo Promedio Ponderado
  async updateStock(
    companyId: number,
    productCode: string,
    warehouseId: string,
    quantityChange: number,
    type: 'entry' | 'exit',
    newUnitPrice?: number, // Para entradas con nuevo precio
    manager?: EntityManager,
  ): Promise<InventoryWarehouse> {
    const inventory = await this.findByCompanyProductAndWarehouse(
      companyId,
      productCode,
      warehouseId,
      manager,
    );

    if (!inventory) {
      throw new NotFoundException(
        `Producto ${productCode} no encontrado en almacén ${warehouseId}`,
      );
    }

    if (type === 'entry') {
      // Costo Promedio Ponderado (NCC Res. 235-2005 MFP)
      // IMPORTANTE: calcular ANTES de modificar el stock
      if (newUnitPrice && newUnitPrice > 0) {
        const previousStock = inventory.stock;
        const previousTotalValue = previousStock * inventory.unitPrice;
        const newTotalValue = quantityChange * newUnitPrice;
        const newStock = previousStock + quantityChange;
        
        // Fórmula: (stockAnterior × precioAnterior + cantidadNueva × precioNuevo) / stockNuevo
        if (newStock > 0) {
          inventory.unitPrice = (previousTotalValue + newTotalValue) / newStock;
          // Redondear a 2 decimales para precisión monetaria
          inventory.unitPrice = Math.round(inventory.unitPrice * 100) / 100;
        }
      }

      inventory.entries += quantityChange;
      inventory.stock += quantityChange;
    } else {
      if (inventory.stock < quantityChange) {
        throw new BadRequestException(
          `Stock insuficiente en almacén ${warehouseId}. ` +
          `Disponible: ${inventory.stock}, Requerido: ${quantityChange}`,
        );
      }
      inventory.exits += quantityChange;
      inventory.stock -= quantityChange;
      // En salidas, el unitPrice no cambia (WAC): el costo de salida usa el
      // promedio ponderado vigente al momento de la salida. NCC Res. 235-2005 MFP.
    }

    const repo = manager ? manager.getRepository(InventoryWarehouse) : this.inventoryWarehouseRepo;
    return repo.save(inventory);
  }

  // Costo Promedio Ponderado (WAC) de un producto a nivel de empresa.
  // Si hay varios almacenes, se calcula el promedio ponderado del inventario
  // disponible en todos ellos. NCC Res. 235-2005 MFP.
  async getWeightedAverageCost(
    companyId: number,
    productCode: string,
  ): Promise<{ unitCost: number; totalStock: number } | null> {
    const inventories = await this.findByCode(companyId, productCode);
    if (!inventories.length) return null;

    let totalStock = 0;
    let totalValue = 0;
    for (const inv of inventories) {
      totalStock += Number(inv.stock);
      totalValue += Number(inv.stock) * Number(inv.unitPrice);
    }

    if (totalStock <= 0) {
      // Sin existencias no hay promedio que calcular, pero devolver 0 haría que
      // una venta que agota el inventario se contabilizara con costo cero.
      // Se conserva el último costo unitario conocido de los almacenes.
      const lastKnownCost = inventories.reduce(
        (max, inv) => Math.max(max, Number(inv.unitPrice) || 0),
        0,
      );
      return { unitCost: lastKnownCost, totalStock: 0 };
    }
    return {
      unitCost: Math.round((totalValue / totalStock) * 100) / 100,
      totalStock,
    };
  }

  // Transferir stock entre almacenes
  async transferStock(
    companyId: number,
    data: {
      productCode: string;
      quantity: number;
      sourceWarehouseId: string;
      destinationWarehouseId: string;
      reason?: string;
    },
    manager?: EntityManager,
  ): Promise<{
    sourceInventory: InventoryWarehouse;
    destinationInventory: InventoryWarehouse;
  }> {
    // Validar que no sea el mismo almacén
    if (data.sourceWarehouseId === data.destinationWarehouseId) {
      throw new BadRequestException(
        'El almacén origen y destino no pueden ser el mismo',
      );
    }

    // Costo unitario del almacén origen ANTES de la salida: la transferencia
    // interna no puede alterar el valor total del inventario de la entidad
    // (NCC 3). El destino debe recibir la mercancía al costo con que sale del
    // origen y recalcular su propio promedio ponderado con ese costo.
    const source = await this.findByCompanyProductAndWarehouse(
      companyId,
      data.productCode,
      data.sourceWarehouseId,
      manager,
    );
    if (!source) {
      throw new NotFoundException(
        `Producto ${data.productCode} no encontrado en almacén origen ${data.sourceWarehouseId}`,
      );
    }
    const transferUnitCost = Number(source.unitPrice) || 0;

    // Reducir stock del almacén origen
    const sourceInventory = await this.updateStock(
      companyId,
      data.productCode,
      data.sourceWarehouseId,
      data.quantity,
      'exit',
      undefined,
      manager,
    );

    // El producto puede no existir aún en el almacén destino: se crea con
    // stock 0 para que la entrada pueda registrarse sobre él.
    await this.ensureProduct(
      companyId,
      {
        productCode: source.productCode,
        productName: source.productName,
        productDescription: source.productDescription || undefined,
        productUnit: source.productUnit,
        unitPrice: transferUnitCost,
        warehouseId: data.destinationWarehouseId,
        entity: source.entity || undefined,
        location: source.location || undefined,
      },
      manager,
    );

    // Aumentar stock en almacén destino al costo del origen
    const destinationInventory = await this.updateStock(
      companyId,
      data.productCode,
      data.destinationWarehouseId,
      data.quantity,
      'entry',
      transferUnitCost,
      manager,
    );

    return {
      sourceInventory,
      destinationInventory,
    };
  }

  // Obtener resumen de inventario por empresa
  async getInventorySummary(companyId: number): Promise<{
    totalProducts: number;
    totalStock: number;
    totalValue: number;
    warehouseCount: number;
    lowStockItems: InventoryWarehouse[];
  }> {
    const inventories = await this.findByCompany(companyId);
    
    const warehouseIds = new Set(inventories.map(i => i.warehouseId));
    
    const lowStockItems = inventories.filter(
      item => item.stockLimit > 0 && item.stock <= item.stockLimit,
    );

    const totalValue = inventories.reduce(
      (sum, item) => sum + (item.stock * item.unitPrice),
      0,
    );

    return {
      totalProducts: inventories.length,
      totalStock: inventories.reduce((sum, item) => sum + item.stock, 0),
      totalValue,
      warehouseCount: warehouseIds.size,
      lowStockItems,
    };
  }

  // Actualizar límite de stock
  async updateStockLimit(
    companyId: number,
    productCode: string,
    warehouseId: string,
    stockLimit: number,
  ): Promise<InventoryWarehouse> {
    const inventory = await this.findByCompanyProductAndWarehouse(
      companyId,
      productCode,
      warehouseId,
    );

    if (!inventory) {
      throw new NotFoundException(
        `Producto ${productCode} no encontrado en almacén ${warehouseId}`,
      );
    }

    inventory.stockLimit = stockLimit;
    return this.inventoryWarehouseRepo.save(inventory);
  }

  /**
   * INV-03: Submayor / Tarjeta de estiba de un producto en un almacén.
   * Reconstruye el kárdex desde los movimientos registrados, mostrando
   * entradas, salidas y saldo acumulado con costo promedio en cada línea.
   */
  async getSubledger(
    companyId: number,
    productCode: string,
    warehouseId: string,
    options?: { fromDate?: string; toDate?: string },
  ) {
    const inventory = await this.findByCompanyProductAndWarehouse(
      companyId,
      productCode,
      warehouseId,
    );
    if (!inventory) {
      throw new NotFoundException(
        `Producto ${productCode} no existe en almacén ${warehouseId}`,
      );
    }

    const qb = this.movementRepo
      .createQueryBuilder('m')
      .where('m.companyId = :companyId', { companyId })
      .andWhere('m.productCode = :productCode', { productCode })
      .andWhere(
        '(m.sourceWarehouse = :warehouseId OR m.destinationWarehouse = :warehouseId)',
        { warehouseId },
      )
      .orderBy('m.createdAt', 'ASC');

    if (options?.fromDate) {
      qb.andWhere('m.createdAt >= :fromDate', { fromDate: options.fromDate });
    }
    if (options?.toDate) {
      qb.andWhere('m.createdAt <= :toDate', { toDate: options.toDate });
    }

    const movements = await qb.getMany();

    let balance = 0;
    const rows = movements.map((m) => {
      const isIncoming =
        (['entry', 'return'].includes(m.movementType) &&
          m.destinationWarehouse === warehouseId) ||
        (m.movementType === 'transfer' && m.destinationWarehouse === warehouseId);
      const isOutgoing =
        (m.movementType === 'exit' && m.sourceWarehouse === warehouseId) ||
        (m.movementType === 'transfer' && m.sourceWarehouse === warehouseId);

      const qty = Number(m.quantity || 0);
      const quantityIn = isIncoming ? qty : 0;
      const quantityOut = isOutgoing ? qty : 0;
      balance += quantityIn - quantityOut;

      return {
        id: m.id,
        date: m.createdAt ? m.createdAt.toISOString().split('T')[0] : null,
        movementType: m.movementType,
        movementCode: m.movementCode,
        movementDescription: m.movementDescription,
        referenceNumber: m.label,
        documentNumber: m.purchaseId || m.relatedMovementId,
        quantityIn,
        quantityOut,
        balance,
        unitPrice: Number(m.unitPrice || 0),
        totalValue: Number(m.totalAmount || 0),
        entityName: m.entityName,
        notes: m.reason,
      };
    });

    return {
      productCode: inventory.productCode,
      productName: inventory.productName,
      productUnit: inventory.productUnit,
      warehouseId,
      warehouseName: inventory.warehouseName,
      currentBalance: inventory.stock,
      unitPrice: inventory.unitPrice,
      movements: rows,
      initialBalance: rows.length ? rows[0].balance - rows[0].quantityIn + rows[0].quantityOut : inventory.stock,
    };
  }

  // Desactivar registro de inventario
  async deactivate(
    companyId: number,
    productCode: string,
    warehouseId: string,
  ): Promise<void> {
    const inventory = await this.findByCompanyProductAndWarehouse(
      companyId,
      productCode,
      warehouseId,
    );

    if (!inventory) {
      throw new NotFoundException(
        `Producto ${productCode} no encontrado en almacén ${warehouseId}`,
      );
    }

    if (inventory.stock > 0) {
      throw new BadRequestException(
        'No se puede desactivar un producto con stock existente',
      );
    }

    inventory.isActive = false;
    await this.inventoryWarehouseRepo.save(inventory);
  }

  // Obtener inventario filtrado por almacén, producto (código/nombre) y rangos de stock
  async findFiltered(
    companyId: number,
    filters: {
      warehouse?: string;
      product?: string;
      minStock?: number;
      maxStock?: number;
    },
  ): Promise<InventoryWarehouse[]> {
    const { warehouse, product, minStock, maxStock } = filters;

    const qb = this.inventoryWarehouseRepo
      .createQueryBuilder('iw')
      .where('iw.companyId = :companyId', { companyId })
      .andWhere('iw.isActive = :isActive', { isActive: true });

    if (warehouse) {
      qb.andWhere('iw.warehouseId = :warehouseId', { warehouseId: warehouse });
    }

    if (product) {
      const term = `%${product.toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(iw.productCode) LIKE :term OR LOWER(iw.productName) LIKE :term OR LOWER(iw.productDescription) LIKE :term)',
        { term },
      );
    }

    if (minStock !== undefined && !isNaN(minStock)) {
      qb.andWhere('iw.stock >= :minStock', { minStock });
    }

    if (maxStock !== undefined && !isNaN(maxStock)) {
      qb.andWhere('iw.stock <= :maxStock', { maxStock });
    }

    return qb
      .orderBy('iw.warehouseName', 'ASC')
      .addOrderBy('iw.productName', 'ASC')
      .getMany();
  }
}
