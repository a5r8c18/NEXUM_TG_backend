/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InventoryService } from '../inventory/inventory.service';
import { Movement } from '../entities/movement.entity';
import { DeliveryReport } from '../entities/delivery-report.entity';

@Injectable()
export class MovementsService {
  constructor(
    private readonly inventoryService: InventoryService,
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

    qb.orderBy('m.created_at', 'DESC');
    const result = await qb.getMany();

    if (filters?.product_name) {
      const search = filters.product_name.toLowerCase();
      const enriched: any[] = [];
      for (const m of result) {
        const inv = await this.inventoryService.findByCode(
          companyId,
          m.productCode,
        );
        if (inv && inv.productName.toLowerCase().includes(search)) {
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
    const inv = await this.inventoryService.findByCode(
      companyId,
      m.productCode,
    );
    return {
      id: m.id,
      product: inv
        ? {
            productName: inv.productName,
            productCode: inv.productCode,
            stock: inv.stock,
            entity: inv.entity,
            warehouse: inv.warehouse,
            unitPrice: inv.unitPrice,
            productUnit: inv.productUnit || 'und',
          }
        : {
            productName: m.productCode,
            productCode: m.productCode,
            stock: 0,
            entity: '',
            warehouse: '',
            unitPrice: 0,
            productUnit: 'und',
          },
      type: m.movementType.toUpperCase(),
      quantity: m.quantity,
      createdAt: m.createdAt,
      reason: m.reason,
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
      warehouse?: string;
      unitPrice?: number;
      unit?: string;
    },
    userName?: string,
  ) {
    if (data.quantity <= 0) {
      throw new BadRequestException('La cantidad debe ser mayor a 0');
    }

    await this.inventoryService.ensureProduct(companyId, {
      productCode: data.productCode,
      productName: data.productName,
      productUnit: data.unit,
      unitPrice: data.unitPrice,
      warehouse: data.warehouse,
      entity: data.entity,
      productDescription: data.productDescription,
    });

    await this.inventoryService.updateStock(
      companyId,
      data.productCode,
      data.quantity,
      'entry',
    );

    const mov = await this.movementRepo.save(
      this.movementRepo.create({
        companyId,
        movementType: 'entry',
        productCode: data.productCode,
        quantity: data.quantity,
        reason: data.label || 'Entrada directa',
        label: data.label || null,
        userName: userName || 'System',
      }),
    );
    return this.enrichMovement(companyId, mov);
  }

  async createExit(
    companyId: number,
    data: {
      product_code: string;
      quantity: number;
      reason?: string;
      entity?: string;
      warehouse?: string;
    },
    userName?: string,
  ) {
    if (data.quantity <= 0) {
      throw new BadRequestException('La cantidad debe ser mayor a 0');
    }

    await this.inventoryService.updateStock(
      companyId,
      data.product_code,
      data.quantity,
      'exit',
    );

    const mov = await this.movementRepo.save(
      this.movementRepo.create({
        companyId,
        movementType: 'exit',
        productCode: data.product_code,
        quantity: data.quantity,
        reason: data.reason || 'Salida de inventario',
        userName: userName || 'System',
      }),
    );

    const inv = await this.inventoryService.findByCode(
      companyId,
      data.product_code,
    );
    await this.drRepo.save(
      this.drRepo.create({
        companyId,
        code: `VE-${data.product_code}`,
        entity: data.entity || 'Entrega Directa',
        warehouse: data.warehouse || inv?.warehouse || '',
        document: `SALIDA-${mov.id}`,
        products: JSON.stringify([
          {
            code: data.product_code,
            description: inv?.productName || data.product_code,
            quantity: data.quantity,
            unit: inv?.productUnit || 'und',
            unitPrice: inv?.unitPrice || 0,
            amount: data.quantity * (inv?.unitPrice || 0),
          },
        ]),
        reportType: 'Vale de Entrega',
        reason: data.reason || 'Salida de inventario',
        createdByName: userName || 'System',
      }),
    );

    return this.enrichMovement(companyId, mov);
  }

  async createReturn(
    companyId: number,
    data: {
      product_code: string;
      quantity: number;
      purchase_id?: string;
      reason: string;
    },
    userName?: string,
  ) {
    if (data.quantity <= 0) {
      throw new BadRequestException('La cantidad debe ser mayor a 0');
    }

    await this.inventoryService.updateStock(
      companyId,
      data.product_code,
      data.quantity,
      'exit',
    );

    const mov = await this.movementRepo.save(
      this.movementRepo.create({
        companyId,
        movementType: 'return',
        productCode: data.product_code,
        quantity: data.quantity,
        reason: data.reason,
        userName: userName || 'System',
        purchaseId: data.purchase_id || null,
      }),
    );

    const inv = await this.inventoryService.findByCode(
      companyId,
      data.product_code,
    );
    await this.drRepo.save(
      this.drRepo.create({
        purchaseId: data.purchase_id || null,
        companyId,
        code: `VD-${data.product_code}`,
        entity: inv?.entity || '',
        warehouse: inv?.warehouse || '',
        document: `DEVOL-${mov.id}`,
        products: JSON.stringify([
          {
            code: data.product_code,
            description: inv?.productName || data.product_code,
            quantity: data.quantity,
            unit: inv?.productUnit || 'und',
            unitPrice: inv?.unitPrice || 0,
            amount: data.quantity * (inv?.unitPrice || 0),
          },
        ]),
        reportType: 'Vale de Devolución',
        reason: data.reason,
        createdByName: userName || 'System',
      }),
    );

    return this.enrichMovement(companyId, mov);
  }
}
