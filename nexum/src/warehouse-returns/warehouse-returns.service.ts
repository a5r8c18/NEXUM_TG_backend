import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WarehouseReturn } from '../entities/warehouse-return.entity';
import { WarehouseReturnItem } from '../entities/warehouse-return-item.entity';
import { DocumentSequenceService } from '../common/sequence/document-sequence.service';
import { MovementsService } from '../movements/movements.service';

@Injectable()
export class WarehouseReturnsService {
  private readonly logger = new Logger(WarehouseReturnsService.name);

  constructor(
    @InjectRepository(WarehouseReturn)
    private readonly returnRepo: Repository<WarehouseReturn>,
    @InjectRepository(WarehouseReturnItem)
    private readonly itemRepo: Repository<WarehouseReturnItem>,
    private readonly sequenceService: DocumentSequenceService,
    private readonly movementsService: MovementsService,
  ) {}

  async findAll(companyId: number, filters?: {
    status?: string;
    warehouseId?: string;
    page?: number;
    limit?: number;
  }) {
    const qb = this.returnRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.items', 'items')
      .where('r.company_id = :companyId', { companyId });

    if (filters?.status) qb.andWhere('r.status = :status', { status: filters.status });
    if (filters?.warehouseId) qb.andWhere('r.source_warehouse_id = :warehouseId', { warehouseId: filters.warehouseId });

    qb.orderBy('r.return_date', 'DESC');
    const page = Math.max(filters?.page || 1, 1);
    const limit = Math.min(Math.max(filters?.limit || 50, 1), 200);
    const isPaginated = filters?.page !== undefined && filters?.limit !== undefined;

    if (isPaginated) {
      qb.skip((page - 1) * limit).take(limit);
      const [data, totalItems] = await qb.getManyAndCount();
      return { data, meta: { currentPage: page, itemsPerPage: limit, totalItems, totalPages: Math.ceil(totalItems / limit) } };
    }

    return qb.getMany();
  }

  async findOne(companyId: number, id: string) {
    const returnDoc = await this.returnRepo.findOne({
      where: { id, companyId },
      relations: ['items'],
    });
    if (!returnDoc) throw new NotFoundException(`Devolución de almacén #${id} no encontrada`);
    return returnDoc;
  }

  async create(companyId: number, data: {
    returnDate: string;
    returnType?: 'supplier' | 'production' | 'adjustment' | 'damage';
    returnReason: string;
    supplierName?: string;
    supplierNit?: string;
    sourceWarehouseId: string;
    sourceWarehouseName: string;
    destinationWarehouseId?: string;
    destinationWarehouseName?: string;
    returnedBy: string;
    notes?: string;
    items: {
      lineNumber: number;
      productCode: string;
      productName: string;
      productUnit: string;
      quantityReturned: number;
      unitPrice: number;
      totalPrice: number;
      batchNumber?: string;
      expirationDate?: string;
      returnReasonDetail?: string;
      conditionStatus?: 'good' | 'damaged' | 'expired' | 'defective';
      conditionNotes?: string;
    }[];
  }) {
    const returnNumber = await this.sequenceService.nextFormatted(
      companyId,
      'warehouse-return',
      'DA',
      { year: new Date().getFullYear(), padding: 4, includeYear: true },
    );

    const totalItems = data.items.length;
    const totalAmount = data.items.reduce((sum, i) => sum + (i.totalPrice || 0), 0);

    const returnDoc = new WarehouseReturn();
    Object.assign(returnDoc, {
      companyId,
      returnNumber,
      returnDate: data.returnDate,
      returnType: data.returnType || 'supplier',
      returnReason: data.returnReason,
      supplierName: data.supplierName || null,
      supplierNit: data.supplierNit || null,
      sourceWarehouseId: data.sourceWarehouseId,
      sourceWarehouseName: data.sourceWarehouseName,
      destinationWarehouseId: data.destinationWarehouseId || null,
      destinationWarehouseName: data.destinationWarehouseName || null,
      returnedBy: data.returnedBy,
      status: 'draft' as any,
      totalItems,
      totalAmount,
      notes: data.notes || null,
    });
    const saved = await this.returnRepo.save(returnDoc);

    const itemEntities: WarehouseReturnItem[] = [];
    for (const item of data.items) {
      const entity = new WarehouseReturnItem();
      Object.assign(entity, {
        warehouseReturnId: saved.id,
        lineNumber: item.lineNumber,
        productCode: item.productCode,
        productName: item.productName,
        productUnit: item.productUnit,
        quantityReturned: item.quantityReturned,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        batchNumber: item.batchNumber || null,
        expirationDate: item.expirationDate || null,
        returnReasonDetail: item.returnReasonDetail || null,
        conditionStatus: item.conditionStatus || 'good',
        conditionNotes: item.conditionNotes || null,
      });
      itemEntities.push(entity);
    }
    await this.itemRepo.save(itemEntities);

    return this.findOne(companyId, saved.id);
  }

  async process(companyId: number, id: string, userName?: string) {
    const returnDoc = await this.findOne(companyId, id);
    if (returnDoc.status !== 'draft') {
      throw new BadRequestException('Solo devoluciones en borrador pueden procesarse');
    }

    for (const item of returnDoc.items) {
      const movementCode = this.resolveReturnCode(returnDoc.returnType, item.conditionStatus);
      await this.movementsService.createReturn(
        companyId,
        {
          movementCode,
          category: 'mercancia',
          reason: `${returnDoc.returnReason} - ${returnDoc.returnNumber}`,
          warehouseId: returnDoc.sourceWarehouseId,
          entity: returnDoc.supplierName || returnDoc.returnedBy,
          items: [{
            productCode: item.productCode,
            quantity: item.quantityReturned,
          }],
        },
        userName || 'Sistema',
      );
    }

    returnDoc.status = 'processed';
    returnDoc.authorizedBy = userName || 'Sistema';
    returnDoc.authorizedAt = new Date();
    await this.returnRepo.save(returnDoc);

    return this.findOne(companyId, returnDoc.id);
  }

  private resolveReturnCode(
    returnType: string,
    condition: string,
  ): string {
    if (returnType === 'supplier') return '107'; // Devolución de compra a entidades
    if (returnType === 'production') return '308'; // Entrada de centro de costo
    if (returnType === 'damage' || condition === 'damaged' || condition === 'expired' || condition === 'defective') {
      return '2107'; // Devolución de compra a entidades mercancía
    }
    return '107';
  }

  async cancel(companyId: number, id: string) {
    const returnDoc = await this.findOne(companyId, id);
    if (returnDoc.status === 'processed') {
      throw new BadRequestException('No se puede cancelar una devolución ya procesada');
    }
    returnDoc.status = 'cancelled' as any;
    return this.returnRepo.save(returnDoc);
  }
}
