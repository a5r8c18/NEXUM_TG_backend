import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryWarehouseService } from './inventory-warehouse.service';
import { InventoryWarehouseController } from './inventory-warehouse.controller';
import { InventoryWarehouse } from '../entities/inventory-warehouse.entity';
import { WarehousesModule } from '../warehouses/warehouses.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([InventoryWarehouse]),
    WarehousesModule,
  ],
  controllers: [InventoryWarehouseController],
  providers: [InventoryWarehouseService],
  exports: [InventoryWarehouseService],
})
export class InventoryWarehouseModule {}
