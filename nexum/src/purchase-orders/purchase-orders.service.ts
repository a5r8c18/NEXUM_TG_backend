import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PurchaseOrder } from '../entities/purchase-order.entity';
import { PurchaseOrderItem } from '../entities/purchase-order-item.entity';

@Injectable()
export class PurchaseOrdersService {
  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly poRepo: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderItem)
    private readonly poItemRepo: Repository<PurchaseOrderItem>,
  ) {}

  async findAll(companyId: number, filters?: any) {
    const qb = this.poRepo
      .createQueryBuilder('po')
      .where('po.company_id = :companyId', { companyId })
      .leftJoinAndSelect('po.items', 'items')
      .orderBy('po.created_at', 'DESC');

    if (filters?.status) {
      qb.andWhere('po.status = :status', { status: filters.status });
    }
    if (filters?.supplierName) {
      qb.andWhere('po.supplier_name ILIKE :name', { name: `%${filters.supplierName}%` });
    }

    return qb.getMany();
  }

  async findOne(companyId: number, id: string) {
    const po = await this.poRepo.findOne({
      where: { id, companyId },
      relations: ['items', 'supplier', 'warehouse'],
    });
    if (!po) throw new NotFoundException(`Orden de compra ${id} no encontrada`);
    return po;
  }

  async create(companyId: number, data: any) {
    const count = await this.poRepo.count({ where: { companyId } });
    const po = new PurchaseOrder();
    Object.assign(po, {
      ...data,
      companyId,
      orderNumber: `OC-${String(count + 1).padStart(6, '0')}`,
      status: 'draft' as const,
    });

    const saved = await this.poRepo.save(po);

    if (data.items?.length) {
      const items = data.items.map((item: any) =>
        this.poItemRepo.create({
          ...item,
          purchaseOrderId: saved.id,
        }),
      );
      await this.poItemRepo.save(items);
      saved.items = items;
    }

    return saved;
  }

  async submit(companyId: number, id: string, submittedBy: string) {
    const po = await this.findOne(companyId, id);
    if (po.status !== 'draft') {
      throw new BadRequestException('Solo se pueden enviar órdenes en borrador');
    }
    po.status = 'submitted';
    po.submittedBy = submittedBy;
    po.submittedAt = new Date();
    return this.poRepo.save(po);
  }

  async approve(companyId: number, id: string, approvedBy: string) {
    const po = await this.findOne(companyId, id);
    if (po.status !== 'submitted') {
      throw new BadRequestException('Solo se pueden aprobar órdenes enviadas');
    }
    po.status = 'approved';
    po.approvedBy = approvedBy;
    po.approvedAt = new Date();
    return this.poRepo.save(po);
  }

  async reject(companyId: number, id: string, reason: string) {
    const po = await this.findOne(companyId, id);
    if (po.status !== 'submitted') {
      throw new BadRequestException('Solo se pueden rechazar órdenes enviadas');
    }
    po.status = 'rejected';
    po.rejectionReason = reason;
    return this.poRepo.save(po);
  }

  async cancel(companyId: number, id: string) {
    const po = await this.findOne(companyId, id);
    if (po.status === 'completed' || po.status === 'cancelled') {
      throw new BadRequestException('No se puede cancelar esta orden');
    }
    po.status = 'cancelled';
    return this.poRepo.save(po);
  }

  async getStatistics(companyId: number) {
    const all = await this.poRepo.find({ where: { companyId } });
    return {
      total: all.length,
      draft: all.filter(p => p.status === 'draft').length,
      submitted: all.filter(p => p.status === 'submitted').length,
      approved: all.filter(p => p.status === 'approved').length,
      completed: all.filter(p => p.status === 'completed').length,
      totalAmount: all
        .filter(p => p.status !== 'cancelled' && p.status !== 'rejected')
        .reduce((s, p) => s + Number(p.totalAmount), 0),
    };
  }
}
