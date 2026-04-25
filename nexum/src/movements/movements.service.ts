/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Injectable, BadRequestException, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InventoryWarehouseService } from '../inventory-warehouse/inventory-warehouse.service';
import { AccountService } from '../accounting/account.service';
import { Movement, MovementType } from '../entities/movement.entity';
import { DeliveryReport } from '../entities/delivery-report.entity';

@Injectable()
export class MovementsService {
  constructor(
    private readonly inventoryWarehouseService: InventoryWarehouseService,
    @Inject(forwardRef(() => AccountService))
    private readonly accountService: AccountService,
    @InjectRepository(Movement)
    private readonly movementRepo: Repository<Movement>,
    @InjectRepository(DeliveryReport)
    private readonly drRepo: Repository<DeliveryReport>,
  ) {}

  async findAll(
    companyId: number,
    filters?: {
      start_date?: string;
      end_date?: string;
      product_name?: string;
      relations?: string;
      warehouse?: string;
      movement_type?: MovementType;
    },
  ) {
    const qb = this.movementRepo
      .createQueryBuilder('m')
      .where('m.company_id = :companyId', { companyId });

    if (filters?.start_date) {
      qb.andWhere('m.created_at >= :start', { start: filters.start_date });
    }
    if (filters?.end_date) {
      qb.andWhere('m.created_at <= :end', { end: filters.end_date });
    }
    if (filters?.warehouse) {
      qb.andWhere('(m.source_warehouse = :warehouse OR m.destination_warehouse = :warehouse)', { 
        warehouse: filters.warehouse 
      });
    }
    if (filters?.movement_type) {
      qb.andWhere('m.movement_type = :movementType', { movementType: filters.movement_type });
    }

    qb.orderBy('m.created_at', 'DESC');
    const result = await qb.getMany();

    if (filters?.product_name) {
      const search = filters.product_name.toLowerCase();
      const enriched: any[] = [];
      for (const m of result) {
        const inventories = await this.inventoryWarehouseService.findByCode(
          companyId,
          m.productCode,
        );
        if (inventories.some(inv => inv.productName.toLowerCase().includes(search))) {
          enriched.push(await this.enrichMovement(companyId, m));
        }
      }
      return enriched;
    }

    const enrichedAll: any[] = [];
    for (const m of result) {
      enrichedAll.push(await this.enrichMovement(companyId, m));
    }
    return enrichedAll;
  }

  private async enrichMovement(companyId: number, m: Movement) {
    const inventories = await this.inventoryWarehouseService.findByCode(
      companyId,
      m.productCode,
    );
    
    // Obtener el inventario del almacén relevante según el tipo de movimiento
    let relevantInventory = inventories[0];
    if (m.movementType === 'transfer' && m.destinationWarehouse) {
      relevantInventory = inventories.find(inv => inv.warehouseId === m.destinationWarehouse) || inventories[0];
    } else if (m.sourceWarehouse) {
      relevantInventory = inventories.find(inv => inv.warehouseId === m.sourceWarehouse) || inventories[0];
    }

    return {
      id: m.id,
      product: relevantInventory
        ? {
            productName: relevantInventory.productName,
            productCode: relevantInventory.productCode,
            stock: relevantInventory.stock,
            entity: relevantInventory.entity,
            warehouse: relevantInventory.warehouseName,
            warehouseId: relevantInventory.warehouseId,
            unitPrice: relevantInventory.unitPrice,
            productUnit: relevantInventory.productUnit || 'und',
          }
        : {
            productName: m.productCode,
            productCode: m.productCode,
            stock: 0,
            entity: '',
            warehouse: '',
            warehouseId: '',
            unitPrice: 0,
            productUnit: 'und',
          },
      type: m.movementType.toUpperCase(),
      quantity: m.quantity,
      createdAt: m.createdAt,
      reason: m.reason,
      sourceWarehouse: m.sourceWarehouse,
      destinationWarehouse: m.destinationWarehouse,
      purchaseId: m.purchaseId || null,
      purchase: m.purchaseId ? { id: m.purchaseId } : null,
    };
  }

