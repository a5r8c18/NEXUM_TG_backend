import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { InventoryWarehouseService } from './inventory-warehouse.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('inventory-warehouse')
export class InventoryWarehouseController {
  constructor(
    private readonly inventoryWarehouseService: InventoryWarehouseService,
  ) {}

  // Obtener inventario por empresa
  @Get()
  async findByCompany(@Query('companyId') companyId: string) {
    if (!companyId) {
      throw new BadRequestException('CompanyId es requerido');
    }
    return this.inventoryWarehouseService.findByCompany(parseInt(companyId));
  }

  // Obtener inventario por empresa y almacén
  @Get('warehouse/:warehouseId')
  async findByCompanyAndWarehouse(
    @Query('companyId') companyId: string,
    @Param('warehouseId') warehouseId: string,
  ) {
    if (!companyId) {
      throw new BadRequestException('CompanyId es requerido');
    }
    return this.inventoryWarehouseService.findByCompanyAndWarehouse(
      parseInt(companyId),
      warehouseId,
    );
  }

  // Obtener producto por código
  @Get('product/:productCode')
  async findByCode(
    @Query('companyId') companyId: string,
    @Param('productCode') productCode: string,
  ) {
    if (!companyId) {
      throw new BadRequestException('CompanyId es requerido');
    }
    return this.inventoryWarehouseService.findByCode(
      parseInt(companyId),
      productCode,
    );
  }

  // Obtener resumen de inventario
  @Get('summary')
  async getInventorySummary(@Query('companyId') companyId: string) {
    if (!companyId) {
      throw new BadRequestException('CompanyId es requerido');
    }
    return this.inventoryWarehouseService.getInventorySummary(
      parseInt(companyId),
    );
  }

  // Asegurar producto en inventario
  @Post('ensure')
  async ensureProduct(
    @Query('companyId') companyId: string,
    @Body()
    data: {
      productCode: string;
      productName: string;
      productDescription?: string;
      productUnit?: string;
      unitPrice?: number;
      warehouseId: string;
      entity?: string;
      location?: string;
    },
  ) {
    if (!companyId) {
      throw new BadRequestException('CompanyId es requerido');
    }
    return this.inventoryWarehouseService.ensureProduct(
      parseInt(companyId),
      data,
    );
  }

  // Actualizar stock
  @Put('stock')
  async updateStock(
    @Query('companyId') companyId: string,
    @Body()
    data: {
      productCode: string;
      warehouseId: string;
      quantity: number;
      type: 'entry' | 'exit';
    },
  ) {
    if (!companyId) {
      throw new BadRequestException('CompanyId es requerido');
    }
    return this.inventoryWarehouseService.updateStock(
      parseInt(companyId),
      data.productCode,
      data.warehouseId,
      data.quantity,
      data.type,
    );
  }

  // Transferir stock entre almacenes
  @Post('transfer')
  async transferStock(
    @Query('companyId') companyId: string,
    @Body()
    data: {
      productCode: string;
      quantity: number;
      sourceWarehouseId: string;
      destinationWarehouseId: string;
      reason?: string;
    },
  ) {
    if (!companyId) {
      throw new BadRequestException('CompanyId es requerido');
    }
    return this.inventoryWarehouseService.transferStock(
      parseInt(companyId),
      data,
    );
  }

  // Actualizar límite de stock
  @Put('stock-limit')
  async updateStockLimit(
    @Query('companyId') companyId: string,
    @Body()
    data: {
      productCode: string;
      warehouseId: string;
      stockLimit: number;
    },
  ) {
    if (!companyId) {
      throw new BadRequestException('CompanyId es requerido');
    }
    return this.inventoryWarehouseService.updateStockLimit(
      parseInt(companyId),
      data.productCode,
      data.warehouseId,
      data.stockLimit,
    );
  }

  // Desactivar producto de inventario
  @Delete('deactivate')
  async deactivate(
    @Query('companyId') companyId: string,
    @Body()
    data: {
      productCode: string;
      warehouseId: string;
    },
  ) {
    if (!companyId) {
      throw new BadRequestException('CompanyId es requerido');
    }
    await this.inventoryWarehouseService.deactivate(
      parseInt(companyId),
      data.productCode,
      data.warehouseId,
    );
    return { message: 'Producto desactivado exitosamente' };
  }
}
