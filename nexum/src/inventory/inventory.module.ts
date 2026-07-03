import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryController } from './inventory.controller';
import { InventoryWarehouseService } from '../inventory-warehouse/inventory-warehouse.service';
import { InventoryWarehouse } from '../entities/inventory-warehouse.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([InventoryWarehouse]),
    forwardRef(() => AuthModule),
  ],
  controllers: [InventoryController],
  providers: [InventoryWarehouseService],
  exports: [InventoryWarehouseService],
})
export class InventoryModule {}
