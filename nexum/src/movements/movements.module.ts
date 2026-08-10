import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MovementsController } from './movements.controller';
import { MovementsService } from './movements.service';
import { InventoryWarehouseModule } from '../inventory-warehouse/inventory-warehouse.module';
import { WarehousesModule } from '../warehouses/warehouses.module';
import { Movement } from '../entities/movement.entity';
import { MovementItem } from '../entities/movement-item.entity';
import { DeliveryReport } from '../entities/delivery-report.entity';
import { WarehouseReturn } from '../entities/warehouse-return.entity';
import { WarehouseReturnItem } from '../entities/warehouse-return-item.entity';
import { AccountPayable } from '../entities/account-payable.entity';
import { AccountReceivable } from '../entities/account-receivable.entity';
import { AuthModule } from '../auth/auth.module';
import { AccountingModule } from '../accounting/accounting.module';
import { StockLimitsModule } from '../stock-limits/stock-limits.module';
import { AuditModule } from '../audit/audit.module';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Movement,
      MovementItem,
      DeliveryReport,
      WarehouseReturn,
      WarehouseReturnItem,
      AccountPayable,
      AccountReceivable,
    ]),
    InventoryWarehouseModule,
    WarehousesModule,
    ProductsModule,
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
