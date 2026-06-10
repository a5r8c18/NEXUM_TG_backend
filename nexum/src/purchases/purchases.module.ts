import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';
import { AuthModule } from '../auth/auth.module';
import { InventoryWarehouseModule } from '../inventory-warehouse/inventory-warehouse.module';
import { ProductsModule } from '../products/products.module';
import { AccountingModule } from '../accounting/accounting.module';
import { WarehousesModule } from '../warehouses/warehouses.module';
import { Purchase } from '../entities/purchase.entity';
import { PurchaseProduct } from '../entities/purchase-product.entity';
import { Movement } from '../entities/movement.entity';
import { ReceptionReport } from '../entities/reception-report.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Purchase,
      PurchaseProduct,
      Movement,
      ReceptionReport,
    ]),
    InventoryWarehouseModule,
    ProductsModule,
    WarehousesModule,
    forwardRef(() => AccountingModule),
    forwardRef(() => AuthModule),
  ],
  controllers: [PurchasesController],
  providers: [PurchasesService],
})
export class PurchasesModule {}
