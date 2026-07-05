import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryWarehouseService } from './inventory-warehouse.service';
import { InventoryAnalyticsService } from './inventory-analytics.service';
import { WorkingCapitalService } from './working-capital.service';
import { InventoryWarehouseController } from './inventory-warehouse.controller';
import { InventoryAnalyticsController } from './inventory-analytics.controller';
import { WorkingCapitalController } from './working-capital.controller';
import { InventoryWarehouse } from '../entities/inventory-warehouse.entity';
import { Movement } from '../entities/movement.entity';
import { AccountPayable } from '../entities/account-payable.entity';
import { AccountReceivable } from '../entities/account-receivable.entity';
import { WarehousesModule } from '../warehouses/warehouses.module';
import { AuthModule } from '../auth/auth.module';
import { WarehousesService } from '../warehouses/warehouses.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([InventoryWarehouse, Movement, AccountPayable, AccountReceivable]),
    WarehousesModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [InventoryWarehouseController, InventoryAnalyticsController, WorkingCapitalController],
  providers: [InventoryWarehouseService, InventoryAnalyticsService, WorkingCapitalService],
  exports: [InventoryWarehouseService, InventoryAnalyticsService, WorkingCapitalService],
})
export class InventoryWarehouseModule {}