  async createDirectEntry(
    companyId: number,
    data: {
      productCode: string;
      productName: string;
      productDescription?: string;
      quantity: number;
      label?: string;
      entity?: string;
      warehouseId: string;
      unitPrice?: number;
      unit?: string;
      location?: string;
    },
    userName?: string,
  ) {
    if (data.quantity <= 0) {
      throw new BadRequestException('La cantidad debe ser mayor a 0');
    }

    // Asegurar que exista el producto en el inventario del almacén
    await this.inventoryWarehouseService.ensureProduct(companyId, {
      productCode: data.productCode,
      productName: data.productName,
      productDescription: data.productDescription,
      productUnit: data.unit,
      unitPrice: data.unitPrice,
      warehouseId: data.warehouseId,
      entity: data.entity,
      location: data.location,
    });

    // Actualizar stock en el almacén específico
    await this.inventoryWarehouseService.updateStock(
      companyId,
      data.productCode,
      data.warehouseId,
      data.quantity,
      'entry',
    );

    // Registrar movimiento
    const mov = await this.movementRepo.save(
      this.movementRepo.create({
        companyId,
        movementType: 'entry',
        productCode: data.productCode,
        quantity: data.quantity,
        reason: data.label || 'Entrada directa',
        label: data.label || null,
        destinationWarehouse: data.warehouseId,
        userName: userName || 'System',
      }),
    );

    // ── Accounting: Voucher for direct entry (DESHABILITADO — contabilidad manual) ──
    // TODO: Reactivar cuando se indique

    return this.enrichMovement(companyId, mov);
  }

  async createExit(
    companyId: number,
    data: {
      product_code: string;
      quantity: number;
      reason?: string;
      entity?: string;
      warehouseId: string;
    },
    userName?: string,
  ) {
    if (data.quantity <= 0) {
      throw new BadRequestException('La cantidad debe ser mayor a 0');
    }

    // Actualizar stock en el almacén específico
    await this.inventoryWarehouseService.updateStock(
      companyId,
      data.product_code,
      data.warehouseId,
      data.quantity,
      'exit',
    );

    // Registrar movimiento
    const mov = await this.movementRepo.save(
      this.movementRepo.create({
        companyId,
        movementType: 'exit',
        productCode: data.product_code,
        quantity: data.quantity,
        reason: data.reason || 'Salida de inventario',
        sourceWarehouse: data.warehouseId,
        userName: userName || 'System',
      }),
    );

    // Obtener inventario para el reporte de entrega
    const inventories = await this.inventoryWarehouseService.findByCode(
      companyId,
      data.product_code,
    );
    const inventory = inventories.find(
      (inv) => inv.warehouseId === data.warehouseId,
    );

    await this.drRepo.save(
      this.drRepo.create({
        companyId,
        code: `VE-${data.product_code}`,
        entity: data.entity || 'Entrega Directa',
        warehouse: inventory?.warehouseName || data.warehouseId,
        document: `SALIDA-${mov.id}`,
        products: JSON.stringify([
          {
            code: data.product_code,
            description: inventory?.productName || data.product_code,
            quantity: data.quantity,
            unit: inventory?.productUnit || 'und',
            unitPrice: inventory?.unitPrice || 0,
            amount: data.quantity * (inventory?.unitPrice || 0),
          },
        ]),
        reportType: 'Vale de Entrega',
        reason: data.reason || 'Salida de inventario',
        createdByName: userName || 'System',
      }),
    );

    // ── Accounting: Voucher for exit (DESHABILITADO — contabilidad manual) ──
    // TODO: Reactivar cuando se indique

    return this.enrichMovement(companyId, mov);
  }

