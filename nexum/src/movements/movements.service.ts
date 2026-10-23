/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Injectable, BadRequestException, NotFoundException, Inject, forwardRef, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { InventoryWarehouseService } from '../inventory-warehouse/inventory-warehouse.service';
import { WarehousesService } from '../warehouses/warehouses.service';
import { VoucherService } from '../accounting/voucher.service';
import { Movement, MovementType } from '../entities/movement.entity';
import { Account } from '../entities/account.entity';
import { MovementItem } from '../entities/movement-item.entity';
import { DeliveryReport } from '../entities/delivery-report.entity';
import { ReceptionReport } from '../entities/reception-report.entity';
import { WarehouseReturn } from '../entities/warehouse-return.entity';
import { WarehouseReturnItem } from '../entities/warehouse-return-item.entity';
import { AccountPayable } from '../entities/account-payable.entity';
import { AccountReceivable } from '../entities/account-receivable.entity';
import { ProductsService } from '../products/products.service';
import { DocumentSequenceService } from '../common/sequence/document-sequence.service';
import {
  getMovementType,
  getAccountingEntryForMovement,
  getTransferEntryCode,
  isTransferExitCode,
  isTransferEntryCode,
  TRANSFER_EXIT_CODES,
  TRANSFER_ENTRY_CODES,
  getInventoryAccountByCategory,
  isReturnCode,
  isPurchaseReturnCode,
  isEntitySalesReturnCode,
  MovementTypeDefinition,
  InventoryCategory,
} from './movement-types.catalog';
import { StockLimitsService, StockWarning } from '../stock-limits/stock-limits.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditResource } from '../entities/audit-log.entity';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { AccountMappingService } from '../accounting/account-mapping.service';
import { MappingType } from '../entities/account-mapping.entity';
import { isSettled, roundDecimal, toDecimal } from '../common/utils/decimal.util';

/** Códigos de movimiento que registran un faltante sujeto a investigación. */
const SHORTAGE_CODES = ['1104', '2104', '3104'];
/** Códigos de movimiento que registran un sobrante sujeto a investigación. */
const SURPLUS_CODES = ['105', '205', '305'];

@Injectable()
export class MovementsService {
  private readonly logger = new Logger(MovementsService.name);

