import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryWarehouseService } from './inventory-warehouse.service';
import { InventoryWarehouseController } from './inventory-warehouse.controller';
import { InventoryWarehouse } from '../entities/inventory-warehouse.entity';
import { WarehousesModule } from '../warehouses/warehouses.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([InventoryWarehouse]),
    WarehousesModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [InventoryWarehouseController],
  providers: [InventoryWarehouseService],
  exports: [InventoryWarehouseService],
})
export class InventoryWarehouseModule {}
