/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Injectable, BadRequestException, NotFoundException, Inject, forwardRef, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { InventoryWarehouseService } from '../inventory-warehouse/inventory-warehouse.service';
import { VoucherService } from '../accounting/voucher.service';
import { Movement, MovementType } from '../entities/movement.entity';
import { Account } from '../entities/account.entity';
import { MovementItem } from '../entities/movement-item.entity';
import { DeliveryReport } from '../entities/delivery-report.entity';
import {
  getMovementType,
  getAccountingEntryForMovement,
  getTransferEntryCode,
  isTransferExitCode,
  getInventoryAccountByCategory,
  MovementTypeDefinition,
} from './movement-types.catalog';
import { StockLimitsService, StockWarning } from '../stock-limits/stock-limits.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditResource } from '../entities/audit-log.entity';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { AccountMappingService } from '../accounting/account-mapping.service';
import { MappingType } from '../entities/account-mapping.entity';

/** Códigos de movimiento que registran un faltante sujeto a investigación. */
const SHORTAGE_CODES = ['1104', '2104', '3104'];
/** Códigos de movimiento que registran un sobrante sujeto a investigación. */
const SURPLUS_CODES = ['105', '205', '305'];

@Injectable()
export class MovementsService {
  private readonly logger = new Logger(MovementsService.name);

  constructor(
    private readonly inventoryWarehouseService: InventoryWarehouseService,
    @Inject(forwardRef(() => VoucherService))
    private readonly voucherService: VoucherService,
    @InjectRepository(Movement)
    private readonly movementRepo: Repository<Movement>,
    @InjectRepository(DeliveryReport)
    private readonly drRepo: Repository<DeliveryReport>,
    private readonly dataSource: DataSource,
    private readonly stockLimitsService: StockLimitsService,
    private readonly auditService: AuditService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly accountMappingService: AccountMappingService,
  ) {}

  // ── Post-movimiento: verificar stock limits + notificar + auditar ──
  private async postMovementHook(
    companyId: number,
    movementId: string,
    productCode: string,
    warehouseId: string,
    movementType: string,
    quantity: number,
    userName?: string,
  ): Promise<void> {
    try {
      // 1. Verificar stock limits y sincronizar
      const warning = await this.stockLimitsService.checkAfterMovement(
        companyId,
        productCode,
        warehouseId,
      );

      // 2. Emitir notificación WebSocket si hay alerta
      if (warning && (warning.urgency === 'critical' || warning.urgency === 'high')) {
        this.notificationsGateway.emitStockAlert({
          productName: warning.productName,
          currentStock: warning.currentStock,
          minStock: warning.minStock,
          companyId,
          tenantId: String(companyId),
        });

        this.notificationsGateway.broadcastNotification({
          id: movementId,
          title: warning.status === 'out_of_stock' ? 'Producto Agotado' : 'Stock Bajo',
          message: warning.message,
          type: warning.urgency === 'critical' ? 'error' : 'warning',
          timestamp: new Date().toISOString(),
          targetTenantId: String(companyId),
        });

        this.logger.warn(`Alerta stock: ${warning.message}`);
      }

      // 3. Registrar auditoría del movimiento
      const actionMap: Record<string, AuditAction> = {
        entry: AuditAction.ENTRY,
        exit: AuditAction.EXIT,
        transfer: AuditAction.TRANSFER,
        return: AuditAction.RETURN,
      };
      await this.auditService.log({
        companyId,
        userName: userName || 'System',
        action: actionMap[movementType] || AuditAction.CREATE,
        resource: AuditResource.MOVEMENT,
        resourceId: movementId,
        resourceName: `${movementType.toUpperCase()} - ${productCode} x${quantity}`,
        newValues: {
          movementType,
          productCode,
          warehouseId,
          quantity,
          stockWarning: warning?.status || 'no_limit_configured',
        },
        success: true,
      });
    } catch (error) {
      this.logger.error(`Error en post-movement hook: ${error.message}`);
    }
  }