  constructor(
    private readonly inventoryWarehouseService: InventoryWarehouseService,
    private readonly warehousesService: WarehousesService,
    @Inject(forwardRef(() => VoucherService))
    private readonly voucherService: VoucherService,
    @InjectRepository(Movement)
    private readonly movementRepo: Repository<Movement>,
    @InjectRepository(DeliveryReport)
    private readonly drRepo: Repository<DeliveryReport>,
    @InjectRepository(WarehouseReturn)
    private readonly warehouseReturnRepo: Repository<WarehouseReturn>,
    @InjectRepository(WarehouseReturnItem)
    private readonly warehouseReturnItemRepo: Repository<WarehouseReturnItem>,
    private readonly productsService: ProductsService,
    private readonly sequenceService: DocumentSequenceService,
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
      const warning = await this.stockLimitsService.checkAfterMovement(
        companyId,
        productCode,
        warehouseId,
      );

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
      this.logger.error(`Error en post-movement hook: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async findAll(
    companyId: number,
    filters?: {
      start_date?: string;
      end_date?: string;
      product_name?: string;
      product_code?: string;
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
      qb.andWhere(
        `(
          (m.movement_type <> 'transfer' AND (m.source_warehouse = :warehouse OR m.destination_warehouse = :warehouse))
          OR (m.movement_type = 'transfer' AND m.movement_code IN (:...transferExitCodes) AND m.source_warehouse = :warehouse)
          OR (m.movement_type = 'transfer' AND m.movement_code IN (:...transferEntryCodes) AND m.destination_warehouse = :warehouse)
          OR (m.movement_type = 'transfer' AND (m.movement_code IS NULL OR m.movement_code NOT IN (:...transferCodes))
              AND (m.source_warehouse = :warehouse OR m.destination_warehouse = :warehouse))
        )`,
        {
          warehouse: filters.warehouse,
          transferExitCodes: TRANSFER_EXIT_CODES,
          transferEntryCodes: TRANSFER_ENTRY_CODES,
          transferCodes: [...TRANSFER_EXIT_CODES, ...TRANSFER_ENTRY_CODES],
        },
      );
    }
    if (filters?.movement_type) {
      qb.andWhere('m.movement_type = :movementType', { movementType: filters.movement_type });
    }
    if (filters?.product_code) {
      qb.andWhere('m.product_code = :productCode', { productCode: filters.product_code });
    }

    qb.orderBy('m.createdAt', 'DESC');

    const isPaginated = filters?.page && filters?.limit;
    const page = Math.max(filters?.page || 1, 1);
    const limit = Math.min(Math.max(filters?.limit || 50, 1), 200);

    if (isPaginated) {
      qb.skip((page - 1) * limit).take(limit);
    }

    const [movements, totalItems] = isPaginated
      ? await qb.getManyAndCount()
      : [await qb.getMany(), 0];

    const productCodes = movements.map(m => m.productCode).filter((c): c is string => c !== null);
    const inventoryMap = await this.inventoryWarehouseService.findByCodes(companyId, productCodes);

    let enriched = movements.map(m => this.enrichMovementFromMap(m, inventoryMap));

    if (filters?.product_name) {
      const search = filters.product_name.toLowerCase();
      enriched = enriched.filter(e =>
        e.product?.productName?.toLowerCase().includes(search) ||
        e.product?.productCode?.toLowerCase().includes(search),
      );
    }

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

  private enrichMovementFromMap(
    m: Movement,
    inventoryMap: Map<string, any[]>,
  ) {
    const inventories = (m.productCode ? inventoryMap.get(m.productCode) : undefined) || [];

    let relevantInventory = inventories[0];

    const isTransferExit =
      m.movementType === 'transfer' && !!m.movementCode && isTransferExitCode(m.movementCode);

    if (isTransferExit && m.sourceWarehouse) {
      relevantInventory = inventories.find(inv => inv.warehouseId === m.sourceWarehouse) || inventories[0];
    } else if ((m.movementType === 'transfer' || m.movementType === 'entry' || m.movementType === 'return') && m.destinationWarehouse) {
      relevantInventory = inventories.find(inv => inv.warehouseId === m.destinationWarehouse) || inventories[0];
    } else if (m.sourceWarehouse) {
      relevantInventory = inventories.find(inv => inv.warehouseId === m.sourceWarehouse) || inventories[0];
    }

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

  async getProductHistory(
    companyId: number,
    productCode: string,
    filters?: { warehouse?: string; start_date?: string; end_date?: string },
  ) {
    const qb = this.movementRepo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.items', 'i')
      .where('m.company_id = :companyId', { companyId })
      .andWhere(
        '(m.product_code = :productCode OR i.productCode = :productCode)',
        { productCode },
      )
      .orderBy('m.created_at', 'ASC');

    const warehouseIds: string[] = [];
    if (filters?.warehouse) {
      const wh = await this.warehousesService.findByIdOrCode(companyId, filters.warehouse);
      if (wh) {
        warehouseIds.push(...Array.from(new Set([wh.id, wh.code, wh.name].filter(Boolean) as string[])));
      } else {
        warehouseIds.push(filters.warehouse);
      }
    }

    if (warehouseIds.length) {
      qb.andWhere(
        `(
          (m.movement_type <> 'transfer' AND (m.source_warehouse IN (:...warehouseIds) OR m.destination_warehouse IN (:...warehouseIds)))
          OR (m.movement_type = 'transfer' AND m.movement_code IN (:...transferExitCodes) AND m.source_warehouse IN (:...warehouseIds))
          OR (m.movement_type = 'transfer' AND m.movement_code IN (:...transferEntryCodes) AND m.destination_warehouse IN (:...warehouseIds))
          OR (m.movement_type = 'transfer' AND (m.movement_code IS NULL OR m.movement_code NOT IN (:...transferCodes))
              AND (m.source_warehouse IN (:...warehouseIds) OR m.destination_warehouse IN (:...warehouseIds)))
          OR (m.movement_type IN (:...entryTypes) AND m.purchase_id IS NOT NULL AND
              m.purchase_id IN (SELECT p.id::text FROM purchases p WHERE p.company_id = m.company_id AND p.warehouse IN (:...warehouseIds2)))
        )`,
        {
          warehouseIds,
          warehouseIds2: warehouseIds,
          entryTypes: ['entry', 'return'],
          transferExitCodes: TRANSFER_EXIT_CODES,
          transferEntryCodes: TRANSFER_ENTRY_CODES,
          transferCodes: [...TRANSFER_EXIT_CODES, ...TRANSFER_ENTRY_CODES],
        },
      );
    }
    if (filters?.start_date) {
      qb.andWhere('m.created_at >= :start', { start: filters.start_date });
    }
    if (filters?.end_date) {
      qb.andWhere('m.created_at <= :end', { end: filters.end_date });
    }

    const movements = await qb.getMany();
    this.logger.log(
      `[getProductHistory] productCode=${productCode}, warehouse=${filters?.warehouse ?? 'ALL'}, ` +
        `warehouseIds=${warehouseIds.join('|')}, movements=${movements.length}, ` +
        `types=${movements.map((m) => m.movementType).join(',') || 'none'}`,
    );

    const allMovements = await this.movementRepo
      .createQueryBuilder('m')
      .leftJoin('m.items', 'i')
      .select(['m.id', 'm.movementType', 'm.productCode', 'm.sourceWarehouse', 'm.destinationWarehouse'])
      .where('m.company_id = :companyId', { companyId })
      .andWhere('(m.product_code = :productCode OR i.productCode = :productCode)', { productCode })
      .getMany();
    this.logger.log(
      `[getProductHistory] all product movements: ${JSON.stringify(
        allMovements.map((m) => ({
          id: m.id,
          type: m.movementType,
          productCode: m.productCode,
          source: m.sourceWarehouse,
          destination: m.destinationWarehouse,
        })),
      )}`,
    );

    const purchaseIds = [...new Set(movements.map((m) => m.purchaseId).filter((p): p is string => !!p))];
    const receptionReports = purchaseIds.length
      ? await this.dataSource
          .getRepository(ReceptionReport)
          .createQueryBuilder('r')
          .where('r.company_id = :companyId', { companyId })
          .andWhere('r.purchase_id IN (:...purchaseIds)', { purchaseIds })
          .getMany()
      : [];
    const reportByPurchase = new Map(receptionReports.map((r) => [r.purchaseId as string, r]));

    const inventories = await this.inventoryWarehouseService.findByCodes(companyId, [productCode]);
    const productInventories = inventories.get(productCode) || [];
    const reference = warehouseIds.length
      ? productInventories.find((inv) => warehouseIds.includes(inv.warehouseId))
      : productInventories[0];

    let balance = 0;
    const rows = movements.map((m) => {
      const item = (m.items || []).find((i) => i.productCode === productCode);
      const quantity = Number(item?.quantity ?? m.quantity ?? 0);
      const unitPrice = Number(item?.unitPrice ?? m.unitPrice ?? 0);
      const totalAmount = Number(item?.totalAmount ?? unitPrice * quantity);

      const isTransfer = m.movementType === 'transfer';
      const code = m.movementCode || '';
      const isTransferIn = isTransfer && isTransferEntryCode(code);
      const isTransferOut = isTransfer && isTransferExitCode(code);

      const isIncoming =
        m.movementType === 'entry' ||
        m.movementType === 'return' ||
        isTransferIn ||
        (isTransfer &&
          !isTransferIn &&
          !isTransferOut &&
          !!m.destinationWarehouse &&
          (!warehouseIds.length || warehouseIds.includes(m.destinationWarehouse)));
      const isOutgoing =
        m.movementType === 'exit' ||
        isTransferOut ||
        (isTransfer &&
          !isTransferIn &&
          !isTransferOut &&
          !!warehouseIds.length &&
          !!m.sourceWarehouse &&
          warehouseIds.includes(m.sourceWarehouse));

      const quantityIn = isIncoming && !isOutgoing ? quantity : 0;
      const quantityOut = isOutgoing ? quantity : 0;
      balance += quantityIn - quantityOut;

      const receptionReport = m.purchaseId ? reportByPurchase.get(m.purchaseId) : undefined;

      return {
        id: m.id,
        date: m.createdAt,
        movementCode: m.movementCode,
        movementDescription: m.movementDescription,
        concept: `${m.movementCode ?? ''} - ${m.movementDescription ?? ''}`.trim(),
        movementType: m.movementType,
        category: m.category,
        productUnit: item?.productUnit || reference?.productUnit || 'und',
        quantity,
        quantityIn,
        quantityOut,
        unitPrice,
        totalAmount,
        balance,
        reportNumber: receptionReport?.reportNumber || this.getReportNumber(m),
        reportType: this.getReportKind(m),
        purchaseId: m.purchaseId || null,
        voucherId: m.voucherId || null,
        sourceWarehouse: m.sourceWarehouse,
        destinationWarehouse: m.destinationWarehouse,
        reason: m.reason,
      };
    });

    return {
      productCode,
      productName: reference?.productName || productCode,
      productUnit: reference?.productUnit || 'und',
      warehouseId: reference?.warehouseId || null,
      warehouseName: reference?.warehouseName || null,
      currentBalance: reference?.stock ?? balance,
      unitPrice: reference?.unitPrice ?? 0,
      movements: rows,
    };
  }

  private getReportKind(m: Movement): 'reception' | 'delivery' | 'transfer' | 'return' {
    if (m.reportType) return m.reportType;
    if (m.movementType === 'exit') return 'delivery';
    if (m.movementType === 'transfer') return 'transfer';
    if (m.movementType === 'return') return 'return';
    return 'reception';
  }

  private getReportNumber(m: Movement): string {
    if (m.reportNumber) return m.reportNumber;
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

  private async enrichMovement(companyId: number, m: Movement) {
    const codes = m.productCode ? [m.productCode] : [];
    const inventoryMap = await this.inventoryWarehouseService.findByCodes(companyId, codes);
    return this.enrichMovementFromMap(m, inventoryMap);
  }

  private async createReturnReport(
    manager: EntityManager,
    companyId: number,
    movement: Movement,
    movType: MovementTypeDefinition,
    items: {
      productCode: string;
      productName: string;
      productUnit: string;
      quantity: number;
      unitPrice: number;
      totalAmount: number;
      expirationDate?: string | null;
    }[],
    opts: { warehouseId: string; warehouseName?: string; entity?: string; reason?: string; userName?: string },
  ): Promise<WarehouseReturn> {
    const returnNumber = await this.sequenceService.nextFormatted(
      companyId,
      'warehouse-return',
      'DA',
      { year: new Date().getFullYear(), padding: 4, includeYear: true },
    );

    const isPurchaseReturn = isPurchaseReturnCode(movement.movementCode || '');
    const totalAmount = items.reduce((sum, i) => sum + i.totalAmount, 0);

    const returnDoc = new WarehouseReturn();
    Object.assign(returnDoc, {
      companyId,
      returnNumber,
      returnDate: new Date().toISOString().split('T')[0],
      returnType: isPurchaseReturn ? 'supplier' : 'customer',
      returnReason: opts.reason || movType.description,
      supplierName: opts.entity || null,
      supplierNit: null,
      sourceWarehouseId: opts.warehouseId,
      sourceWarehouseName: opts.warehouseName || opts.warehouseId,
      destinationWarehouseId: null,
      destinationWarehouseName: null,
      returnedBy: opts.userName || 'System',
      status: 'processed',
      totalItems: items.length,
      totalAmount,
      notes: `Movimiento ${movement.movementCode} - ${movType.description}`,
    });
    const saved = await manager.getRepository(WarehouseReturn).save(returnDoc);

    const itemEntities = items.map((item, index) => {
      const entity = new WarehouseReturnItem();
      Object.assign(entity, {
        warehouseReturnId: saved.id,
        lineNumber: index + 1,
        productCode: item.productCode,
        productName: item.productName,
        productUnit: item.productUnit || 'und',
        quantityReturned: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalAmount,
        conditionStatus: 'good',
      });
      return entity;
    });
    await manager.getRepository(WarehouseReturnItem).save(itemEntities);

    movement.reportNumber = returnNumber;
    movement.reportType = 'return';
    await manager.getRepository(Movement).save(movement);

    this.logger.log(`Reporte de devolución ${returnNumber} generado para movimiento ${movement.id}`);
    return saved;
  }

  private async settleReturnAccounts(
    manager: EntityManager,
    companyId: number,
    movementCode: string,
    amount: number,
    entityName?: string,
  ): Promise<void> {
    if (amount <= 0) return;

    if (isPurchaseReturnCode(movementCode)) {
      const repo = manager.getRepository(AccountPayable);
      const baseQb = repo
        .createQueryBuilder('ap')
        .where('ap.company_id = :companyId', { companyId })
        .andWhere('ap.status IN (:...statuses)', { statuses: ['pending', 'partial', 'overdue'] })
        .andWhere('ap.balance_amount > 0');

      let payable: AccountPayable | null = null;
      const trimmedEntity = entityName?.trim();
      if (trimmedEntity) {
        payable = await baseQb
          .clone()
          .andWhere('LOWER(TRIM(ap.supplier_name)) = LOWER(TRIM(:supplierName))', {
            supplierName: trimmedEntity,
          })
          .orderBy('ap.created_at', 'DESC')
          .getOne();

        if (!payable) {
          payable = await baseQb
            .clone()
            .andWhere('ap.supplier_name ILIKE :supplierName', {
              supplierName: `%${trimmedEntity}%`,
            })
            .orderBy('ap.created_at', 'DESC')
            .getOne();
        }
      }

      if (!payable) {
        payable = await baseQb
          .clone()
          .orderBy('ap.created_at', 'DESC')
          .getOne();
      }

      if (!payable) {
        this.logger.warn(
          `Devolución ${movementCode}: no se encontró cuenta por pagar pendiente${trimmedEntity ? ` de ${trimmedEntity}` : ''}`,
        );
        return;
      }
      const previousBalance = toDecimal(payable.balanceAmount);
      const balance = roundDecimal(previousBalance - roundDecimal(amount));
      const settled = balance <= 0 || isSettled(balance);
      payable.balanceAmount = settled ? 0 : balance;
      payable.status = settled ? 'cancelled' : 'partial';
      payable.paidAmount = roundDecimal(
        toDecimal(payable.originalAmount) - payable.balanceAmount,
      );
      payable.notes = `${payable.notes ? payable.notes + ' | ' : ''}Devolución de compra ${movementCode}: -${roundDecimal(amount)}`;
      await repo.save(payable);
      this.logger.log(
        `Cuenta por pagar ${payable.apNumber} ajustada por devolución: saldo ${payable.balanceAmount} (${payable.status})`,
      );
      return;
    }

    if (isEntitySalesReturnCode(movementCode)) {
      const repo = manager.getRepository(AccountReceivable);
      const baseQb = repo
        .createQueryBuilder('ar')
        .where('ar.company_id = :companyId', { companyId })
        .andWhere('ar.status IN (:...statuses)', { statuses: ['pending', 'partial', 'overdue'] })
        .andWhere('ar.balance_amount > 0');

      let receivable: AccountReceivable | null = null;
      const trimmedEntity = entityName?.trim();
      if (trimmedEntity) {
        receivable = await baseQb
          .clone()
          .andWhere('LOWER(TRIM(ar.customer_name)) = LOWER(TRIM(:customerName))', {
            customerName: trimmedEntity,
          })
          .orderBy('ar.created_at', 'DESC')
          .getOne();

        if (!receivable) {
          receivable = await baseQb
            .clone()
            .andWhere('ar.customer_name ILIKE :customerName', {
              customerName: `%${trimmedEntity}%`,
            })
            .orderBy('ar.created_at', 'DESC')
            .getOne();
        }
      }

      if (!receivable) {
        receivable = await baseQb
          .clone()
          .orderBy('ar.created_at', 'DESC')
          .getOne();
      }

      if (!receivable) {
        this.logger.warn(
          `Devolución ${movementCode}: no se encontró cuenta por cobrar pendiente${trimmedEntity ? ` de ${trimmedEntity}` : ''}`,
        );
        return;
      }
      const previousBalance = toDecimal(receivable.balanceAmount);
      const balance = roundDecimal(previousBalance - roundDecimal(amount));
      const settled = balance <= 0 || isSettled(balance);
      receivable.balanceAmount = settled ? 0 : balance;
      receivable.paidAmount = roundDecimal(
        toDecimal(receivable.originalAmount) - receivable.balanceAmount,
      );
      if (settled) {
        receivable.status = 'written_off';
        receivable.writtenOffDate = new Date().toISOString().split('T')[0];
        receivable.writtenOffReason = `Devolución de ventas ${movementCode}`;
      } else {
        receivable.status = 'partial';
      }
      receivable.collectionNotes = `${receivable.collectionNotes ? receivable.collectionNotes + ' | ' : ''}Devolución de ventas ${movementCode}: -${roundDecimal(amount)}`;
      await repo.save(receivable);
      this.logger.log(
        `Cuenta por cobrar ${receivable.arNumber} ajustada por devolución: saldo ${receivable.balanceAmount} (${receivable.status})`,
      );
    }
  }

  // ══════════════════════════════════════════════════════════
  // ── VENTA / DEVOLUCIÓN DE VENTA (llamadas desde Facturación) ──
  // ══════════════════════════════════════════════════════════

  /**
   * Códigos de movimiento de salida por venta según el catálogo cubano.
   * Facturación NO los necesita: el subsistema de inventario es el único
   * responsable de mapear categoría + tipo de venta → código oficial.
   */
  private static readonly SALE_MOVEMENT_CODES: Record<
    InventoryCategory,
    { client: string; worker: string; returnClient: string; returnWorker: string }
  > = {
    insumo: {
      client: '1101',
      worker: '1101',
      returnClient: '107',
      returnWorker: '106',
    },
    mercancia: {
      client: '2100',
      worker: '2101',
      returnClient: '207',
      returnWorker: '206',
    },
    produccion: {
      client: '3100',
      worker: '3101',
      returnClient: '307',
      returnWorker: '306',
    },
  };

  /**
   * Registra la SALIDA de inventario por venta y contabiliza el COSTO DE
   * VENTAS (810/814 D / Inventario H).
   *
   * Invocado por InvoicesService dentro de su transacción. Hace TODO lo que
   * es competencia de inventario:
   *   - captura el WAC por producto ANTES de la salida
   *   - descuenta stock
   *   - crea el Movement (uno) y sus MovementItems (uno por producto)
   *   - genera el voucher de costo con sourceModule='inventory'
   *   - enlaza movement.voucherId = voucher.id
   *
   * Facturación se queda solo con lo comercial: la venta (135/900).
   */
  async registerSaleExit(
    companyId: number,
    data: {
      invoiceId: string;
      invoiceNumber: string;
      saleType: 'client' | 'worker';
      warehouseId?: string;
      items: Array<{ productCode: string; quantity: number }>;
      userName?: string;
    },
    manager: EntityManager,
  ): Promise<{
    movement: Movement | null;
    totalCost: number;
    costLines: any[];
    movementItems: Partial<MovementItem>[];
    itemCosts: Map<string, { unitCost: number; totalCost: number; quantity: number }>;
    warehouseId: string | null;
    warehouseName: string | null;
  }> {
    if (!data.items?.length) {
      throw new BadRequestException(
        'registerSaleExit requiere al menos un producto',
      );
    }

    const userName = data.userName || 'System';
    const warehouseFilter = data.warehouseId;

    // 1. Inventario en batch
    const productCodes = [...new Set(data.items.map((i) => i.productCode))];
    const inventoryMap = await this.inventoryWarehouseService.findByCodes(
      companyId,
      productCodes,
    );

    // 2. Agregar cantidades por producto (una línea por producto en el voucher)
    const aggregated = new Map<string, number>();
    for (const item of data.items) {
      aggregated.set(
        item.productCode,
        (aggregated.get(item.productCode) || 0) + Number(item.quantity),
      );
    }

    const costOfSalesAccount =
      (await this.accountMappingService.getAccountForMapping(
        companyId,
        MappingType.INVENTORY_EXIT,
      )) || '814';

    const itemCosts = new Map<
      string,
      { unitCost: number; totalCost: number; quantity: number }
    >();
    const movementItems: Partial<MovementItem>[] = [];
    const costLines: any[] = [];
    let totalCost = 0;
    let resolvedWarehouseId: string | null = null;
    let resolvedWarehouseName: string | null = null;
    let categoryForMovement: InventoryCategory = 'mercancia';

    // 3. Procesar cada producto
    for (const [productCode, totalQuantity] of aggregated) {
      const inventories = inventoryMap.get(productCode) || [];
      const inventory = warehouseFilter
        ? inventories.find((i) => i.warehouseId === warehouseFilter)
        : inventories[0];

      if (!inventory) {
        // Productos sin stock (servicios o no inventariables): se omiten del
        // movimiento y del costo, igual que en el diseño anterior.
        this.logger.warn(
          `Producto ${productCode} sin inventario${warehouseFilter ? ` en ${warehouseFilter}` : ''}; se omite del movimiento y del costo`,
        );
        continue;
      }

      // Categoría: del producto maestro; fallback 'mercancia'
      const product = await this.productsService.findByCode(companyId, productCode);
      const category = (product?.category as InventoryCategory) || 'mercancia';
      if (!resolvedWarehouseId) {
        categoryForMovement = category;
        resolvedWarehouseId = inventory.warehouseId;
        resolvedWarehouseName = inventory.warehouseName;
      }

      // WAC capturado ANTES de la salida
      const unitCost = Number(inventory.unitPrice) || 0;
      const lineTotal = roundDecimal(unitCost * totalQuantity);

      // Descontar stock
      await this.inventoryWarehouseService.updateStock(
        companyId,
        productCode,
        inventory.warehouseId,
        totalQuantity,
        'exit',
        undefined,
        manager,
      );

      itemCosts.set(productCode, { unitCost, totalCost: lineTotal, quantity: totalQuantity });
      totalCost = roundDecimal(totalCost + lineTotal);

      movementItems.push({
        productCode,
        productName: inventory.productName,
        quantity: totalQuantity,
        unitPrice: unitCost,
        totalAmount: lineTotal,
        productUnit: inventory.productUnit || 'und',
        productDescription: inventory.productDescription || null,
      });

      // Voucher de costo: 2 líneas por producto
      costLines.push({
        accountCode: costOfSalesAccount,
        debit: lineTotal,
        credit: 0,
        description: `Costo venta ${productCode} (CPP: ${unitCost})`,
      });
      costLines.push({
        accountCode: getInventoryAccountByCategory(category),
        debit: 0,
        credit: lineTotal,
        description: `Salida inventario ${productCode} (CPP: ${unitCost})`,
      });
    }

    // Sin productos inventariables → no hay movimiento ni coste que registrar
    if (!movementItems.length) {
      return {
        movement: null,
        totalCost: 0,
        costLines: [],
        movementItems: [],
        itemCosts,
        warehouseId: null,
        warehouseName: null,
      };
    }

    // 4. Crear el Movement (uno solo con todos los items)
    const saleCodes = MovementsService.SALE_MOVEMENT_CODES[categoryForMovement];
    const movementCode =
      data.saleType === 'worker' ? saleCodes.worker : saleCodes.client;
    const movType = getMovementType(movementCode);

    const movement = await manager.getRepository(Movement).save(
      this.movementRepo.create({
        companyId,
        movementType: 'exit',
        movementCode,
        movementDescription: movType?.description || 'Ventas a Clientes',
        category: categoryForMovement,
        productCode: aggregated.size === 1 ? [...aggregated.keys()][0] : null,
        quantity: [...aggregated.values()].reduce((s, q) => s + q, 0),
        unitPrice:
          aggregated.size === 1
            ? itemCosts.get([...aggregated.keys()][0])!.unitCost
            : 0,
        totalAmount: totalCost,
        itemCount: movementItems.length,
        reason: `Factura ${data.invoiceNumber}`,
        sourceWarehouse: resolvedWarehouseId!,
        userName,
      }),
    );

    // 5. Guardar MovementItems
    if (movementItems.length) {
      const itemEntities = movementItems.map((mi) => {
        const entity = new MovementItem();
        Object.assign(entity, { ...mi, movementId: movement.id });
        return entity;
      });
      await manager.getRepository(MovementItem).save(itemEntities);
    }

    // 6. Voucher de costo (sourceModule='inventory')
    if (costLines.length && totalCost > 0) {
      const costVoucher = await this.voucherService.createVoucherFromModule(
        companyId,
        'inventory',
        `${data.invoiceId}-cost`,
        {
          date: new Date().toISOString().split('T')[0],
          description: `Costo de ventas - Factura ${data.invoiceNumber}`,
          type: 'cost_of_sales',
          reference: `COST-FAC-${data.invoiceNumber}`,
          createdBy: userName,
          lines: costLines,
        },
        manager,
      );

      movement.voucherId = costVoucher.id;
      await manager.getRepository(Movement).update(movement.id, {
        voucherId: costVoucher.id,
      });
      this.logger.log(
        `Comprobante de costo ${costVoucher.voucherNumber} generado para la factura ${data.invoiceNumber} y enlazado al movimiento ${movement.id}`,
      );
    }

    return {
      movement,
      totalCost,
      costLines,
      movementItems,
      itemCosts,
      warehouseId: resolvedWarehouseId,
      warehouseName: resolvedWarehouseName,
    };
  }

  /**
   * Registra la DEVOLUCIÓN al inventario por anulación de factura y
   * contabiliza el REVERSO del costo de ventas (Inventario D / 810/814 H).
   *
   * Invocado por InvoicesService dentro de su transacción de anulación.
   */
  async registerSaleReturn(
    companyId: number,
    data: {
      invoiceId: string;
      invoiceNumber: string;
      originalMovementIds: string[];
      userName?: string;
    },
    manager: EntityManager,
  ): Promise<{
    movement: Movement;
    totalCost: number;
    costLines: any[];
  }> {
    if (!data.originalMovementIds?.length) {
      throw new BadRequestException(
        'registerSaleReturn requiere al menos un movimiento de salida original',
      );
    }

    const userName = data.userName || 'System';
    const reversalDate = new Date().toISOString().split('T')[0];

    const originalMovements = await manager.getRepository(Movement).find({
      where: {
        id: In(data.originalMovementIds),
        companyId,
      },
      relations: ['items'],
    });

    if (!originalMovements.length) {
      throw new NotFoundException(
        `No se encontraron movimientos de salida para la factura ${data.invoiceNumber}`,
      );
    }

    const costOfSalesAccount =
      (await this.accountMappingService.getAccountForMapping(
        companyId,
        MappingType.INVENTORY_EXIT,
      )) || '810';

    const itemCosts = new Map<
      string,
      { unitCost: number; totalCost: number; quantity: number; productName: string; productUnit: string }
    >();
    const movementItems: Partial<MovementItem>[] = [];
    const costLines: any[] = [];
    let totalCost = 0;
    let resolvedWarehouseId: string | null = null;
    let categoryForMovement: InventoryCategory = 'mercancia';
    let originalCode = '2100';

    for (const movement of originalMovements) {
      if (!originalCode || originalCode === '2100') {
        originalCode = movement.movementCode || originalCode;
      }
      const lines = movement.items?.length
        ? movement.items
        : ([movement] as any[]);

      for (const line of lines) {
        const productCode = line.productCode;
        if (!productCode) continue;

        const quantity = Number(line.quantity) || 0;
        const unitCost = Number(line.unitPrice) || 0;
        const lineTotal = roundDecimal(unitCost * quantity);
        const category =
          (line.category as InventoryCategory) ||
          (movement.category as InventoryCategory) ||
          'mercancia';

        if (!resolvedWarehouseId) {
          resolvedWarehouseId = movement.sourceWarehouse;
          categoryForMovement = category;
        }

        // Reingreso al inventario al mismo costo de salida
        if (movement.sourceWarehouse) {
          await this.inventoryWarehouseService.updateStock(
            companyId,
            productCode,
            movement.sourceWarehouse,
            quantity,
            'entry',
            unitCost,
            manager,
          );
        }

        const existing = itemCosts.get(productCode);
        itemCosts.set(productCode, {
          unitCost,
          totalCost: (existing?.totalCost || 0) + lineTotal,
          quantity: (existing?.quantity || 0) + quantity,
          productName: line.productName || productCode,
          productUnit: line.productUnit || 'und',
        });
        totalCost = roundDecimal(totalCost + lineTotal);

        movementItems.push({
          productCode,
          productName: line.productName || productCode,
          quantity,
          unitPrice: unitCost,
          totalAmount: lineTotal,
          productUnit: line.productUnit || 'und',
        });

        // Reverso del costo de ventas: 2 líneas por producto
        costLines.push({
          accountCode: getInventoryAccountByCategory(category),
          debit: lineTotal,
          credit: 0,
          description: `Reingreso inventario ${productCode} por anulación ${data.invoiceNumber}`,
        });
        costLines.push({
          accountCode: costOfSalesAccount,
          debit: 0,
          credit: lineTotal,
          description: `Reverso costo de ventas ${productCode} (CPP: ${unitCost})`,
        });
      }
    }

    // Determinar código de devolución a partir del código original
    const isWorkerSale = ['1101', '2101', '3101'].includes(originalCode);
    const saleCodes = MovementsService.SALE_MOVEMENT_CODES[categoryForMovement];
    const returnCode = isWorkerSale
      ? saleCodes.returnWorker
      : saleCodes.returnClient;
    const returnType = getMovementType(returnCode);

    // Crear movimiento de devolución
    const returnMovement = await manager.getRepository(Movement).save(
      this.movementRepo.create({
        companyId,
        movementType: 'entry',
        movementCode: returnCode,
        movementDescription: returnType?.description || 'Devolución de ventas',
        category: categoryForMovement,
        productCode: itemCosts.size === 1 ? [...itemCosts.keys()][0] : null,
        quantity: movementItems.reduce((s, mi) => s + Number(mi.quantity || 0), 0),
        unitPrice:
          itemCosts.size === 1
            ? [...itemCosts.values()][0].unitCost
            : 0,
        totalAmount: totalCost,
        itemCount: movementItems.length,
        reason: `Anulación factura ${data.invoiceNumber}`,
        destinationWarehouse: resolvedWarehouseId,
        userName,
      }),
    );

    // Guardar MovementItems del reverso
    if (movementItems.length) {
      const itemEntities = movementItems.map((mi) => {
        const entity = new MovementItem();
        Object.assign(entity, { ...mi, movementId: returnMovement.id });
        return entity;
      });
      await manager.getRepository(MovementItem).save(itemEntities);
    }

    // Voucher de reverso de costo (sourceModule='inventory')
    if (costLines.length && totalCost > 0) {
      const costVoucher = await this.voucherService.createVoucherFromModule(
        companyId,
        'inventory',
        `${data.invoiceId}-cost-reversal`,
        {
          date: reversalDate,
          description: `Reverso costo de ventas - Anulación factura ${data.invoiceNumber}`,
          type: 'nota_credito',
          reference: `REV-COST-${data.invoiceNumber}`,
          createdBy: userName,
          lines: costLines,
        },
        manager,
      );

      returnMovement.voucherId = costVoucher.id;
      await manager.getRepository(Movement).update(returnMovement.id, {
        voucherId: costVoucher.id,
      });
      this.logger.log(
        `Comprobante de reverso de costo ${costVoucher.voucherNumber} generado para la anulación de ${data.invoiceNumber} y enlazado al movimiento ${returnMovement.id}`,
      );
    }

    return {
      movement: returnMovement,
      totalCost,
      costLines,
    };
  }

  // ══════════════════════════════════════════════════════════
  // ── RESTO DE MÉTODOS (createDirectEntry, createExit, createTransfer, ...) ──
  // ══════════════════════════════════════════════════════════
  // (Idénticos al original — no se modifican en este cambio.)

  async createDirectEntry(
    companyId: number,
    data: any,
    userName?: string,
  ) {
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

    const warehouse = await this.warehousesService.findByIdOrCode(
      companyId,
      data.warehouseId,
    );
    if (!warehouse) {
      throw new NotFoundException(`Almacén ${data.warehouseId} no encontrado`);
    }

    const category = data.category || movType.category;

    const result = await this.dataSource.transaction(async (manager) => {
      let grandTotal = 0;
      const movementItems: Partial<MovementItem>[] = [];

      for (const item of items) {
        const unitPrice = toDecimal(item.unitPrice);
        const totalAmount = roundDecimal(unitPrice * item.quantity);
        grandTotal = roundDecimal(grandTotal + totalAmount);

        await this.productsService.ensureProduct(companyId, {
          productCode: item.productCode,
          productName: item.productName,
          productDescription: item.productDescription,
          productUnit: item.unit,
          category,
        });

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

      const isReturn = isReturnCode(data.movementCode);

      const mov = this.movementRepo.create({
        companyId,
        movementType: isReturn ? 'return' : 'entry',
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

      if (items.length > 0) {
        const itemEntities = movementItems.map(mi => {
          const entity = new MovementItem();
          Object.assign(entity, { ...mi, movementId: savedMov.id });
          return entity;
        });
        await manager.getRepository(MovementItem).save(itemEntities);
      }

      await this.generateAccountingVoucher(companyId, savedMov, movType, grandTotal, userName, {
        debitAccountCode: data.debitAccountCode,
        creditAccountCode: data.creditAccountCode,
      }, manager);

      if (isReturnCode(data.movementCode)) {
        await this.createReturnReport(
          manager,
          companyId,
          savedMov,
          movType,
          movementItems.map((mi) => ({
            productCode: mi.productCode as string,
            productName: mi.productName as string,
            productUnit: mi.productUnit || 'und',
            quantity: Number(mi.quantity),
            unitPrice: Number(mi.unitPrice || 0),
            totalAmount: Number(mi.totalAmount || 0),
          })),
          {
            warehouseId: data.warehouseId,
            entity: data.entity,
            reason: data.label || movType.description,
            userName,
          },
        );
        await this.settleReturnAccounts(manager, companyId, data.movementCode, grandTotal, data.entity);
      }

      return savedMov;
    });

    for (const item of items) {
      await this.postMovementHook(companyId, result.id, item.productCode, data.warehouseId, 'entry', item.quantity, userName);
    }

    return this.enrichMovement(companyId, result);
  }

  async createExit(companyId: number, data: any, userName?: string) {
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

    const exitWarehouse = await this.warehousesService.findByIdOrCode(
      companyId,
      data.warehouseId,
    );
    if (!exitWarehouse) {
      throw new NotFoundException(`Almacén ${data.warehouseId} no encontrado`);
    }

    const category = data.category || movType.category;
    const isReturn = isReturnCode(data.movementCode);
    const isPurchaseReturn = isPurchaseReturnCode(data.movementCode);

    const productCodes = items.map((i: any) => i.productCode);
    const inventoryMap = await this.inventoryWarehouseService.findByCodes(companyId, productCodes);

    const result = await this.dataSource.transaction(async (manager) => {
      let grandTotal = 0;
      const movementItems: Partial<MovementItem>[] = [];
      const valeProducts: any[] = [];

      let purchaseReturnPrices = new Map<string, { totalPrice: number; quantity: number }>();
      if (isPurchaseReturn) {
        const rows: any[] = await manager.query(
          `SELECT DISTINCT ON (pp.product_code) pp.product_code, pp.total_price, pp.quantity
           FROM purchase_products pp
           INNER JOIN purchases p ON p.id = pp.purchase_id
           WHERE p.company_id = $1 AND p.warehouse = $2 AND pp.product_code = ANY($3)
           ORDER BY pp.product_code, p.created_at DESC`,
          [companyId, data.warehouseId, productCodes],
        );
        for (const r of rows) {
          purchaseReturnPrices.set(r.product_code, {
            totalPrice: Number(r.total_price),
            quantity: Number(r.quantity),
          });
        }
      }

      for (const item of items) {
        const inventories = inventoryMap.get(item.productCode) || [];
        const inventory = inventories.find((inv) => inv.warehouseId === data.warehouseId);

        let unitPrice: number;
        let totalAmount: number;
        const purchasePrice = isPurchaseReturn ? purchaseReturnPrices.get(item.productCode) : undefined;
        if (purchasePrice && item.quantity === purchasePrice.quantity) {
          totalAmount = roundDecimal(purchasePrice.totalPrice);
          unitPrice = roundDecimal(totalAmount / item.quantity);
        } else {
          unitPrice = toDecimal(inventory?.unitPrice);
          totalAmount = roundDecimal(unitPrice * item.quantity);
        }
        grandTotal = roundDecimal(grandTotal + totalAmount);

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

      const savedMov = await manager.getRepository(Movement).save(
        this.movementRepo.create({
          companyId,
          movementType: isReturn ? 'return' : 'exit',
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

      if (items.length > 0) {
        const itemEntities = movementItems.map((mi) => {
          const entity = new MovementItem();
          Object.assign(entity, { ...mi, movementId: savedMov.id });
          return entity;
        });
        await manager.getRepository(MovementItem).save(itemEntities);
      }

      const firstInventory = (inventoryMap.get(items[0].productCode) || [])
        .find((inv) => inv.warehouseId === data.warehouseId);

      if (isReturn) {
        await this.createReturnReport(
          manager,
          companyId,
          savedMov,
          movType,
          movementItems.map((mi) => ({
            productCode: mi.productCode as string,
            productName: mi.productName as string,
            productUnit: mi.productUnit || 'und',
            quantity: Number(mi.quantity),
            unitPrice: Number(mi.unitPrice || 0),
            totalAmount: Number(mi.totalAmount || 0),
          })),
          {
            warehouseId: data.warehouseId,
            warehouseName: firstInventory?.warehouseName,
            entity: data.entity,
            reason: data.reason || movType.description,
            userName,
          },
        );
      } else {
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
      }

      await this.generateAccountingVoucher(companyId, savedMov, movType, grandTotal, userName, {
        debitAccountCode: data.debitAccountCode,
        creditAccountCode: data.creditAccountCode,
      }, manager);

      if (isReturn) {
        await this.settleReturnAccounts(manager, companyId, data.movementCode, grandTotal, data.entity);
      }

      return savedMov;
    });

    for (const item of items) {
      await this.postMovementHook(companyId, result.id, item.productCode, data.warehouseId, 'exit', item.quantity, userName);
    }

    return this.enrichMovement(companyId, result);
  }

  async createTransfer(companyId: number, data: any, userName?: string) {
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

    const exitMovType = getMovementType(data.movementCode);
    if (!exitMovType) {
      throw new BadRequestException(`Código de movimiento inválido: ${data.movementCode}`);
    }

    if (!isTransferExitCode(data.movementCode)) {
      throw new BadRequestException(
        `Código ${data.movementCode} no es un código de transferencia válido. Use 1102 (insumo), 2102 (mercancía) o 3102 (producción).`,
      );
    }

    const entryCode = getTransferEntryCode(data.movementCode);
    const entryMovType = entryCode ? getMovementType(entryCode) : null;
    if (!entryCode || !entryMovType) {
      throw new BadRequestException(
        `No se encontró código de entrada correspondiente para transferencia ${data.movementCode}`,
      );
    }

    const category = data.category || exitMovType.category;

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

    const productCodes = items.map((i: any) => i.productCode);
    const inventoryMap = await this.inventoryWarehouseService.findByCodes(companyId, productCodes);

    let grandTotal = 0;
    const exitItems: Partial<MovementItem>[] = [];
    const entryItems: Partial<MovementItem>[] = [];

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const item of items) {
        const inventories = inventoryMap.get(item.productCode) || [];
        const sourceInv = inventories.find((inv: any) => inv.warehouseId === data.sourceWarehouseId);
        const unitPrice = sourceInv?.unitPrice || 0;
        const totalAmount = unitPrice * item.quantity;
        grandTotal += totalAmount;

        await this.inventoryWarehouseService.transferStock(
          companyId,
          {
            productCode: item.productCode,
            quantity: item.quantity,
            sourceWarehouseId: data.sourceWarehouseId,
            destinationWarehouseId: data.destinationWarehouseId,
          },
          queryRunner.manager,
        );

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

      const exitMov = await queryRunner.manager.save(
        this.movementRepo.create({
          companyId,
          movementType: 'transfer' as MovementType,
          movementCode: data.movementCode,
          movementDescription: exitMovType.description,
          category,
          productCode: items.length === 1 ? items[0].productCode : null,
          quantity: items.reduce((sum: number, i: any) => sum + i.quantity, 0),
          unitPrice: items.length === 1 ? (exitItems[0].unitPrice || 0) : 0,
          totalAmount: grandTotal,
          itemCount: items.length,
          reason: transferReason,
          sourceWarehouse: data.sourceWarehouseId,
          destinationWarehouse: data.destinationWarehouseId,
          userName: userName || 'System',
        }),
      );

      const entryMov = await queryRunner.manager.save(
        this.movementRepo.create({
          companyId,
          movementType: 'transfer' as MovementType,
          movementCode: entryCode,
          movementDescription: entryMovType.description,
          category,
          productCode: items.length === 1 ? items[0].productCode : null,
          quantity: items.reduce((sum: number, i: any) => sum + i.quantity, 0),
          unitPrice: items.length === 1 ? (entryItems[0].unitPrice || 0) : 0,
          totalAmount: grandTotal,
          itemCount: items.length,
          reason: transferReason,
          sourceWarehouse: data.sourceWarehouseId,
          destinationWarehouse: data.destinationWarehouseId,
          userName: userName || 'System',
        }),
      );

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
        await queryRunner.manager.save(MovementItem, [
          ...exitItemEntities,
          ...entryItemEntities,
        ]);
      }

      const [sourceWh, destinationWh] = await Promise.all([
        this.warehousesService.findByIdOrCode(companyId, data.sourceWarehouseId),
        this.warehousesService.findByIdOrCode(companyId, data.destinationWarehouseId),
      ]);
      const sourceName = sourceWh?.name || data.sourceWarehouseId;
      const destinationName = destinationWh?.name || data.destinationWarehouseId;
      const linkNote = `(${sourceName} → ${destinationName})`;

      await queryRunner.manager.update(Movement, exitMov.id, {
        relatedMovementId: entryMov.id,
        reason: `${transferReason} ${linkNote}`,
      });
      await queryRunner.manager.update(Movement, entryMov.id, {
        relatedMovementId: exitMov.id,
        reason: `${transferReason} ${linkNote}`,
      });

      await queryRunner.commitTransaction();

      this.logger.log(
        `Transferencia intra-empresa procesada: ${exitMov.id} → ${entryMov.id} (sin contabilización)`,
      );

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
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Error en transferencia: ${err.message}`, err.stack);
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async createReturn(companyId: number, data: any, userName?: string) {
    let items = data.items || [];
    if (!items.length && data.product_code && data.quantity) {
      items = [{ productCode: data.product_code, quantity: data.quantity, costCenterId: data.costCenterId, subelementId: data.subelementId }];
    }

    if (!items.length) {
      throw new BadRequestException('Debe incluir al menos un producto');
    }

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
    const productCodes = items.map((i: any) => i.productCode);
    const inventoryMap = await this.inventoryWarehouseService.findByCodes(companyId, productCodes);

    const result = await this.dataSource.transaction(async (manager) => {
      let grandTotal = 0;
      const movementItems: Partial<MovementItem>[] = [];
      const valeProducts: any[] = [];

      for (const item of items) {
        const inventories = inventoryMap.get(item.productCode) || [];
        const inventory = inventories.find((inv: any) => inv.warehouseId === data.warehouseId);
        const unitPrice = toDecimal(inventory?.unitPrice);
        const totalAmount = roundDecimal(unitPrice * item.quantity);
        grandTotal = roundDecimal(grandTotal + totalAmount);

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

      const savedMov = await manager.getRepository(Movement).save(
        this.movementRepo.create({
          companyId,
          movementType: 'return',
          movementCode: data.movementCode,
          movementDescription: movType.description,
          category,
          productCode: items.length === 1 ? items[0].productCode : null,
          quantity: items.reduce((sum: number, i: any) => sum + i.quantity, 0),
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

      if (items.length > 0) {
        const itemEntities = movementItems.map((mi) => {
          const entity = new MovementItem();
          Object.assign(entity, { ...mi, movementId: savedMov.id });
          return entity;
        });
        await manager.getRepository(MovementItem).save(itemEntities);
      }

      const firstInventory = (inventoryMap.get(items[0].productCode) || [])
        .find((inv: any) => inv.warehouseId === data.warehouseId);
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

      await this.generateAccountingVoucher(companyId, savedMov, movType, grandTotal, userName, {
        debitAccountCode: data.debitAccountCode,
        creditAccountCode: data.creditAccountCode,
      }, manager);

      await this.settleReturnAccounts(manager, companyId, data.movementCode, grandTotal, data.entity);

      return savedMov;
    });

    for (const item of items) {
      await this.postMovementHook(companyId, result.id, item.productCode, data.warehouseId, 'return', item.quantity, userName);
    }

    return this.enrichMovement(companyId, result);
  }

  async getTransfersByWarehouse(companyId: number, warehouseId: string, filters?: any) {
    const qb = this.movementRepo
      .createQueryBuilder('m')
      .where('m.company_id = :companyId', { companyId })
      .andWhere('m.movement_type = :movementType', { movementType: 'transfer' });

    if (filters?.type === 'incoming') {
      qb.andWhere('m.destination_warehouse = :warehouseId', { warehouseId });
    } else if (filters?.type === 'outgoing') {
      qb.andWhere('m.source_warehouse = :warehouseId', { warehouseId });
    } else {
      qb.andWhere('(m.source_warehouse = :warehouseId OR m.destination_warehouse = :warehouseId)', { warehouseId });
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

  async resolveShortage(companyId: number, movementId: string, data: any, userName?: string) {
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
      throw new BadRequestException('El expediente de este faltante ya fue resuelto');
    }
    if (data.resolution === 'responsible' && !data.responsibleName) {
      throw new BadRequestException('Debe indicar el responsable al que se carga el faltante');
    }

    const amount = Number(movement.totalAmount || 0);
    if (amount <= 0) {
      throw new BadRequestException('El faltante no tiene importe: no procede asiento de resolución');
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

    return this.enrichMovement(companyId, movement);
  }

  async resolveSurplus(companyId: number, movementId: string, data: any, userName?: string) {
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
      throw new BadRequestException('El expediente de este sobrante ya fue resuelto');
    }

    const amount = Number(movement.totalAmount || 0);
    if (amount <= 0) {
      throw new BadRequestException('El sobrante no tiene importe: no procede asiento de resolución');
    }

    const date = data.resolutionDate || new Date().toISOString().split('T')[0];
    const movType = getMovementType(movement.movementCode || '');

    const investigationAccount =
      (await this.accountMappingService.getAccountForMapping(
        companyId,
        MappingType.INVENTORY_SURPLUS_INVESTIGATION,
      )) || '555';

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

    return this.enrichMovement(companyId, movement);
  }

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

    let debitAccount = overrides?.debitAccountCode || '';
    let creditAccount = overrides?.creditAccountCode || '';

    const accountingEntry = getAccountingEntryForMovement(movement.movementCode);
    if (!accountingEntry) {
      this.logger.warn(
        `No se encontró mapeo contable para código de movimiento: ${movement.movementCode}`,
      );
      return;
    }

    if (!debitAccount) debitAccount = accountingEntry.debitAccountCode || '';
    if (!creditAccount) creditAccount = accountingEntry.creditAccountCode || '';

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

    const accountRepo = manager ? manager.getRepository(Account) : this.voucherService['accountRepo'];
    const debitAcc = await accountRepo.findOneBy({ code: debitAccount, companyId });
    if (!debitAcc) {
      this.logger.warn(`Cuenta débito ${debitAccount} no existe para la empresa. Usando cuenta de inventario por categoría.`);
      debitAccount = getInventoryAccountByCategory(movType.category);
    }

    const creditAcc = await accountRepo.findOneBy({ code: creditAccount, companyId });
    if (!creditAcc) {
      this.logger.warn(`Cuenta crédito ${creditAccount} no existe para la empresa. Usando cuenta por defecto según tipo.`);
      if (['102', '202', '402'].includes(movement.movementCode)) {
        creditAccount = '406';
      } else if (['1107', '2107'].includes(movement.movementCode)) {
        creditAccount = '406';
      } else if (['106', '206', '306', '107', '207', '307'].includes(movement.movementCode)) {
        creditAccount = movType.category === 'mercancia' ? '814' : '810';
      } else {
        creditAccount = accountingEntry.creditAccountCode;
      }
    }

    if (!debitAccount || !creditAccount) {
      throw new BadRequestException(
        `No se pudieron determinar cuentas contables válidas para el movimiento ${movement.movementCode}. ` +
          `Débito: ${debitAccount || '(vacío)'}, Crédito: ${creditAccount || '(vacío)'}. ` +
          `Configure el mapeo de cuentas antes de registrar este movimiento.`,
      );
    }

    try {
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
          description: movement.productCode
            ? `${movType.description} - ${movement.productCode} x${movement.quantity ?? 0}`
            : `${movType.description} - ${movement.quantity ?? 0} unidades (${movement.itemCount ?? 0} productos)`,
          type: 'inventory',
          reference: `MOV-${movement.movementCode}-${movement.id.substring(0, 8)}`,
          createdBy: userName || 'Sistema',
          lines: voucherLines,
        },
        manager,
      );

      movement.voucherId = voucher.id;
      const movementRepo = manager ? manager.getRepository(Movement) : this.movementRepo;
      await movementRepo.update(movement.id, { voucherId: voucher.id });

      this.logger.log(
        `Comprobante ${voucher.voucherNumber} generado para movimiento ${movement.movementCode} (${movement.id})`,
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Error al generar comprobante para movimiento ${movement.id}: ${err.message}`,
        err.stack,
      );
      throw err;
    }
  }
}