import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryWarehouseService } from './inventory-warehouse.service';
import { InventoryAnalyticsService } from './inventory-analytics.service';
import { InventoryWarehouseController } from './inventory-warehouse.controller';
import { InventoryAnalyticsController } from './inventory-analytics.controller';
import { InventoryWarehouse } from '../entities/inventory-warehouse.entity';
import { Movement } from '../entities/movement.entity';
import { WarehousesModule } from '../warehouses/warehouses.module';
import { AuthModule } from '../auth/auth.module';
import { WarehousesService } from '../warehouses/warehouses.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([InventoryWarehouse, Movement]),
    WarehousesModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [InventoryWarehouseController, InventoryAnalyticsController],
  providers: [InventoryWarehouseService, InventoryAnalyticsService],
  exports: [InventoryWarehouseService, InventoryAnalyticsService],
})
export class InventoryWarehouseModule {}
