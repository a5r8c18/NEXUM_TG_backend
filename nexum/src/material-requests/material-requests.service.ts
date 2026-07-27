import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { MaterialRequest } from '../entities/material-request.entity';
import { MaterialRequestItem } from '../entities/material-request-item.entity';
import { Product } from '../entities/product.entity';
import { DocumentSequenceService } from '../common/sequence/document-sequence.service';
import { MovementsService } from '../movements/movements.service';

@Injectable()
export class MaterialRequestsService {
  private readonly logger = new Logger(MaterialRequestsService.name);

  constructor(
    @InjectRepository(MaterialRequest)
    private readonly requestRepo: Repository<MaterialRequest>,
    @InjectRepository(MaterialRequestItem)
    private readonly itemRepo: Repository<MaterialRequestItem>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    private readonly sequenceService: DocumentSequenceService,
    private readonly movementsService: MovementsService,
  ) {}

  async findAll(companyId: number, filters?: {
    status?: string;
    warehouseId?: string;
    departmentId?: string;
    page?: number;
    limit?: number;
  }) {
    const qb = this.requestRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.items', 'items')
      .where('r.company_id = :companyId', { companyId });

    if (filters?.status) {
      qb.andWhere('r.status = :status', { status: filters.status });
    }
    if (filters?.warehouseId) {
      qb.andWhere('r.destination_warehouse_id = :warehouseId', { warehouseId: filters.warehouseId });
    }
    if (filters?.departmentId) {
      qb.andWhere('r.requesting_department_id = :departmentId', { departmentId: filters.departmentId });
    }

    qb.orderBy('r.request_date', 'DESC');
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
    const request = await this.requestRepo.findOne({
      where: { id, companyId },
      relations: ['items'],
    });
    if (!request) {
      throw new NotFoundException(`Solicitud de materiales #${id} no encontrada`);
    }
    return request;
  }

  async create(
    companyId: number,
    data: {
      requestDate: string;
      requestType?: 'internal' | 'external' | 'production';
      requestingDepartmentId?: string;
      requestingDepartmentName?: string;
      requesterName: string;
      requesterPosition?: string;
      destinationWarehouseId: string;
      destinationWarehouseName: string;
      purpose?: string;
      urgencyLevel?: 'low' | 'normal' | 'high' | 'urgent';
      requiredDate?: string;
      notes?: string;
      items: {
        lineNumber: number;
        productCode: string;
        productName: string;
        productUnit: string;
        quantityRequested: number;
        priorityLevel?: 'low' | 'normal' | 'high' | 'urgent';
        justification?: string;
      }[];
    },
  ) {
    const requestNumber = await this.sequenceService.nextFormatted(
      companyId,
      'material-request',
      'SM',
      { year: new Date().getFullYear(), padding: 4, includeYear: true },
    );

    const totalItems = data.items.length;
    const request = new MaterialRequest();
    Object.assign(request, {
      companyId,
      requestNumber,
      requestDate: data.requestDate,
      requestType: data.requestType || 'internal',
      requestingDepartmentId: data.requestingDepartmentId || null,
      requestingDepartmentName: data.requestingDepartmentName || null,
      requesterName: data.requesterName,
      requesterPosition: data.requesterPosition || null,
      destinationWarehouseId: data.destinationWarehouseId,
      destinationWarehouseName: data.destinationWarehouseName,
      purpose: data.purpose || null,
      urgencyLevel: data.urgencyLevel || 'normal',
      requiredDate: data.requiredDate || null,
      status: 'draft' as any,
      totalItems,
      totalAmount: 0,
      notes: data.notes || null,
    });
    const savedRequest = await this.requestRepo.save(request);

    const itemEntities: MaterialRequestItem[] = [];
    for (const item of data.items) {
      const entity = new MaterialRequestItem();
      Object.assign(entity, {
        materialRequestId: savedRequest.id,
        lineNumber: item.lineNumber,
        productCode: item.productCode,
        productName: item.productName,
        productUnit: item.productUnit,
        quantityRequested: item.quantityRequested,
        priorityLevel: item.priorityLevel || 'normal',
        justification: item.justification || null,
        quantityApproved: null,
        quantityDelivered: 0,
        approvalStatus: 'pending' as any,
        totalPrice: null,
        unitPrice: null,
        approvalNotes: null,
      });
      itemEntities.push(entity);
    }
    await this.itemRepo.save(itemEntities);

    return this.findOne(companyId, savedRequest.id);
  }

