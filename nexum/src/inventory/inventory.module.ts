import { Module, forwardRef } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryWarehouseModule } from '../inventory-warehouse/inventory-warehouse.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    InventoryWarehouseModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [InventoryController],
})
export class InventoryModule {}
