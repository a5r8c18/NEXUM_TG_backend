import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { PhysicalCount, PhysicalCountStatus } from '../entities/physical-count.entity';
import { PhysicalCountItem } from '../entities/physical-count-item.entity';
import { InventoryWarehouseService } from '../inventory-warehouse/inventory-warehouse.service';
import { MovementsService } from '../movements/movements.service';

@Injectable()
export class PhysicalCountService {
  private readonly logger = new Logger(PhysicalCountService.name);

  constructor(
    @InjectRepository(PhysicalCount)
    private readonly physicalCountRepo: Repository<PhysicalCount>,
    @InjectRepository(PhysicalCountItem)
    private readonly physicalCountItemRepo: Repository<PhysicalCountItem>,
    private readonly inventoryWarehouseService: InventoryWarehouseService,
    private readonly movementsService: MovementsService,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(companyId: number, filters?: {
    status?: PhysicalCountStatus;
    warehouseId?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    const qb = this.physicalCountRepo
      .createQueryBuilder('pc')
      .leftJoinAndSelect('pc.items', 'items')
      .where('pc.company_id = :companyId', { companyId });

    if (filters?.status) {
      qb.andWhere('pc.status = :status', { status: filters.status });
    }

    if (filters?.warehouseId) {
      qb.andWhere('pc.warehouse_id = :warehouseId', { warehouseId: filters.warehouseId });
    }

    if (filters?.startDate) {
      qb.andWhere('pc.date >= :startDate', { startDate: filters.startDate });
    }

    if (filters?.endDate) {
      qb.andWhere('pc.date <= :endDate', { endDate: filters.endDate });
    }

    qb.orderBy('pc.date', 'DESC');

    // Paginación
    const page = Math.max(filters?.page || 1, 1);
    const limit = Math.min(Math.max(filters?.limit || 50, 1), 200);
    const isPaginated = filters?.page && filters?.limit;

    if (isPaginated) {
      qb.skip((page - 1) * limit).take(limit);
    }

    const [counts, totalItems] = isPaginated
      ? await qb.getManyAndCount()
      : [await qb.getMany(), 0];

    if (isPaginated) {
      return {
        data: counts,
        meta: {
          currentPage: page,
          itemsPerPage: limit,
          totalItems,
          totalPages: Math.ceil(totalItems / limit),
        },
      };
    }

    return counts;
  }

  async findOne(companyId: number, id: string) {
    const count = await this.physicalCountRepo.findOne({
      where: { id, companyId },
      relations: ['items'],
    });
    if (!count) {
      throw new NotFoundException(`Conteo físico #${id} no encontrado`);
    }
    return count;
  }

  async create(companyId: number, data: {
    warehouseId: string;
    warehouseName: string;
    date: string;
    notes?: string;
    createdBy?: string;
  }) {
    // Verificar que no haya otro conteo en progreso para el mismo almacén
    const existing = await this.physicalCountRepo.findOne({
      where: {
        companyId,
        warehouseId: data.warehouseId,
        status: 'draft' as PhysicalCountStatus,
      },
    });

    if (existing) {
      throw new BadRequestException(
        `Ya existe un conteo físico en progreso para el almacén ${data.warehouseName}`,
      );
    }

    // Obtener número de conteo
    const count = await this.physicalCountRepo.count({
      where: { companyId },
    });
    const countNumber = `CT-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

    const physicalCount = this.physicalCountRepo.create({
      companyId,
      countNumber,
      warehouseId: data.warehouseId,
      warehouseName: data.warehouseName,
      date: data.date,
      status: 'draft',
      notes: data.notes || null,
      createdBy: data.createdBy || 'System',
    });

    const saved = await this.physicalCountRepo.save(physicalCount);
    this.logger.log(`Conteo físico creado: ${saved.countNumber}`);
    return saved;
  }

  async startCount(companyId: number, id: string) {
    const count = await this.findOne(companyId, id);

    if (count.status !== 'draft') {
      throw new BadRequestException(
        `El conteo físico ya está en estado ${count.status}`,
      );
    }

    // Obtener todos los productos del almacén
    const inventory = await this.inventoryWarehouseService.findByCompanyAndWarehouse(
      companyId,
      count.warehouseId,
    );

    // Crear items del conteo con stock del sistema
    const items: PhysicalCountItem[] = [];
    for (const inv of inventory) {
      const item = this.physicalCountItemRepo.create({
        physicalCountId: count.id,
        productCode: inv.productCode,
        productName: inv.productName,
        productUnit: inv.productUnit,
        systemStock: inv.stock,
        physicalStock: inv.stock, // Inicialmente igual al sistema
        difference: 0,
        unitPrice: inv.unitPrice,
        differenceValue: 0,
      });
      items.push(item);
    }

    await this.physicalCountItemRepo.save(items);

    // Actualizar estado
    count.status = 'in_progress';
    const saved = await this.physicalCountRepo.save(count);

    this.logger.log(`Conteo físico iniciado: ${saved.countNumber} con ${items.length} productos`);
    return saved;
  }

  async updateItem(companyId: number, countId: string, itemId: string, data: {
    physicalStock: number;
    notes?: string;
  }) {
    const count = await this.findOne(companyId, countId);

    if (count.status !== 'in_progress') {
      throw new BadRequestException(
        `El conteo físico debe estar en progreso para actualizar items`,
      );
    }

    const item = await this.physicalCountItemRepo.findOne({
      where: { id: itemId, physicalCountId: countId },
    });

    if (!item) {
      throw new NotFoundException(`Item #${itemId} no encontrado en el conteo`);
    }

    // Calcular diferencia
    const difference = data.physicalStock - item.systemStock;
    const differenceValue = difference * item.unitPrice;

    item.physicalStock = data.physicalStock;
    item.difference = difference;
    item.differenceValue = Math.abs(differenceValue);
    item.notes = data.notes || null;

    const saved = await this.physicalCountItemRepo.save(item);
    return saved;
  }

  async completeCount(companyId: number, id: string, userName?: string) {
    const count = await this.findOne(companyId, id);

    if (count.status !== 'in_progress') {
      throw new BadRequestException(
        `El conteo físico debe estar en progreso para completar`,
      );
    }

    // Calcular totales
    const items = await this.physicalCountItemRepo.find({
      where: { physicalCountId: id },
    });

    let totalSurplus = 0;
    let totalShortage = 0;
    let surplusValue = 0;
    let shortageValue = 0;

    for (const item of items) {
      if (item.difference > 0) {
        totalSurplus += item.difference;
        surplusValue += item.differenceValue;
      } else if (item.difference < 0) {
        totalShortage += Math.abs(item.difference);
        shortageValue += item.differenceValue;
      }
    }

    // Actualizar conteo
    count.status = 'completed';
    count.totalSurplus = totalSurplus;
    count.totalShortage = totalShortage;
    count.surplusValue = surplusValue;
    count.shortageValue = shortageValue;

    const saved = await this.physicalCountRepo.save(count);

    this.logger.log(
      `Conteo físico completado: ${saved.countNumber} - Sobrantes: ${totalSurplus}, Faltantes: ${totalShortage}`,
    );

    return saved;
  }

  async approveCount(companyId: number, id: string, userName?: string) {
    const count = await this.findOne(companyId, id);

    if (count.status !== 'completed') {
      throw new BadRequestException(
        `El conteo físico debe estar completado para aprobar`,
      );
    }

    // Generar movimientos de ajuste usando transacción
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const items = await this.physicalCountItemRepo.find({
        where: { physicalCountId: id },
      });

      for (const item of items) {
        if (item.difference === 0) continue;

        // Determinar código de movimiento según la diferencia
        const movementCode = item.difference > 0 ? '105' : '1104'; // Sobrante o Faltante
        const movementType = item.difference > 0 ? 'entry' : 'exit';
        
        // Crear movimiento de ajuste
        await this.movementsService.createDirectEntry(
          companyId,
          {
            movementCode,
            category: 'mercancia', // Por defecto, podría obtenerse del producto
            label: `Ajuste por conteo físico - ${count.countNumber}`,
            entity: 'Ajuste Inventario',
            warehouseId: count.warehouseId,
            items: [{
              productCode: item.productCode,
              productName: item.productName,
              quantity: Math.abs(item.difference),
              unitPrice: item.unitPrice,
              unit: item.productUnit,
              location: undefined,
              expenseElement: undefined,
            }],
          },
          userName || 'System',
        );

        // Vincular el movimiento al item del conteo
        item.adjustmentMovementId = 'MOV-' + Date.now(); // Simplificado
        await this.physicalCountItemRepo.save(item);
      }

      // Actualizar estado del conteo
      count.status = 'approved';
      count.approvedBy = userName || 'System';
      count.approvedAt = new Date();
      await this.physicalCountRepo.save(count);

      await queryRunner.commitTransaction();

      this.logger.log(`Conteo físico aprobado: ${count.countNumber}`);
      return count;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Error al aprobar conteo físico: ${error.message}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async cancelCount(companyId: number, id: string, userName?: string) {
    const count = await this.findOne(companyId, id);

    if (['approved', 'cancelled'].includes(count.status)) {
      throw new BadRequestException(
        `No se puede cancelar un conteo físico en estado ${count.status}`,
      );
    }

    count.status = 'cancelled';
    const saved = await this.physicalCountRepo.save(count);

    this.logger.log(`Conteo físico cancelado: ${saved.countNumber}`);
    return saved;
  }

  async getStatistics(companyId: number) {
    const [total, draft, inProgress, completed, approved, cancelled] = await Promise.all([
      this.physicalCountRepo.count({ where: { companyId } }),
      this.physicalCountRepo.count({ where: { companyId, status: 'draft' } }),
      this.physicalCountRepo.count({ where: { companyId, status: 'in_progress' } }),
      this.physicalCountRepo.count({ where: { companyId, status: 'completed' } }),
      this.physicalCountRepo.count({ where: { companyId, status: 'approved' } }),
      this.physicalCountRepo.count({ where: { companyId, status: 'cancelled' } }),
    ]);

    return {
      total,
      draft,
      inProgress,
      completed,
      approved,
      cancelled,
    };
  }
}
