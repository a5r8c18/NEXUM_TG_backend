import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InventoryWarehouseService } from './inventory-warehouse.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { getCompanyId } from '../common/get-company-id';

@UseGuards(JwtAuthGuard)
@Controller('inventory-warehouse')
export class InventoryWarehouseController {
  constructor(
    private readonly inventoryWarehouseService: InventoryWarehouseService,
  ) {}

  // Obtener inventario por empresa
  @Get()
  async findByCompany(@Req() req: any) {
    return this.inventoryWarehouseService.findByCompany(getCompanyId(req));
  }

  // Obtener inventario por empresa y almacén
  @Get('warehouse/:warehouseId')
  async findByCompanyAndWarehouse(
    @Req() req: any,
    @Param('warehouseId') warehouseId: string,
  ) {
    return this.inventoryWarehouseService.findByCompanyAndWarehouse(
      getCompanyId(req),
      warehouseId,
    );
  }

  // Obtener producto por código
  @Get('product/:productCode')
  async findByCode(
    @Req() req: any,
    @Param('productCode') productCode: string,
  ) {
    return this.inventoryWarehouseService.findByCode(
      getCompanyId(req),
      productCode,
    );
  }

  // Obtener resumen de inventario
  @Get('summary')
  async getInventorySummary(@Req() req: any) {
    return this.inventoryWarehouseService.getInventorySummary(
      getCompanyId(req),
    );
  }

  // Asegurar producto en inventario
  @Post('ensure')
  async ensureProduct(
    @Req() req: any,
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
    return this.inventoryWarehouseService.ensureProduct(
      getCompanyId(req),
      data,
    );
  }

  // Actualizar stock
  @Put('stock')
  async updateStock(
    @Req() req: any,
    @Body()
    data: {
      productCode: string;
      warehouseId: string;
      quantity: number;
      type: 'entry' | 'exit';
    },
  ) {
    return this.inventoryWarehouseService.updateStock(
      getCompanyId(req),
      data.productCode,
      data.warehouseId,
      data.quantity,
      data.type,
    );
  }

  // Transferir stock entre almacenes
  @Post('transfer')
  async transferStock(
    @Req() req: any,
    @Body()
    data: {
      productCode: string;
      quantity: number;
      sourceWarehouseId: string;
      destinationWarehouseId: string;
      reason?: string;
    },
  ) {
    return this.inventoryWarehouseService.transferStock(
      getCompanyId(req),
      data,
    );
  }

  // Actualizar límite de stock
  @Put('stock-limit')
  async updateStockLimit(
    @Req() req: any,
    @Body()
    data: {
      productCode: string;
      warehouseId: string;
      stockLimit: number;
    },
  ) {
    return this.inventoryWarehouseService.updateStockLimit(
      getCompanyId(req),
      data.productCode,
      data.warehouseId,
      data.stockLimit,
    );
  }

  // Submayor / Tarjeta de estiba de un producto en un almacén (INV-03)
  @Get('subledger/:warehouseId/:productCode')
  async getSubledger(
    @Req() req: any,
    @Param('warehouseId') warehouseId: string,
    @Param('productCode') productCode: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.inventoryWarehouseService.getSubledger(
      getCompanyId(req),
      productCode,
      warehouseId,
      { fromDate, toDate },
    );
  }

  // Desactivar producto de inventario
  @Delete('deactivate')
  async deactivate(
    @Req() req: any,
    @Body()
    data: {
      productCode: string;
      warehouseId: string;
    },
  ) {
    await this.inventoryWarehouseService.deactivate(
      getCompanyId(req),
      data.productCode,
      data.warehouseId,
    );
    return { message: 'Producto desactivado exitosamente' };
  }
}
