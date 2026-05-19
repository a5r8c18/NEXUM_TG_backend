import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockLimitsController } from './stock-limits.controller';
import { StockLimitsService } from './stock-limits.service';
import { StockLimit } from '../entities/stock-limit.entity';
import { AuthModule } from '../auth/auth.module';
import { InventoryWarehouseModule } from '../inventory-warehouse/inventory-warehouse.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([StockLimit]),
    forwardRef(() => AuthModule),
    InventoryWarehouseModule,
  ],
  controllers: [StockLimitsController],
  providers: [StockLimitsService],
  exports: [StockLimitsService],
})
export class StockLimitsModule {}
