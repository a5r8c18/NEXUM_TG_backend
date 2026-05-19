import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Product, ProductCategory } from '../entities/product.entity';
import { Company } from '../entities/company.entity';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
  ) {}

  async findAll(companyId: number, filters?: {
    search?: string;
    category?: ProductCategory;
    isActive?: boolean;
    page?: number;
    limit?: number;
  }) {
    const qb = this.productRepo
      .createQueryBuilder('p')
      .where('p.company_id = :companyId', { companyId });

    if (filters?.search) {
      const search = `%${filters.search.toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(p.product_name) LIKE :search OR LOWER(p.product_code) LIKE :search OR LOWER(p.cpcu_code) LIKE :search)',
        { search }
      );
    }

    if (filters?.category) {
      qb.andWhere('p.category = :category', { category: filters.category });
    }

    if (filters?.isActive !== undefined) {
      qb.andWhere('p.is_active = :isActive', { isActive: filters.isActive });
    }

    qb.orderBy('p.product_name', 'ASC');

    // Paginación
    const page = Math.max(filters?.page || 1, 1);
    const limit = Math.min(Math.max(filters?.limit || 50, 1), 200);
    const isPaginated = filters?.page && filters?.limit;

    if (isPaginated) {
      qb.skip((page - 1) * limit).take(limit);
    }

    const [products, totalItems] = isPaginated
      ? await qb.getManyAndCount()
      : [await qb.getMany(), 0];

    if (isPaginated) {
      return {
        data: products,
        meta: {
          currentPage: page,
          itemsPerPage: limit,
          totalItems,
          totalPages: Math.ceil(totalItems / limit),
        },
      };
    }

    return products;
  }

  async findOne(companyId: number, id: number) {
    const product = await this.productRepo.findOne({
      where: { id, companyId },
    });
    if (!product) {
      throw new NotFoundException(`Producto #${id} no encontrado`);
    }
    return product;
  }

  async findByCode(companyId: number, productCode: string) {
    return this.productRepo.findOne({
      where: { productCode, companyId, isActive: true },
    });
  }

  async findByCodes(companyId: number, productCodes: string[]): Promise<Product[]> {
    if (!productCodes.length) return [];
    return this.productRepo.find({
      where: { 
        productCode: In(productCodes), 
        companyId, 
        isActive: true 
      },
    });
  }

  async create(companyId: number, data: {
    productCode: string;
    productName: string;
    productDescription?: string;
    productUnit?: string;
    category?: ProductCategory;
    cpcuCode?: string;
    cpcuDescription?: string;
    defaultAccountCode?: string;
    defaultSupplier?: string;
    barcode?: string;
    defaultUnitPrice?: number;
    minStock?: number;
    maxStock?: number;
    reorderPoint?: number;
    isPerishable?: boolean;
  }) {
    // Verificar que no exista el mismo código
    const existing = await this.findByCode(companyId, data.productCode);
    if (existing) {
      throw new BadRequestException(
        `Ya existe un producto con código ${data.productCode}`,
      );
    }

    // Verificar que la empresa exista
    const company = await this.companyRepo.findOneBy({ id: companyId });
    if (!company) {
      throw new NotFoundException('Empresa no encontrada');
    }

    const product = this.productRepo.create({
      companyId,
      productCode: data.productCode,
      productName: data.productName,
      productDescription: data.productDescription || null,
      productUnit: data.productUnit || 'und',
      category: data.category || 'mercancia',
      cpcuCode: data.cpcuCode || null,
      cpcuDescription: data.cpcuDescription || null,
      defaultAccountCode: data.defaultAccountCode || null,
      defaultSupplier: data.defaultSupplier || null,
      barcode: data.barcode || null,
      defaultUnitPrice: data.defaultUnitPrice || 0,
      minStock: data.minStock || 0,
      maxStock: data.maxStock || 0,
      reorderPoint: data.reorderPoint || 0,
      isPerishable: data.isPerishable || false,
      isActive: true,
    });

    const saved = await this.productRepo.save(product);
    this.logger.log(`Producto creado: ${saved.productCode} - ${saved.productName}`);
    return saved;
  }

  async update(companyId: number, id: number, data: Partial<{
    productCode: string;
    productName: string;
    productDescription: string;
    productUnit: string;
    category: ProductCategory;
    cpcuCode: string;
    cpcuDescription: string;
    defaultAccountCode: string;
    defaultSupplier: string;
    barcode: string;
    defaultUnitPrice: number;
    minStock: number;
    maxStock: number;
    reorderPoint: number;
    isPerishable: boolean;
    isActive: boolean;
  }>) {
    const product = await this.findOne(companyId, id);
    
    // Si se cambia el código, verificar que no exista
    if (data.productCode && data.productCode !== product.productCode) {
      const existing = await this.findByCode(companyId, data.productCode);
      if (existing) {
        throw new BadRequestException(
          `Ya existe un producto con código ${data.productCode}`,
        );
      }
      product.productCode = data.productCode;
    }

    Object.assign(product, data);
    const saved = await this.productRepo.save(product);
    this.logger.log(`Producto actualizado: ${saved.productCode}`);
    return saved;
  }

  async deactivate(companyId: number, id: number) {
    const product = await this.findOne(companyId, id);
    product.isActive = false;
    const saved = await this.productRepo.save(product);
    this.logger.log(`Producto desactivado: ${saved.productCode}`);
    return saved;
  }

  async getStatistics(companyId: number) {
    const [total, active, inactive, byCategory] = await Promise.all([
      this.productRepo.count({ where: { companyId } }),
      this.productRepo.count({ where: { companyId, isActive: true } }),
      this.productRepo.count({ where: { companyId, isActive: false } }),
      this.productRepo
        .createQueryBuilder('p')
        .select('p.category', 'category')
        .addSelect('COUNT(*)', 'count')
        .where('p.company_id = :companyId', { companyId })
        .groupBy('p.category')
        .getRawMany(),
    ]);

    return {
      total,
      active,
      inactive,
      byCategory: byCategory.map(item => ({
        category: item.category,
        count: parseInt(item.count),
      })),
    };
  }

  // Método para asegurar que exista un producto (usado por otros servicios)
  async ensureProduct(companyId: number, data: {
    productCode: string;
    productName: string;
    productDescription?: string;
    productUnit?: string;
    category?: ProductCategory;
    defaultUnitPrice?: number;
    cpcuCode?: string;
  }): Promise<Product> {
    let product = await this.findByCode(companyId, data.productCode);
    
    if (!product) {
      product = await this.create(companyId, {
        productCode: data.productCode,
        productName: data.productName,
        productDescription: data.productDescription,
        productUnit: data.productUnit,
        category: data.category || 'mercancia',
        defaultUnitPrice: data.defaultUnitPrice,
        cpcuCode: data.cpcuCode,
      });
    } else {
      // Actualizar datos si es necesario
      const needsUpdate = 
        product.productName !== data.productName ||
        product.productDescription !== (data.productDescription || null) ||
        product.productUnit !== (data.productUnit || 'und') ||
        product.category !== (data.category || 'mercancia') ||
        product.defaultUnitPrice !== (data.defaultUnitPrice || 0) ||
        product.cpcuCode !== (data.cpcuCode || null);

      if (needsUpdate) {
        await this.update(companyId, product.id, {
          productName: data.productName,
          productDescription: data.productDescription,
          productUnit: data.productUnit,
          category: data.category,
          defaultUnitPrice: data.defaultUnitPrice,
          cpcuCode: data.cpcuCode,
        });
      }
    }

    return product;
  }
}
