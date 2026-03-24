import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { InventoryModule } from './inventory/inventory.module';
import { CompaniesModule } from './companies/companies.module';
import { MovementsModule } from './movements/movements.module';
import { PurchasesModule } from './purchases/purchases.module';
import { ReportsModule } from './reports/reports.module';
import { InvoicesModule } from './invoices/invoices.module';
import { FixedAssetsModule } from './fixed-assets/fixed-assets.module';
import { WarehousesModule } from './warehouses/warehouses.module';
import { StockLimitsModule } from './stock-limits/stock-limits.module';

import { Company } from './entities/company.entity';
import { User } from './entities/user.entity';
import { Warehouse } from './entities/warehouse.entity';
import { Inventory } from './entities/inventory.entity';
import { Purchase } from './entities/purchase.entity';
import { PurchaseProduct } from './entities/purchase-product.entity';
import { Movement } from './entities/movement.entity';
import { Invoice } from './entities/invoice.entity';
import { InvoiceItem } from './entities/invoice-item.entity';
import { FixedAsset } from './entities/fixed-asset.entity';
import { ReceptionReport } from './entities/reception-report.entity';
import { DeliveryReport } from './entities/delivery-report.entity';
import { StockLimit } from './entities/stock-limit.entity';
import { RegistrationRequest } from './entities/registration-request.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get<string>('DB_USERNAME', 'postgres'),
        password: configService.get<string>('DB_PASSWORD', 'postgres'),
        database: configService.get<string>('DB_NAME', 'nexum_db'),
        entities: [
          Company,
          User,
          Warehouse,
          Inventory,
          Purchase,
          PurchaseProduct,
          Movement,
          Invoice,
          InvoiceItem,
          FixedAsset,
          ReceptionReport,
          DeliveryReport,
          StockLimit,
          RegistrationRequest,
        ],
        synchronize: true,
      }),
    }),
    AuthModule,
    InventoryModule,
    CompaniesModule,
    MovementsModule,
    PurchasesModule,
    ReportsModule,
    InvoicesModule,
    FixedAssetsModule,
    WarehousesModule,
    StockLimitsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
