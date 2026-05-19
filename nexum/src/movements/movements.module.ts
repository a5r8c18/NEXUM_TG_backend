import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MovementsController } from './movements.controller';
import { MovementsService } from './movements.service';
import { InventoryWarehouseModule } from '../inventory-warehouse/inventory-warehouse.module';
import { Movement } from '../entities/movement.entity';
import { DeliveryReport } from '../entities/delivery-report.entity';
import { AuthModule } from '../auth/auth.module';
import { AccountingModule } from '../accounting/accounting.module';
import { StockLimitsModule } from '../stock-limits/stock-limits.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Movement, DeliveryReport]),
    InventoryWarehouseModule,
    StockLimitsModule,
    AuditModule,
    forwardRef(() => AuthModule),
    forwardRef(() => AccountingModule),
  ],
  controllers: [MovementsController],
  providers: [MovementsService],
  exports: [MovementsService],
})
export class MovementsModule {}
