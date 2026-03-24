import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { Inventory } from '../entities/inventory.entity';
import { Movement } from '../entities/movement.entity';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(Inventory)
    private readonly inventoryRepo: Repository<Inventory>,
    @InjectRepository(Movement)
    private readonly movementRepo: Repository<Movement>,
  ) {}

  async getInventory(
    companyId: number,
    filters?: {
      fromDate?: string;
      toDate?: string;
      product?: string;
      warehouse?: string;
      entity?: string;
      minStock?: number;
      maxStock?: number;
    },
  ) {
    const qb = this.inventoryRepo
      .createQueryBuilder('inv')
      .where('inv.company_id = :companyId', { companyId });

    if (filters?.product) {
      qb.andWhere(
        '(LOWER(inv.product_name) LIKE :search OR LOWER(inv.product_code) LIKE :search OR LOWER(inv.product_description) LIKE :search)',
        { search: `%${filters.product.toLowerCase()}%` },
      );
    }
    if (filters?.warehouse) {
      qb.andWhere('inv.warehouse = :warehouse', {
        warehouse: filters.warehouse,
      });
    }
    if (filters?.entity) {
      qb.andWhere('inv.entity = :entity', { entity: filters.entity });
    }
    if (filters?.minStock != null) {
      qb.andWhere('inv.stock >= :minStock', { minStock: filters.minStock });
    }
    if (filters?.maxStock != null) {
      qb.andWhere('inv.stock <= :maxStock', { maxStock: filters.maxStock });
    }
    if (filters?.fromDate) {
      qb.andWhere('inv.created_at >= :fromDate', {
        fromDate: filters.fromDate,
      });
    }
    if (filters?.toDate) {
      qb.andWhere('inv.created_at <= :toDate', { toDate: filters.toDate });
    }

    qb.orderBy('inv.product_name', 'ASC');
    const result = await qb.getMany();
    return { inventory: result };
  }

  async findByCode(companyId: number, productCode: string) {
    return this.inventoryRepo.findOneBy({ companyId, productCode });
  }

  async updateStock(
    companyId: number,
    productCode: string,
    quantityChange: number,
    type: 'entry' | 'exit',
  ) {
    const item = await this.findByCode(companyId, productCode);
    if (!item)
      throw new NotFoundException(`Producto ${productCode} no encontrado`);

    if (type === 'entry') {
      item.entries += quantityChange;
      item.stock += quantityChange;
    } else {
      if (item.stock < quantityChange) {
        throw new BadRequestException(
          `Stock insuficiente para ${item.productName}. Disponible: ${item.stock}, Requerido: ${quantityChange}`,
        );
      }
      item.exits += quantityChange;
      item.stock -= quantityChange;
    }
    return this.inventoryRepo.save(item);
  }

  async ensureProduct(
    companyId: number,
    product: {
      productCode: string;
      productName: string;
      productUnit?: string;
      unitPrice?: number;
      warehouse?: string;
      entity?: string;
      productDescription?: string;
    },
  ) {
    let existing = await this.findByCode(companyId, product.productCode);
    if (existing) {
      if (product.unitPrice != null) {
        existing.unitPrice = product.unitPrice;
        await this.inventoryRepo.save(existing);
      }
      return existing;
    }
    const newItem = this.inventoryRepo.create({
      productCode: product.productCode,
      productName: product.productName,
      productDescription: product.productDescription || '',
      productUnit: product.productUnit || 'und',
      entries: 0,
      exits: 0,
      stock: 0,
      stockLimit: 0,
      unitPrice: product.unitPrice || 0,
      warehouse: product.warehouse || null,
      entity: product.entity || null,
      companyId,
    });
    return this.inventoryRepo.save(newItem);
  }

  async getLowStockItems(companyId: number) {
    return this.inventoryRepo
      .createQueryBuilder('inv')
      .where('inv.company_id = :companyId', { companyId })
      .andWhere('inv.stock_limit > 0')
      .andWhere('inv.stock <= inv.stock_limit')
      .getMany();
  }

  async getProductHistory(companyId: number, productCode: string) {
    const product = await this.findByCode(companyId, productCode);
    if (!product) throw new NotFoundException('Producto no encontrado');

    const movements = await this.movementRepo.find({
      where: { productCode, companyId },
      order: { createdAt: 'DESC' },
    });

    return {
      productCode: product.productCode,
      productName: product.productName,
      currentStock: product.stock,
      entries: product.entries,
      exits: product.exits,
      movements,
    };
  }
}
