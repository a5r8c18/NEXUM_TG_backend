import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { InventoryWarehouse } from '../entities/inventory-warehouse.entity';
import { WarehousesService } from '../warehouses/warehouses.service';

@Injectable()
export class InventoryWarehouseService {
  constructor(
    @InjectRepository(InventoryWarehouse)
    private readonly inventoryWarehouseRepo: Repository<InventoryWarehouse>,
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
  ): Promise<InventoryWarehouse | null> {
    return this.inventoryWarehouseRepo.findOne({
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
    );

    if (!inventory) {
      inventory = this.inventoryWarehouseRepo.create({
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
      inventory = await this.inventoryWarehouseRepo.save(inventory);
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
      // En salidas, el unitPrice no cambia (método PEPS implícito)
    }

    return this.inventoryWarehouseRepo.save(inventory);
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

    // Reducir stock del almacén origen
    const sourceInventory = await this.updateStock(
      companyId,
      data.productCode,
      data.sourceWarehouseId,
      data.quantity,
      'exit',
    );

    // Aumentar stock en almacén destino (sin cambiar precio en transferencias)
    const destinationInventory = await this.updateStock(
      companyId,
      data.productCode,
      data.destinationWarehouseId,
      data.quantity,
      'entry',
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
}
