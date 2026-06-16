/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Injectable, BadRequestException, NotFoundException, Inject, forwardRef, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { InventoryWarehouseService } from '../inventory-warehouse/inventory-warehouse.service';
import { VoucherService } from '../accounting/voucher.service';
import { Movement, MovementType } from '../entities/movement.entity';
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
    };
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
      }[];
      // Cuentas contables seleccionadas por el usuario (override de defaults)
      debitAccountCode?: string;
      creditAccountCode?: string;
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

    // Calcular totales
    let grandTotal = 0;
    const movementItems: Partial<MovementItem>[] = [];

    for (const item of items) {
      const unitPrice = item.unitPrice || 0;
      const totalAmount = unitPrice * item.quantity;
      grandTotal += totalAmount;

      // Asegurar que exista el producto en inventario
      await this.inventoryWarehouseService.ensureProduct(companyId, {
        productCode: item.productCode,
        productName: item.productName,
        productDescription: item.productDescription,
        productUnit: item.unit,
        unitPrice: item.unitPrice,
        warehouseId: data.warehouseId,
        entity: data.entity,
        location: item.location,
      });

      // Actualizar stock
      await this.inventoryWarehouseService.updateStock(
        companyId,
        item.productCode,
        data.warehouseId,
        item.quantity,
        'entry',
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
      });
    }

    // Registrar movimiento (documento único)
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
      destinationWarehouse: data.warehouseId,
      userName: userName || 'System',
    });

    const savedMov = await this.movementRepo.save(mov);

    // Guardar items detallados
    if (items.length > 0) {
      const itemEntities = movementItems.map(mi => {
        const entity = new MovementItem();
        Object.assign(entity, { ...mi, movementId: savedMov.id });
        return entity;
      });
      await this.dataSource.getRepository(MovementItem).save(itemEntities);
    }

    // ── Contabilización automática (un solo comprobante para toda la operación) ──
    await this.generateAccountingVoucher(companyId, savedMov, movType, grandTotal, userName, {
      debitAccountCode: data.debitAccountCode,
      creditAccountCode: data.creditAccountCode,
    });

    // ── Post-movimiento: stock limits + notificaciones + auditoría ──
    for (const item of items) {
      await this.postMovementHook(companyId, savedMov.id, item.productCode, data.warehouseId, 'entry', item.quantity, userName);
    }

    return this.enrichMovement(companyId, savedMov);
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
      items?: { productCode: string; quantity: number; expenseElement?: string }[];
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

    let grandTotal = 0;
    const movementItems: Partial<MovementItem>[] = [];
    const valeProducts: any[] = [];

    for (const item of items) {
      const inventories = inventoryMap.get(item.productCode) || [];
      const inventory = inventories.find((inv) => inv.warehouseId === data.warehouseId);
      const unitPrice = inventory?.unitPrice || 0;
      const totalAmount = unitPrice * item.quantity;
      grandTotal += totalAmount;

      // Actualizar stock
      await this.inventoryWarehouseService.updateStock(
        companyId,
        item.productCode,
        data.warehouseId,
        item.quantity,
        'exit',
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

    // Registrar movimiento (documento único)
    const savedMov = await this.movementRepo.save(
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
      await this.dataSource.getRepository(MovementItem).save(itemEntities);
    }

    // Vale de Entrega (UN solo documento con todos los productos)
    const firstInventory = (inventoryMap.get(items[0].productCode) || [])
      .find((inv) => inv.warehouseId === data.warehouseId);
    await this.drRepo.save(
      this.drRepo.create({
        companyId,
        code: `VE-${savedMov.id.substring(0, 8)}`,
        entity: data.entity || 'Entrega Directa',
        warehouse: firstInventory?.warehouseName || data.warehouseId,
        document: `SALIDA-${savedMov.id.substring(0, 8)}`,
        products: JSON.stringify(valeProducts),
        reportType: 'Vale de Entrega',
        reason: data.reason || movType.description,
        createdByName: userName || 'System',
      }),
    );

    // ── Contabilización automática (un solo comprobante) ──
    await this.generateAccountingVoucher(companyId, savedMov, movType, grandTotal, userName, {
      debitAccountCode: data.debitAccountCode,
      creditAccountCode: data.creditAccountCode,
    });

    // ── Post-movimiento: stock limits + notificaciones + auditoría ──
    for (const item of items) {
      await this.postMovementHook(companyId, savedMov.id, item.productCode, data.warehouseId, 'exit', item.quantity, userName);
    }

    return this.enrichMovement(companyId, savedMov);
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
      items?: { productCode: string; quantity: number }[];
      // Backward compatibility (single product)
      product_code?: string;
      quantity?: number;
    },
    userName?: string,
  ) {
    // Normalizar: convertir single-product a items[]
    let items = data.items || [];
    if (!items.length && data.product_code && data.quantity) {
      items = [{ productCode: data.product_code, quantity: data.quantity }];
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
      );

      movementItems.push({
        productCode: item.productCode,
        productName: inventory?.productName || item.productCode,
        quantity: item.quantity,
        unitPrice,
        totalAmount,
        productUnit: inventory?.productUnit || 'und',
        productDescription: inventory?.productDescription || null,
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

    // Registrar movimiento (documento único)
    const savedMov = await this.movementRepo.save(
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
      await this.dataSource.getRepository(MovementItem).save(itemEntities);
    }

    // Vale de Devolución (UN solo documento con todos los productos)
    const firstInventory = (inventoryMap.get(items[0].productCode) || [])
      .find((inv) => inv.warehouseId === data.warehouseId);
    await this.drRepo.save(
      this.drRepo.create({
        companyId,
        code: `VD-${savedMov.id.substring(0, 8)}`,
        entity: data.entity || 'Devolución',
        warehouse: firstInventory?.warehouseName || data.warehouseId,
        document: `DEVOL-${savedMov.id.substring(0, 8)}`,
        products: JSON.stringify(valeProducts),
        reportType: 'Vale de Devolución',
        reason: data.reason,
        createdByName: userName || 'System',
      }),
    );

    // ── Contabilización automática (un solo comprobante) ──
    await this.generateAccountingVoucher(companyId, savedMov, movType, grandTotal, userName, {
      debitAccountCode: data.debitAccountCode,
      creditAccountCode: data.creditAccountCode,
    });

    // ── Post-movimiento: stock limits + notificaciones + auditoría ──
    for (const item of items) {
      await this.postMovementHook(companyId, savedMov.id, item.productCode, data.warehouseId, 'return', item.quantity, userName);
    }

    return this.enrichMovement(companyId, savedMov);
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

    // Validar que las cuentas existan en la empresa; si no, usar defaults resilientes
    try {
      await this.voucherService['accountRepo'].findOneBy({ code: debitAccount, companyId });
    } catch {
      this.logger.warn(`Cuenta débito ${debitAccount} no existe para la empresa. Usando cuenta de inventario por categoría.`);
      debitAccount = getInventoryAccountByCategory(movType.category);
    }

    try {
      await this.voucherService['accountRepo'].findOneBy({ code: creditAccount, companyId });
    } catch {
      this.logger.warn(`Cuenta crédito ${creditAccount} no existe para la empresa. Usando cuenta por defecto según tipo.`);
      // Defaults resilientes según tipo de movimiento
      if (['102', '202', '402'].includes(movement.movementCode!)) {
        creditAccount = '406'; // Cuentas por Pagar - Fuera del Órgano (proveedores)
      } else if (['1107', '2107'].includes(movement.movementCode!)) {
        creditAccount = '406'; // Devolución compra a proveedores
      } else if (['106', '206', '306', '107', '207', '307'].includes(movement.movementCode!)) {
        // Devolución de ventas: contra Costo de Ventas en lugar de Ventas
        creditAccount = movType.category === 'mercancia' ? '814' : '810';
      } else if (['105', '205', '305'].includes(movement.movementCode!)) {
        creditAccount = '932'; // Sobrantes de Inventarios (ingreso)
      } else if (['1104', '2104', '3104'].includes(movement.movementCode!)) {
        // Faltantes: usar cuenta de pérdidas si existe, sino dejar sin generar
        this.logger.warn(`No existe cuenta de faltantes. No se genera comprobante para movimiento ${movement.id}.`);
        return;
      } else {
        creditAccount = accountingEntry.creditAccountCode; // fallback
      }
    }

    // Validación final: asegurar que ambas cuentas tengan valores válidos
    if (!debitAccount || !creditAccount) {
      this.logger.error(
        `No se pudieron determinar cuentas contables válidas para movimiento ${movement.id}. Débito: ${debitAccount}, Crédito: ${creditAccount}`
      );
      return;
    }

    try {
      // Códigos de centro de costo donde el elemento de gasto es relevante
      const costCenterCodes = ['108', '208', '308', '1105', '2105', '3105'];
      const isCostCenterMovement = costCenterCodes.includes(movement.movementCode!);
      
      // Preparar líneas del comprobante con centro de costo y subelemento si aplica
      const voucherLines = [
        {
          accountCode: debitAccount,
          debit: totalAmount,
          credit: 0,
          description: `${movType.description} - Débito`,
          costCenterId: movement.costCenterId || undefined,
        },
        {
          accountCode: creditAccount,
          debit: 0,
          credit: totalAmount,
          description: `${movType.description} - Crédito`,
          costCenterId: movement.costCenterId || undefined,
        },
      ];

      // Agregar elemento de gasto a la descripción si aplica
      if (movement.expenseElement && isCostCenterMovement) {
        voucherLines.forEach(line => {
          line.description += ` [Elem. Gasto: ${movement.expenseElement}]`;
        });
      }

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
      );

      // Vincular comprobante al movimiento
      movement.voucherId = voucher.id;
      await this.movementRepo.update(movement.id, { voucherId: voucher.id });

      this.logger.log(
        `Comprobante ${voucher.voucherNumber} generado para movimiento ${movement.movementCode} (${movement.id})`,
      );
    } catch (error) {
      this.logger.error(
        `Error al generar comprobante para movimiento ${movement.id}: ${error.message}`,
        error.stack,
      );
      // No lanzar el error — el movimiento de inventario ya se realizó.
      // El comprobante se puede generar manualmente después.
    }
  }
}