  async approve(
    companyId: number,
    id: string,
    data: {
      items: { id: string; quantityApproved?: number; approvalStatus?: 'approved' | 'rejected' | 'partially_approved'; approvalNotes?: string; unitPrice?: number }[];
      approvalNotes?: string;
      approvedBy?: string;
    },
  ) {
    const request = await this.findOne(companyId, id);
    if (!['draft', 'submitted'].includes(request.status)) {
      throw new BadRequestException('Solo solicitudes en borrador o enviadas pueden aprobarse');
    }

    const itemMap = new Map(request.items.map((i) => [i.id, i]));
    let totalAmount = 0;

    for (const approval of data.items) {
      const item = itemMap.get(approval.id);
      if (!item) continue;

      const approved = approval.quantityApproved ?? item.quantityRequested;
      const status = approval.approvalStatus || (approved >= Number(item.quantityRequested) ? 'approved' : approved > 0 ? 'partially_approved' : 'rejected');

      item.quantityApproved = approved;
      item.approvalStatus = status;
      item.approvalNotes = approval.approvalNotes || data.approvalNotes || null;
      item.unitPrice = approval.unitPrice ?? item.unitPrice;
      item.totalPrice = item.unitPrice ? Number(approved) * Number(item.unitPrice) : null;
      if (item.totalPrice) totalAmount += item.totalPrice;
    }

    await this.itemRepo.save(request.items);

    const allApproved = request.items.every((i) => ['approved', 'rejected'].includes(i.approvalStatus as string));
    const anyApproved = request.items.some((i) => ['approved', 'partially_approved'].includes(i.approvalStatus as string));

    request.status = allApproved ? (anyApproved ? 'approved' : 'rejected') : 'partially_approved';
    request.approvedAt = new Date();
    request.approvedBy = data.approvedBy || 'Sistema';
    request.approvalNotes = data.approvalNotes || null;
    request.totalAmount = totalAmount;

    const saved = await this.requestRepo.save(request);
    return this.findOne(companyId, saved.id);
  }

  async deliver(companyId: number, id: string, userName?: string) {
    const request = await this.findOne(companyId, id);
    if (!['approved', 'partially_approved'].includes(request.status)) {
      throw new BadRequestException('La solicitud debe estar aprobada para entregar');
    }

    const products = await this.productRepo.find({
      where: { companyId, productCode: In(request.items.map((i) => i.productCode)) },
    });
    const productCategoryByCode = new Map(products.map((p) => [p.productCode, p.category]));

    let deliveredAny = false;

    for (const item of request.items) {
      const pending = Number(item.quantityApproved || 0) - Number(item.quantityDelivered || 0);
      if (pending <= 0) continue;

      const category = productCategoryByCode.get(item.productCode) || 'mercancia';
      const exitCode = category === 'insumo' ? '1105' : category === 'produccion' ? '3105' : '2105';

      await this.movementsService.createExit(
        companyId,
        {
          movementCode: exitCode,
          category,
          reason: `Entrega de solicitud ${request.requestNumber} - ${item.productName}`,
          entity: request.requesterName,
          warehouseId: request.destinationWarehouseId,
          costCenterId: request.requestingDepartmentId || undefined,
          items: [{
            productCode: item.productCode,
            quantity: pending,
          }],
        },
        userName || 'Sistema',
      );

      item.quantityDelivered = Number(item.quantityDelivered || 0) + pending;
      deliveredAny = true;
    }

    if (!deliveredAny) {
      throw new BadRequestException('No hay cantidades pendientes por entregar');
    }

    request.status = 'completed';
    await this.requestRepo.save(request);
    await this.itemRepo.save(request.items);

    return this.findOne(companyId, request.id);
  }

  async reject(companyId: number, id: string, notes?: string) {
    const request = await this.findOne(companyId, id);
    if (!['draft', 'submitted'].includes(request.status)) {
      throw new BadRequestException('Solo solicitudes en borrador o enviadas pueden rechazarse');
    }
    request.status = 'rejected';
    request.approvalNotes = notes || null;
    return this.requestRepo.save(request);
  }

  async cancel(companyId: number, id: string) {
    const request = await this.findOne(companyId, id);
    if (['completed', 'cancelled'].includes(request.status)) {
      throw new BadRequestException('La solicitud ya fue completada o cancelada');
    }
    request.status = 'cancelled';
    return this.requestRepo.save(request);
  }
}