  async createTransfer(
    companyId: number,
    data: {
      productCode: string;
      quantity: number;
      sourceWarehouseId: string;
      destinationWarehouseId: string;
      reason?: string;
    },
    userName?: string,
  ) {
    if (data.quantity <= 0) {
      throw new BadRequestException('La cantidad debe ser mayor a 0');
    }

    // Validar que exista stock en el almacén origen
    const sourceInventory = await this.inventoryWarehouseService.findByCompanyProductAndWarehouse(
      companyId,
      data.productCode,
      data.sourceWarehouseId,
    );

    if (!sourceInventory) {
      throw new NotFoundException(
        `Producto ${data.productCode} no encontrado en almacén origen ${data.sourceWarehouseId}`,
      );
    }

    if (sourceInventory.stock < data.quantity) {
      throw new BadRequestException(
        `Stock insuficiente en almacén origen. Disponible: ${sourceInventory.stock}, Requerido: ${data.quantity}`,
      );
    }

    // Realizar la transferencia de stock
    const transferResult = await this.inventoryWarehouseService.transferStock(
      companyId,
      {
        productCode: data.productCode,
        quantity: data.quantity,
        sourceWarehouseId: data.sourceWarehouseId,
        destinationWarehouseId: data.destinationWarehouseId,
      },
    );

    // Registrar movimiento de transferencia
    const mov = await this.movementRepo.save(
      this.movementRepo.create({
        companyId,
        movementType: 'transfer',
        productCode: data.productCode,
        quantity: data.quantity,
        reason: data.reason || 'Transferencia entre almacenes',
        sourceWarehouse: data.sourceWarehouseId,
        destinationWarehouse: data.destinationWarehouseId,
        userName: userName || 'System',
      }),
    );

    const enriched = await this.enrichMovement(companyId, mov);
    
    // Agregar información adicional de la transferencia
    return {
      ...enriched,
      transferDetails: {
        sourceInventory: transferResult.sourceInventory,
        destinationInventory: transferResult.destinationInventory,
      },
    };
  }

  async createReturn(
    companyId: number,
    data: {
      product_code: string;
      quantity: number;
      purchase_id?: string;
      reason: string;
      warehouseId: string;
    },
    userName?: string,
  ) {
    if (data.quantity <= 0) {
      throw new BadRequestException('La cantidad debe ser mayor a 0');
    }

    // Para devoluciones, se considera como entrada al almacén
    await this.inventoryWarehouseService.updateStock(
      companyId,
      data.product_code,
      data.warehouseId,
      data.quantity,
      'entry',
    );

    const mov = await this.movementRepo.save(
      this.movementRepo.create({
        companyId,
        movementType: 'return',
        productCode: data.product_code,
        quantity: data.quantity,
        reason: data.reason,
        destinationWarehouse: data.warehouseId,
        userName: userName || 'System',
        purchaseId: data.purchase_id || null,
      }),
    );

    // ── Accounting: Voucher for return (DESHABILITADO — contabilidad manual) ──
    // TODO: Reactivar cuando se indique

    return this.enrichMovement(companyId, mov);
  }

  async getTransfersByWarehouse(
    companyId: number,
    warehouseId: string,
    filters?: {
      start_date?: string;
      end_date?: string;
      type?: 'incoming' | 'outgoing';
    },
  ) {
    const qb = this.movementRepo
      .createQueryBuilder('m')
      .where('m.company_id = :companyId', { companyId })
      .andWhere('m.movement_type = :movementType', { movementType: 'transfer' });

    if (filters?.type === 'incoming') {
      qb.andWhere('m.destination_warehouse = :warehouseId', { warehouseId });
    } else if (filters?.type === 'outgoing') {
      qb.andWhere('m.source_warehouse = :warehouseId', { warehouseId });
    } else {
      qb.andWhere('(m.source_warehouse = :warehouseId OR m.destination_warehouse = :warehouseId)', { 
        warehouseId 
      });
    }

    if (filters?.start_date) {
      qb.andWhere('m.created_at >= :start', { start: filters.start_date });
    }
    if (filters?.end_date) {
      qb.andWhere('m.created_at <= :end', { end: filters.end_date });
    }

    qb.orderBy('m.created_at', 'DESC');
    const result = await qb.getMany();

    const enrichedAll: any[] = [];
    for (const m of result) {
      enrichedAll.push(await this.enrichMovement(companyId, m));
    }
    return enrichedAll;
  }
}