  async findAll(
    companyId: number,
    filters?: {
      start_date?: string;
      end_date?: string;
      product_name?: string;
      relations?: string;
      warehouse?: string;
      movement_type?: MovementType;
      page?: number;
      limit?: number;
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

    qb.orderBy('m.createdAt', 'DESC');

    // ── Server-side pagination ──
    const isPaginated = filters?.page && filters?.limit;
    const page = Math.max(filters?.page || 1, 1);
    const limit = Math.min(Math.max(filters?.limit || 50, 1), 200);

    if (isPaginated) {
      qb.skip((page - 1) * limit).take(limit);
    }

    const [movements, totalItems] = isPaginated
      ? await qb.getManyAndCount()
      : [await qb.getMany(), 0];

    // ── Batch: single query for all product codes ──
    const productCodes = movements.map(m => m.productCode).filter((c): c is string => c !== null);
    const inventoryMap = await this.inventoryWarehouseService.findByCodes(companyId, productCodes);

    let enriched = movements.map(m => this.enrichMovementFromMap(m, inventoryMap));

    // Filtrar por nombre de producto en memoria
    if (filters?.product_name) {
      const search = filters.product_name.toLowerCase();
      enriched = enriched.filter(e =>
        e.product.productName.toLowerCase().includes(search) ||
        e.product.productCode.toLowerCase().includes(search),
      );
    }

    // Retorno paginado o plano (backward compatible)
    if (isPaginated) {
      return {
        data: enriched,
        meta: {
          currentPage: page,
          itemsPerPage: limit,
          totalItems,
          totalPages: Math.ceil(totalItems / limit),
        },
      };
    }

    return enriched;
  }

  // Enrich usando mapa pre-cargado (sin query adicional)
  private enrichMovementFromMap(
    m: Movement,
    inventoryMap: Map<string, any[]>,
  ) {
    const inventories = (m.productCode ? inventoryMap.get(m.productCode) : undefined) || [];

    let relevantInventory = inventories[0];
    
    // Enhanced warehouse matching logic with fallback
    if ((m.movementType === 'transfer' || m.movementType === 'entry' || m.movementType === 'return') && m.destinationWarehouse) {
      relevantInventory = inventories.find(inv => inv.warehouseId === m.destinationWarehouse) || inventories[0];
    } else if (m.sourceWarehouse) {
      relevantInventory = inventories.find(inv => inv.warehouseId === m.sourceWarehouse) || inventories[0];
    }
    
    // Fallback: if no stock found, use inventory with highest stock
    if (relevantInventory && relevantInventory.stock === 0 && inventories.length > 1) {
      const bestStock = inventories.find(inv => inv.stock > 0);
      if (bestStock) {
        relevantInventory = bestStock;
      }
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
      movementCode: m.movementCode || null,
      movementDescription: m.movementDescription || null,
      category: m.category || null,
      quantity: m.quantity,
      unitPrice: m.unitPrice || 0,
      totalAmount: m.totalAmount || 0,
      createdAt: m.createdAt,
      reason: m.reason,
      sourceWarehouse: m.sourceWarehouse,
      destinationWarehouse: m.destinationWarehouse,
      purchaseId: m.purchaseId || null,
      purchase: m.purchaseId ? { id: m.purchaseId } : null,
      relatedMovementId: m.relatedMovementId || null,
      expenseElement: m.expenseElement || null,
      voucherId: m.voucherId || null,
      reportNumber: this.getReportNumber(m),
    };
  }

  private getReportNumber(m: Movement): string {
    const prefix: Record<MovementType, string> = {
      entry: 'IR',
      exit: 'VE',
      return: 'VD',
      transfer: 'TR',
    };
    const type = m.movementType;
    const shortId = m.id.split('-')[0] || m.id.substring(0, 8);
    return `${prefix[type] || 'DOC'}-${shortId}`;
  }

  // Enrich individual (para operaciones de escritura que retornan un solo movimiento)
  private async enrichMovement(companyId: number, m: Movement) {
    const codes = m.productCode ? [m.productCode] : [];
    const inventoryMap = await this.inventoryWarehouseService.findByCodes(companyId, codes);
    return this.enrichMovementFromMap(m, inventoryMap);
  }

  async createDirectEntry(
    companyId: number,
    data: {
      movementCode: string;
      category?: 'insumo' | 'mercancia' | 'produccion';
      label?: string;
      entity?: string;
      warehouseId: string;
      items?: {
        productCode: string;
        productName: string;
        productDescription?: string;
        quantity: number;
        unitPrice?: number;
        unit?: string;
        location?: string;
        expenseElement?: string;
        costCenterId?: string;
        subelementId?: string;
      }[];
      // Cuentas contables seleccionadas por el usuario (override de defaults)
      debitAccountCode?: string;
      creditAccountCode?: string;
      costCenterId?: string;
      subelementId?: string;
      // Backward compatibility (single product)
      productCode?: string;
      productName?: string;
      productDescription?: string;
      quantity?: number;
      unitPrice?: number;
      unit?: string;
      location?: string;
      expenseElement?: string;
    },
    userName?: string,
  ) {
    // Normalizar: convertir single-product a items[]
    let items = data.items || [];
    if (!items.length && data.productCode && data.productName && data.quantity) {
      items = [{
        productCode: data.productCode,
        productName: data.productName,
        productDescription: data.productDescription,
        quantity: data.quantity,
        unitPrice: data.unitPrice,
        unit: data.unit,
        location: data.location,
        expenseElement: data.expenseElement,
        costCenterId: data.costCenterId,
        subelementId: data.subelementId,
      }];
    }

    if (!items.length) {
      throw new BadRequestException('Debe incluir al menos un producto');
    }

    // Validar código de movimiento
    const movType = getMovementType(data.movementCode);
    if (!movType) {
      throw new BadRequestException(`Código de movimiento inválido: ${data.movementCode}`);
    }
    if (movType.direction !== 'entry') {
      throw new BadRequestException(`El código ${data.movementCode} no es de entrada`);
    }

    for (const item of items) {
      if (item.quantity <= 0) {
        throw new BadRequestException(`Cantidad inválida para producto ${item.productCode}`);
      }
    }

    const category = data.category || movType.category;

    const result = await this.dataSource.transaction(async (manager) => {
      // Calcular totales
      let grandTotal = 0;
      const movementItems: Partial<MovementItem>[] = [];

      for (const item of items) {
        const unitPrice = item.unitPrice || 0;
        const totalAmount = unitPrice * item.quantity;
        grandTotal += totalAmount;

        // Asegurar que exista el producto en inventario (dentro de la transacción)
        await this.inventoryWarehouseService.ensureProduct(companyId, {
          productCode: item.productCode,
          productName: item.productName,
          productDescription: item.productDescription,
          productUnit: item.unit,
          unitPrice: item.unitPrice,
          warehouseId: data.warehouseId,
          entity: data.entity,
          location: item.location,
        }, manager);

        // Actualizar stock dentro de la transacción
        await this.inventoryWarehouseService.updateStock(
          companyId,
          item.productCode,
          data.warehouseId,
          item.quantity,
          'entry',
          undefined,
          manager,
        );

        movementItems.push({
          productCode: item.productCode,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice,
          totalAmount,
          productUnit: item.unit || 'und',
          productDescription: item.productDescription || null,
          expenseElement: item.expenseElement || null,
          costCenterId: item.costCenterId || null,
          subelementId: item.subelementId || null,
        });
      }

      // Registrar movimiento (documento único) dentro de la transacción
      const mov = this.movementRepo.create({
        companyId,
        movementType: 'entry',
        movementCode: data.movementCode,
        movementDescription: movType.description,
        category,
        productCode: items.length === 1 ? items[0].productCode : null,
        quantity: items.reduce((sum, i) => sum + i.quantity, 0),
        unitPrice: items.length === 1 ? (items[0].unitPrice || 0) : 0,
        totalAmount: grandTotal,
        itemCount: items.length,
        reason: data.label || movType.description,
        label: data.label || null,
        expenseElement: items.length === 1 ? (items[0].expenseElement || null) : null,
        costCenterId: data.costCenterId || (items.length === 1 ? items[0].costCenterId : null),
        subelementId: data.subelementId || (items.length === 1 ? items[0].subelementId : null),
        destinationWarehouse: data.warehouseId,
        userName: userName || 'System',
      });

      const savedMov = await manager.getRepository(Movement).save(mov);

      // Guardar items detallados
      if (items.length > 0) {
        const itemEntities = movementItems.map(mi => {
          const entity = new MovementItem();
          Object.assign(entity, { ...mi, movementId: savedMov.id });
          return entity;
        });
        await manager.getRepository(MovementItem).save(itemEntities);
      }

      // ── Contabilización automática (un solo comprobante para toda la operación) ──
      await this.generateAccountingVoucher(companyId, savedMov, movType, grandTotal, userName, {
        debitAccountCode: data.debitAccountCode,
        creditAccountCode: data.creditAccountCode,
      }, manager);

      return savedMov;
    });

    // ── Post-movimiento: stock limits + notificaciones + auditoría ──
    for (const item of items) {
      await this.postMovementHook(companyId, result.id, item.productCode, data.warehouseId, 'entry', item.quantity, userName);
    }

    return this.enrichMovement(companyId, result);
  }

  async createExit(
    companyId: number,
    data: {
      movementCode: string;
      category?: 'insumo' | 'mercancia' | 'produccion';
      reason?: string;
      entity?: string;
      warehouseId: string;
      expenseElement?: string;
      // Cuentas contables seleccionadas por el usuario (override de defaults)
      debitAccountCode?: string;
      creditAccountCode?: string;
      costCenterId?: string;
      subelementId?: string;
      // Trazabilidad a trabajador
      employeeId?: string;
      employeeName?: string;
      items?: { productCode: string; quantity: number; expenseElement?: string; costCenterId?: string; subelementId?: string }[];
      // Backward compatibility (single product)
      product_code?: string;
      quantity?: number;
    },
    userName?: string,
  ) {
    // Normalizar: convertir single-product a items[]
    let items = data.items || [];
    if (!items.length && data.product_code && data.quantity) {
      items = [{
        productCode: data.product_code,
        quantity: data.quantity,
        expenseElement: data.expenseElement,
        costCenterId: data.costCenterId,
        subelementId: data.subelementId,
      }];
    }

    if (!items.length) {
      throw new BadRequestException('Debe incluir al menos un producto');
    }

    // Validar código de movimiento
    const movType = getMovementType(data.movementCode);
    if (!movType) {
      throw new BadRequestException(`Código de movimiento inválido: ${data.movementCode}`);
    }
    if (movType.direction !== 'exit') {
      throw new BadRequestException(`El código ${data.movementCode} no es de salida`);
    }

    for (const item of items) {
      if (item.quantity <= 0) {
        throw new BadRequestException(`Cantidad inválida para producto ${item.productCode}`);
      }
    }

    const category = data.category || movType.category;

    // Obtener inventario de todos los productos en batch
    const productCodes = items.map((i) => i.productCode);
    const inventoryMap = await this.inventoryWarehouseService.findByCodes(companyId, productCodes);

    const result = await this.dataSource.transaction(async (manager) => {
      let grandTotal = 0;
      const movementItems: Partial<MovementItem>[] = [];
      const valeProducts: any[] = [];

      for (const item of items) {
        const inventories = inventoryMap.get(item.productCode) || [];
        const inventory = inventories.find((inv) => inv.warehouseId === data.warehouseId);
        const unitPrice = inventory?.unitPrice || 0;
        const totalAmount = unitPrice * item.quantity;
        grandTotal += totalAmount;

        // Actualizar stock dentro de la transacción
        await this.inventoryWarehouseService.updateStock(
          companyId,
          item.productCode,
          data.warehouseId,
          item.quantity,
          'exit',
          undefined,
          manager,
        );

        movementItems.push({
          productCode: item.productCode,
          productName: inventory?.productName || item.productCode,
          quantity: item.quantity,
          unitPrice,
          totalAmount,
          productUnit: inventory?.productUnit || 'und',
          productDescription: inventory?.productDescription || null,
          expenseElement: item.expenseElement || data.expenseElement || null,
          costCenterId: item.costCenterId || data.costCenterId || null,
          subelementId: item.subelementId || data.subelementId || null,
        });

        valeProducts.push({
          code: item.productCode,
          description: inventory?.productName || item.productCode,
          quantity: item.quantity,
          unit: inventory?.productUnit || 'und',
          unitPrice,
          amount: totalAmount,
        });
      }

      // Registrar movimiento (documento único) dentro de la transacción
      const savedMov = await manager.getRepository(Movement).save(
        this.movementRepo.create({
          companyId,
          movementType: 'exit',
          movementCode: data.movementCode,
          movementDescription: movType.description,
          category,
          productCode: items.length === 1 ? items[0].productCode : null,
          quantity: items.reduce((sum, i) => sum + i.quantity, 0),
          unitPrice: items.length === 1 ? (movementItems[0].unitPrice || 0) : 0,
          totalAmount: grandTotal,
          itemCount: items.length,
          reason: data.reason || movType.description,
          sourceWarehouse: data.warehouseId,
          expenseElement: items.length === 1 ? (items[0].expenseElement || null) : null,
          costCenterId: data.costCenterId || (items.length === 1 ? items[0].costCenterId : null),
          subelementId: data.subelementId || (items.length === 1 ? items[0].subelementId : null),
          employeeId: data.employeeId || null,
          employeeName: data.employeeName || null,
          userName: userName || 'System',
        }),
      );

      // Guardar items detallados
      if (items.length > 0) {
        const itemEntities = movementItems.map((mi) => {
          const entity = new MovementItem();
          Object.assign(entity, { ...mi, movementId: savedMov.id });
          return entity;
        });
        await manager.getRepository(MovementItem).save(itemEntities);
      }

      // Vale de Entrega (UN solo documento con todos los productos)
      const firstInventory = (inventoryMap.get(items[0].productCode) || [])
        .find((inv) => inv.warehouseId === data.warehouseId);
      await manager.getRepository(DeliveryReport).save(
        this.drRepo.create({
          companyId,
          reportNumber: `VE-${savedMov.id.substring(0, 8)}`,
          reportDate: new Date(),
          entityName: data.entity || 'Entrega Directa',
          employeeId: data.employeeId || null,
          employeeName: data.employeeName || null,
          warehouseId: data.warehouseId,
          warehouseName: firstInventory?.warehouseName || data.warehouseId,
          authorizationDocument: `SALIDA-${savedMov.id.substring(0, 8)}`,
          products: JSON.stringify(valeProducts),
          reportType: 'SC-2-08',
          observations: data.reason || movType.description,
          createdByName: userName || 'System',
        }),
      );

      // ── Contabilización automática (un solo comprobante) ──
      await this.generateAccountingVoucher(companyId, savedMov, movType, grandTotal, userName, {
        debitAccountCode: data.debitAccountCode,
        creditAccountCode: data.creditAccountCode,
      }, manager);

      return savedMov;
    });

    // ── Post-movimiento: stock limits + notificaciones + auditoría ──
    for (const item of items) {
      await this.postMovementHook(companyId, result.id, item.productCode, data.warehouseId, 'exit', item.quantity, userName);
    }

    return this.enrichMovement(companyId, result);
  }

  async createTransfer(
    companyId: number,
    data: {
      movementCode: string;
      category?: 'insumo' | 'mercancia' | 'produccion';
      sourceWarehouseId: string;
      destinationWarehouseId: string;
      reason?: string;
      items?: { productCode: string; quantity: number }[];
      // Backward compatibility (single product)
      productCode?: string;
      quantity?: number;
    },
    userName?: string,
  ) {
    // Normalizar: convertir single-product a items[]
    let items = data.items || [];
    if (!items.length && data.productCode && data.quantity) {
      items = [{ productCode: data.productCode, quantity: data.quantity }];
    }

    if (!items.length) {
      throw new BadRequestException('Debe incluir al menos un producto');
    }

    if (data.sourceWarehouseId === data.destinationWarehouseId) {
      throw new BadRequestException('El almacén origen y destino no pueden ser el mismo');
    }

    // Validar código de movimiento (debe ser código de salida de transferencia)
    const exitMovType = getMovementType(data.movementCode);
    if (!exitMovType) {
      throw new BadRequestException(`Código de movimiento inválido: ${data.movementCode}`);
    }

    if (!isTransferExitCode(data.movementCode)) {
      throw new BadRequestException(
        `Código ${data.movementCode} no es un código de transferencia válido. Use 1102 (insumo), 2102 (mercancía) o 3102 (producción).`,
      );
    }

    // Obtener código de entrada correspondiente
    const entryCode = getTransferEntryCode(data.movementCode);
    const entryMovType = entryCode ? getMovementType(entryCode) : null;
    if (!entryCode || !entryMovType) {
      throw new BadRequestException(
        `No se encontró código de entrada correspondiente para transferencia ${data.movementCode}`,
      );
    }

    const category = data.category || exitMovType.category;

    // Validar stock para todos los items antes de empezar
    for (const item of items) {
      if (item.quantity <= 0) {
        throw new BadRequestException(`Cantidad inválida para producto ${item.productCode}`);
      }
      const sourceInv = await this.inventoryWarehouseService.findByCompanyProductAndWarehouse(
        companyId,
        item.productCode,
        data.sourceWarehouseId,
      );
      if (!sourceInv) {
        throw new NotFoundException(
          `Producto ${item.productCode} no encontrado en almacén origen ${data.sourceWarehouseId}`,
        );
      }
      if (sourceInv.stock < item.quantity) {
        throw new BadRequestException(
          `Stock insuficiente para ${item.productCode}. Disponible: ${sourceInv.stock}, Requerido: ${item.quantity}`,
        );
      }
    }

    // Obtener precios de inventario
    const productCodes = items.map((i) => i.productCode);
    const inventoryMap = await this.inventoryWarehouseService.findByCodes(companyId, productCodes);

    let grandTotal = 0;
    const exitItems: Partial<MovementItem>[] = [];
    const entryItems: Partial<MovementItem>[] = [];

    // ── TRANSACCIÓN: todas las operaciones de transferencia son atómicas ──
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const item of items) {
        const inventories = inventoryMap.get(item.productCode) || [];
        const sourceInv = inventories.find((inv) => inv.warehouseId === data.sourceWarehouseId);
        const unitPrice = sourceInv?.unitPrice || 0;
        const totalAmount = unitPrice * item.quantity;
        grandTotal += totalAmount;

        // Transferir stock
        await this.inventoryWarehouseService.transferStock(companyId, {
          productCode: item.productCode,
          quantity: item.quantity,
          sourceWarehouseId: data.sourceWarehouseId,
          destinationWarehouseId: data.destinationWarehouseId,
        });

        const itemData: Partial<MovementItem> = {
          productCode: item.productCode,
          productName: sourceInv?.productName || item.productCode,
          quantity: item.quantity,
          unitPrice,
          totalAmount,
          productUnit: sourceInv?.productUnit || 'und',
          productDescription: sourceInv?.productDescription || null,
        };
        exitItems.push(itemData);
        entryItems.push(itemData);
      }

      const transferReason = data.reason || 'Transferencia entre almacenes';

      // ── Movimiento SALIDA (documento único para todos los productos) ──
      const exitMov = await queryRunner.manager.save(
        this.movementRepo.create({
          companyId,
          movementType: 'transfer' as MovementType,
          movementCode: data.movementCode,
          movementDescription: exitMovType.description,
          category,
          productCode: items.length === 1 ? items[0].productCode : null,
          quantity: items.reduce((sum, i) => sum + i.quantity, 0),
          unitPrice: items.length === 1 ? (exitItems[0].unitPrice || 0) : 0,
          totalAmount: grandTotal,
          itemCount: items.length,
          reason: transferReason,
          sourceWarehouse: data.sourceWarehouseId,
          destinationWarehouse: data.destinationWarehouseId,
          userName: userName || 'System',
        }),
      );

      // ── Movimiento ENTRADA (documento único para todos los productos) ──
      const entryMov = await queryRunner.manager.save(
        this.movementRepo.create({
          companyId,
          movementType: 'transfer' as MovementType,
          movementCode: entryCode,
          movementDescription: entryMovType.description,
          category,
          productCode: items.length === 1 ? items[0].productCode : null,
          quantity: items.reduce((sum, i) => sum + i.quantity, 0),
          unitPrice: items.length === 1 ? (entryItems[0].unitPrice || 0) : 0,
          totalAmount: grandTotal,
          itemCount: items.length,
          reason: transferReason,
          sourceWarehouse: data.sourceWarehouseId,
          destinationWarehouse: data.destinationWarehouseId,
          userName: userName || 'System',
        }),
      );

      // Guardar items detallados para ambos movimientos
      const miRepo = this.dataSource.getRepository(MovementItem);
      if (items.length > 0) {
        const exitItemEntities = exitItems.map((mi) => {
          const entity = new MovementItem();
          Object.assign(entity, { ...mi, movementId: exitMov.id });
          return entity;
        });
        const entryItemEntities = entryItems.map((mi) => {
          const entity = new MovementItem();
          Object.assign(entity, { ...mi, movementId: entryMov.id });
          return entity;
        });
        await miRepo.save([...exitItemEntities, ...entryItemEntities]);
      }

      // Vincular ambos movimientos entre sí
      const linkNote = `(Salida: ${exitMov.id.substring(0, 8)}, Entrada: ${entryMov.id.substring(0, 8)})`;
      await queryRunner.manager.update(Movement, exitMov.id, {
        relatedMovementId: entryMov.id,
        reason: `${transferReason} ${linkNote}`,
      });
      await queryRunner.manager.update(Movement, entryMov.id, {
        relatedMovementId: exitMov.id,
        reason: `${transferReason} ${linkNote}`,
      });

      await queryRunner.commitTransaction();

      // ── Las transferencias intra-empresa NO generan comprobante contable ──
      // Son movimientos internos que no afectan el resultado económico
      this.logger.log(
        `Transferencia intra-empresa procesada: ${exitMov.id} → ${entryMov.id} (sin contabilización)`,
      );

      // ── Post-movimiento: verificar ambos almacenes para cada producto ──
      for (const item of items) {
        await this.postMovementHook(companyId, exitMov.id, item.productCode, data.sourceWarehouseId, 'transfer', item.quantity, userName);
        await this.postMovementHook(companyId, entryMov.id, item.productCode, data.destinationWarehouseId, 'transfer', item.quantity, userName);
      }

      const enrichedExit = await this.enrichMovement(companyId, exitMov);
      const enrichedEntry = await this.enrichMovement(companyId, entryMov);

      return {
        exitMovement: enrichedExit,
        entryMovement: enrichedEntry,
        itemCount: items.length,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Error en transferencia: ${error.message}`, error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async createReturn(
    companyId: number,
    data: {
      movementCode: string;
      category?: 'insumo' | 'mercancia' | 'produccion';
      reason: string;
      warehouseId: string;
      purchase_id?: string;
      entity?: string;
      // Cuentas contables seleccionadas por el usuario (override de defaults)
      debitAccountCode?: string;
      creditAccountCode?: string;
      costCenterId?: string;
      subelementId?: string;
      items?: { productCode: string; quantity: number; costCenterId?: string; subelementId?: string }[];
      // Backward compatibility (single product)
      product_code?: string;
      quantity?: number;
    },
    userName?: string,
  ) {
    // Normalizar: convertir single-product a items[]
    let items = data.items || [];
    if (!items.length && data.product_code && data.quantity) {
      items = [{ productCode: data.product_code, quantity: data.quantity, costCenterId: data.costCenterId, subelementId: data.subelementId }];
    }

    if (!items.length) {
      throw new BadRequestException('Debe incluir al menos un producto');
    }

    // Validar código de movimiento
    const movType = getMovementType(data.movementCode);
    if (!movType) {
      throw new BadRequestException(`Código de movimiento inválido: ${data.movementCode}`);
    }

    for (const item of items) {
      if (item.quantity <= 0) {
        throw new BadRequestException(`Cantidad inválida para producto ${item.productCode}`);
      }
    }

    const category = data.category || movType.category;

    // Obtener inventario de todos los productos en batch
    const productCodes = items.map((i) => i.productCode);
    const inventoryMap = await this.inventoryWarehouseService.findByCodes(companyId, productCodes);

    const result = await this.dataSource.transaction(async (manager) => {
      let grandTotal = 0;
      const movementItems: Partial<MovementItem>[] = [];
      const valeProducts: any[] = [];

      for (const item of items) {
        const inventories = inventoryMap.get(item.productCode) || [];
        const inventory = inventories.find((inv) => inv.warehouseId === data.warehouseId);
        const unitPrice = inventory?.unitPrice || 0;
        const totalAmount = unitPrice * item.quantity;
        grandTotal += totalAmount;

        // La dirección del stock depende del tipo de devolución:
        // - Devolución de COMPRA a proveedor (código exit, p.ej. 1107/2107) → sale stock
        // - Devolución de VENTA del cliente (código entry, p.ej. 106/107) → entra stock
        const stockDirection: 'entry' | 'exit' =
          movType.direction === 'exit' ? 'exit' : 'entry';
        await this.inventoryWarehouseService.updateStock(
          companyId,
          item.productCode,
          data.warehouseId,
          item.quantity,
          stockDirection,
          undefined,
          manager,
        );

        movementItems.push({
          productCode: item.productCode,
          productName: inventory?.productName || item.productCode,
          quantity: item.quantity,
          unitPrice,
          totalAmount,
          productUnit: inventory?.productUnit || 'und',
          productDescription: inventory?.productDescription || null,
          costCenterId: item.costCenterId || data.costCenterId || null,
          subelementId: item.subelementId || data.subelementId || null,
        });

        valeProducts.push({
          code: item.productCode,
          description: inventory?.productName || item.productCode,
          quantity: item.quantity,
          unit: inventory?.productUnit || 'und',
          unitPrice,
          amount: totalAmount,
        });
      }

      // Registrar movimiento (documento único) dentro de la transacción
      const savedMov = await manager.getRepository(Movement).save(
        this.movementRepo.create({
          companyId,
          movementType: 'return',
          movementCode: data.movementCode,
          movementDescription: movType.description,
          category,
          productCode: items.length === 1 ? items[0].productCode : null,
          quantity: items.reduce((sum, i) => sum + i.quantity, 0),
          unitPrice: items.length === 1 ? (movementItems[0].unitPrice || 0) : 0,
          totalAmount: grandTotal,
          itemCount: items.length,
          reason: data.reason,
          destinationWarehouse: data.warehouseId,
          costCenterId: data.costCenterId || (items.length === 1 ? items[0].costCenterId : null),
          subelementId: data.subelementId || (items.length === 1 ? items[0].subelementId : null),
          userName: userName || 'System',
          purchaseId: data.purchase_id || null,
        }),
      );

      // Guardar items detallados
      if (items.length > 0) {
        const itemEntities = movementItems.map((mi) => {
          const entity = new MovementItem();
          Object.assign(entity, { ...mi, movementId: savedMov.id });
          return entity;
        });
        await manager.getRepository(MovementItem).save(itemEntities);
      }

      // Vale de Devolución (UN solo documento con todos los productos)
      const firstInventory = (inventoryMap.get(items[0].productCode) || [])
        .find((inv) => inv.warehouseId === data.warehouseId);
      await manager.getRepository(DeliveryReport).save(
        this.drRepo.create({
          companyId,
          reportNumber: `VD-${savedMov.id.substring(0, 8)}`,
          reportDate: new Date(),
          entityName: data.entity || 'Devolución',
          warehouseId: data.warehouseId,
          warehouseName: firstInventory?.warehouseName || data.warehouseId,
          authorizationDocument: `DEVOL-${savedMov.id.substring(0, 8)}`,
          products: JSON.stringify(valeProducts),
          reportType: 'SC-2-08',
          observations: data.reason,
          createdByName: userName || 'System',
        }),
      );

      // ── Contabilización automática (un solo comprobante) ──
      await this.generateAccountingVoucher(companyId, savedMov, movType, grandTotal, userName, {
        debitAccountCode: data.debitAccountCode,
        creditAccountCode: data.creditAccountCode,
      }, manager);

      return savedMov;
    });

    // ── Post-movimiento: stock limits + notificaciones + auditoría ──
    for (const item of items) {
      await this.postMovementHook(companyId, result.id, item.productCode, data.warehouseId, 'return', item.quantity, userName);
    }

    return this.enrichMovement(companyId, result);
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

    qb.orderBy('m.createdAt', 'DESC');
    const movements = await qb.getMany();

    const productCodes = movements.map(m => m.productCode).filter((c): c is string => c !== null);
    const inventoryMap = await this.inventoryWarehouseService.findByCodes(companyId, productCodes);
    return movements.map(m => this.enrichMovementFromMap(m, inventoryMap));
  }

  // ══════════════════════════════════════════════════════════
  // ── EXPEDIENTES DE FALTANTES Y SOBRANTES ──
  // ══════════════════════════════════════════════════════════

  /**
   * Movimientos de faltante o sobrante cuyo expediente sigue abierto, es decir
   * cuyo importe permanece en las cuentas 332 "Faltantes de Bienes en
   * Investigación" o 555 "Sobrantes en Investigación".
   */
  async findOpenInvestigations(companyId: number) {
    const movements = await this.movementRepo
      .createQueryBuilder('m')
      .where('m.companyId = :companyId', { companyId })
      .andWhere('m.movementCode IN (:...codes)', {
        codes: [...SHORTAGE_CODES, ...SURPLUS_CODES],
      })
      .andWhere('m.investigationStatus = :status', { status: 'open' })
      .orderBy('m.createdAt', 'DESC')
      .getMany();

    return {
      movements,
      totalShortage: movements
        .filter((m) => SHORTAGE_CODES.includes(m.movementCode || ''))
        .reduce((sum, m) => sum + Number(m.totalAmount || 0), 0),
      totalSurplus: movements
        .filter((m) => SURPLUS_CODES.includes(m.movementCode || ''))
        .reduce((sum, m) => sum + Number(m.totalAmount || 0), 0),
    };
  }

  /**
   * Cierra el expediente de un FALTANTE trasladando su importe fuera de la
   * cuenta 332 "Faltantes de Bienes en Investigación":
   *
   *  - resolution 'loss'        → Débito 850 Gastos por Faltantes de Bienes
   *  - resolution 'responsible' → Débito 335 Cuentas por Cobrar Diversas
   *
   * en ambos casos con crédito a la 332. Conforme a la Res. 13/2006 MFP, el
   * gasto o el cobro al responsable solo se reconoce al concluir la
   * investigación, nunca al detectarse el faltante.
   */
  async resolveShortage(
    companyId: number,
    movementId: string,
    data: {
      resolution: 'loss' | 'responsible';
      responsibleName?: string;
      resolutionDate?: string;
      notes?: string;
    },
    userName?: string,
  ) {
    const movement = await this.movementRepo.findOne({
      where: { id: movementId, companyId },
    });
    if (!movement) {
      throw new NotFoundException(`Movimiento ${movementId} no encontrado`);
    }
    if (!SHORTAGE_CODES.includes(movement.movementCode || '')) {
      throw new BadRequestException(
        `El movimiento ${movement.movementCode} no es un faltante en investigación`,
      );
    }
    if (movement.investigationStatus === 'resolved') {
      throw new BadRequestException(
        'El expediente de este faltante ya fue resuelto',
      );
    }
    if (data.resolution === 'responsible' && !data.responsibleName) {
      throw new BadRequestException(
        'Debe indicar el responsable al que se carga el faltante',
      );
    }

    const amount = Number(movement.totalAmount || 0);
    if (amount <= 0) {
      throw new BadRequestException(
        'El faltante no tiene importe: no procede asiento de resolución',
      );
    }

    const date = data.resolutionDate || new Date().toISOString().split('T')[0];

    const investigationAccount =
      (await this.accountMappingService.getAccountForMapping(
        companyId,
        MappingType.INVENTORY_SHORTAGE_INVESTIGATION,
      )) || '332';
    const destinationAccount =
      data.resolution === 'loss'
        ? (await this.accountMappingService.getAccountForMapping(
            companyId,
            MappingType.INVENTORY_SHORTAGE_LOSS,
          )) || '850'
        : (await this.accountMappingService.getAccountForMapping(
            companyId,
            MappingType.INVENTORY_SHORTAGE_RECEIVABLE,
          )) || '335';

    await this.voucherService.createVoucherFromModule(
      companyId,
      'inventory',
      `${movement.id}-shortage-resolution`,
      {
        date,
        description:
          data.resolution === 'loss'
            ? `Resolución faltante ${movement.productCode}: pérdida asumida por la entidad`
            : `Resolución faltante ${movement.productCode}: cargo al responsable ${data.responsibleName}`,
        type: 'ajuste',
        reference: `RES-FALT-${movement.id.substring(0, 8)}`,
        createdBy: userName || 'Sistema',
        lines: [
          {
            accountCode: destinationAccount,
            debit: amount,
            credit: 0,
            description:
              data.resolution === 'loss'
                ? `Pérdida por faltante ${movement.productCode}`
                : `Faltante a cargo de ${data.responsibleName}`,
            costCenterId: movement.costCenterId || undefined,
            reference: data.responsibleName || null,
          },
          {
            accountCode: investigationAccount,
            debit: 0,
            credit: amount,
            description: `Cancelación faltante en investigación ${movement.productCode}`,
          },
        ],
      },
    );

    movement.investigationStatus = 'resolved';
    movement.investigationResolution = data.resolution;
    movement.investigationResolvedAt = date;
    movement.investigationResponsible = data.responsibleName || null;
    if (data.notes) {
      movement.reason = `${movement.reason || ''} | Resolución: ${data.notes}`;
    }
    await this.movementRepo.save(movement);

    this.logger.log(
      `Expediente de faltante ${movement.id} resuelto como '${data.resolution}' por ${amount}`,
    );

    return this.enrichMovement(companyId, movement);
  }

  /**
   * Cierra el expediente de un SOBRANTE trasladando su importe desde la cuenta
   * 555 "Sobrantes en Investigación" a Otros Ingresos (950) cuando nadie lo
   * reclama, o cancelándolo contra el inventario si se localiza su origen.
   */
  async resolveSurplus(
    companyId: number,
    movementId: string,
    data: {
      resolution: 'income' | 'owner_found';
      resolutionDate?: string;
      notes?: string;
    },
    userName?: string,
  ) {
    const movement = await this.movementRepo.findOne({
      where: { id: movementId, companyId },
    });
    if (!movement) {
      throw new NotFoundException(`Movimiento ${movementId} no encontrado`);
    }
    if (!SURPLUS_CODES.includes(movement.movementCode || '')) {
      throw new BadRequestException(
        `El movimiento ${movement.movementCode} no es un sobrante en investigación`,
      );
    }
    if (movement.investigationStatus === 'resolved') {
      throw new BadRequestException(
        'El expediente de este sobrante ya fue resuelto',
      );
    }

    const amount = Number(movement.totalAmount || 0);
    if (amount <= 0) {
      throw new BadRequestException(
        'El sobrante no tiene importe: no procede asiento de resolución',
      );
    }

    const date = data.resolutionDate || new Date().toISOString().split('T')[0];
    const movType = getMovementType(movement.movementCode || '');

    const investigationAccount =
      (await this.accountMappingService.getAccountForMapping(
        companyId,
        MappingType.INVENTORY_SURPLUS_INVESTIGATION,
      )) || '555';

    // Si nadie reclama el sobrante se reconoce como ingreso; si aparece su
    // origen (p. ej. una entrada no registrada) se cancela contra el inventario.
    const destinationAccount =
      data.resolution === 'income'
        ? (await this.accountMappingService.getAccountForMapping(
            companyId,
            MappingType.INVENTORY_SURPLUS_INCOME,
          )) || '950'
        : getInventoryAccountByCategory(movType?.category || 'mercancia');

    await this.voucherService.createVoucherFromModule(
      companyId,
      'inventory',
      `${movement.id}-surplus-resolution`,
      {
        date,
        description:
          data.resolution === 'income'
            ? `Resolución sobrante ${movement.productCode}: reconocido como ingreso`
            : `Resolución sobrante ${movement.productCode}: localizado su origen`,
        type: 'ajuste',
        reference: `RES-SOBR-${movement.id.substring(0, 8)}`,
        createdBy: userName || 'Sistema',
        lines: [
          {
            accountCode: investigationAccount,
            debit: amount,
            credit: 0,
            description: `Cancelación sobrante en investigación ${movement.productCode}`,
          },
          {
            accountCode: destinationAccount,
            debit: 0,
            credit: amount,
            description:
              data.resolution === 'income'
                ? `Ingreso por sobrante ${movement.productCode}`
                : `Regularización sobrante ${movement.productCode}`,
            costCenterId: movement.costCenterId || undefined,
          },
        ],
      },
    );

    movement.investigationStatus = 'resolved';
    movement.investigationResolution = data.resolution;
    movement.investigationResolvedAt = date;
    if (data.notes) {
      movement.reason = `${movement.reason || ''} | Resolución: ${data.notes}`;
    }
    await this.movementRepo.save(movement);

    this.logger.log(
      `Expediente de sobrante ${movement.id} resuelto como '${data.resolution}' por ${amount}`,
    );

    return this.enrichMovement(companyId, movement);
  }

  // ══════════════════════════════════════════════════════════
  // ── CONTABILIZACIÓN AUTOMÁTICA ──
  // ══════════════════════════════════════════════════════════

  private async generateAccountingVoucher(
    companyId: number,
    movement: Movement,
    movType: MovementTypeDefinition,
    totalAmount: number,
    userName?: string,
    overrides?: {
      debitAccountCode?: string;
      creditAccountCode?: string;
    },
    manager?: EntityManager,
  ): Promise<void> {
    if (totalAmount <= 0) {
      this.logger.warn(
        `Movimiento ${movement.id} sin monto (${totalAmount}), no se genera comprobante contable`,
      );
      return;
    }

    if (!movement.movementCode) {
      this.logger.warn(`Movimiento ${movement.id} sin código de movimiento`);
      return;
    }

    // Determinar cuentas: overrides > defaults del catálogo > defaults resilientes
    let debitAccount = overrides?.debitAccountCode || '';
    let creditAccount = overrides?.creditAccountCode || '';

    const accountingEntry = getAccountingEntryForMovement(movement.movementCode);
    if (!accountingEntry) {
      this.logger.warn(
        `No se encontró mapeo contable para código de movimiento: ${movement.movementCode}`,
      );
      return;
    }

    // Si no hay overrides, usar defaults del catálogo (con correcciones conocidas)
    if (!debitAccount) debitAccount = accountingEntry.debitAccountCode || '';
    if (!creditAccount) creditAccount = accountingEntry.creditAccountCode || '';

    // Los faltantes y sobrantes se registran contra cuentas de investigación
    // (Res. 13/2006 MFP), parametrizables por empresa.
    if (['1104', '2104', '3104'].includes(movement.movementCode)) {
      debitAccount =
        (await this.accountMappingService.getAccountForMapping(
          companyId,
          MappingType.INVENTORY_SHORTAGE_INVESTIGATION,
        )) || debitAccount;
    } else if (['105', '205', '305'].includes(movement.movementCode)) {
      creditAccount =
        (await this.accountMappingService.getAccountForMapping(
          companyId,
          MappingType.INVENTORY_SURPLUS_INVESTIGATION,
        )) || creditAccount;
    }

    // Validar que las cuentas existan en la empresa; si no, usar defaults resilientes
    const accountRepo = manager ? manager.getRepository(Account) : this.voucherService['accountRepo'];
    const debitAcc = await accountRepo.findOneBy({ code: debitAccount, companyId });
    if (!debitAcc) {
      this.logger.warn(`Cuenta débito ${debitAccount} no existe para la empresa. Usando cuenta de inventario por categoría.`);
      debitAccount = getInventoryAccountByCategory(movType.category);
    }

    const creditAcc = await accountRepo.findOneBy({ code: creditAccount, companyId });
    if (!creditAcc) {
      this.logger.warn(`Cuenta crédito ${creditAccount} no existe para la empresa. Usando cuenta por defecto según tipo.`);
      // Defaults resilientes según tipo de movimiento
      if (['102', '202', '402'].includes(movement.movementCode)) {
        creditAccount = '406'; // Cuentas por Pagar - Fuera del Órgano (proveedores)
      } else if (['1107', '2107'].includes(movement.movementCode)) {
        creditAccount = '406'; // Devolución compra a proveedores
      } else if (['106', '206', '306', '107', '207', '307'].includes(movement.movementCode)) {
        // Devolución de ventas: contra Costo de Ventas en lugar de Ventas
        creditAccount = movType.category === 'mercancia' ? '814' : '810';
      } else {
        creditAccount = accountingEntry.creditAccountCode; // fallback
      }
    }

    // Validación final: asegurar que ambas cuentas tengan valores válidos.
    // Nunca se registra un movimiento de inventario sin su asiento: si no hay
    // cuentas válidas se aborta la operación en lugar de dejar el inventario
    // descuadrado respecto de la contabilidad.
    if (!debitAccount || !creditAccount) {
      throw new BadRequestException(
        `No se pudieron determinar cuentas contables válidas para el movimiento ${movement.movementCode}. ` +
          `Débito: ${debitAccount || '(vacío)'}, Crédito: ${creditAccount || '(vacío)'}. ` +
          `Configure el mapeo de cuentas antes de registrar este movimiento.`,
      );
    }

    try {
      // El subelemento de gasto (clasificador cubano) debe viajar en la línea
      // del comprobante, no en el texto de la descripción: es la única forma de
      // que el Modelo 5924 (Desglose de Gastos por Elementos) pueda construirse.
      // Solo se aplica a la línea de gasto, es decir a la del débito en las
      // salidas hacia consumo (1105/2105/3105) y centros de costo.
      const subelement = movement.subelementId || null;
      const element = movement.expenseElement || null;

      const voucherLines = [
        {
          accountCode: debitAccount,
          debit: totalAmount,
          credit: 0,
          description: `${movType.description} - Débito`,
          costCenterId: movement.costCenterId || undefined,
          element,
          subelement,
        },
        {
          accountCode: creditAccount,
          debit: 0,
          credit: totalAmount,
          description: `${movType.description} - Crédito`,
          costCenterId: movement.costCenterId || undefined,
          element,
          subelement,
        },
      ];

      const voucher = await this.voucherService.createVoucherFromModule(
        companyId,
        'inventory',
        movement.id,
        {
          date: movement.createdAt
            ? new Date(movement.createdAt).toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0],
          description: `${movType.description} - ${movement.productCode} x${movement.quantity}`,
          type: 'inventory',
          reference: `MOV-${movement.movementCode}-${movement.id.substring(0, 8)}`,
          createdBy: userName || 'Sistema',
          lines: voucherLines,
        },
        manager,
      );

      // Vincular comprobante al movimiento
      movement.voucherId = voucher.id;
      const movementRepo = manager ? manager.getRepository(Movement) : this.movementRepo;
      await movementRepo.update(movement.id, { voucherId: voucher.id });

      this.logger.log(
        `Comprobante ${voucher.voucherNumber} generado para movimiento ${movement.movementCode} (${movement.id})`,
      );
    } catch (error) {
      this.logger.error(
        `Error al generar comprobante para movimiento ${movement.id}: ${error.message}`,
        error.stack,
      );
      // El comprobante de movimiento de inventario es obligatorio (aunque se
      // postee manualmente después). Lanzar el error evita que la operación
      // quede registrada sin su voucher borrador.
      throw error;
    }
  }
}
