import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_INTERCEPTOR } from '@nestjs/core';
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
import { UsersModule } from './users/users.module';
import { InventoryWarehouseModule } from './inventory-warehouse/inventory-warehouse.module';
import { AuditModule } from './audit/audit.module';
import { AuditInterceptor } from './interceptors/audit.interceptor';
import { NotificationsModule } from './notifications/notifications.module';
import { AccountingModule } from './accounting/accounting.module';
import { HrModule } from './hr/hr.module';
import { MessagesModule } from './messages/messages.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { LoggerModule } from './logger/logger.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { RedisCacheModule } from './cache';

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
import { InventoryWarehouse } from './entities/inventory-warehouse.entity';
import { AuditLog } from './entities/audit-log.entity';
import { UserCompany } from './entities/user-company.entity';
import { Account } from './entities/account.entity';
import { Elemento } from './entities/elemento.entity';
import { Voucher } from './entities/voucher.entity';
import { VoucherLine } from './entities/voucher-line.entity';
import { CostCenter } from './entities/cost-center.entity';
import { FiscalYear } from './entities/fiscal-year.entity';
import { AccountingPeriod } from './entities/accounting-period.entity';
import { Department } from './entities/department.entity';
import { Employee } from './entities/employee.entity';
import { ExpenseType } from './entities/expense-type.entity';
import { Message } from './entities/message.entity';
import { Subscription } from './entities/subscription.entity';
import { Subelement } from './entities/subelement.entity';
import { GeneratedReport } from './entities/generated-report.entity';
import { RefreshToken } from './auth/refresh-token.entity';

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
          InventoryWarehouse,
          AuditLog,
          UserCompany,
          Account,
          Elemento,
          Voucher,
          VoucherLine,
          CostCenter,
          FiscalYear,
          AccountingPeriod,
          Department,
          Employee,
          Message,
          ExpenseType,
          Subscription,
          Subelement,
          GeneratedReport,
          RefreshToken,
        ],
        synchronize:
          configService.get<string>('DB_SYNCHRONIZE', 'false') === 'true',
        // Connection pooling
        extra: {
          max: configService.get<number>('DB_POOL_MAX', 20),
          min: configService.get<number>('DB_POOL_MIN', 5),
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        },
        logging: configService.get<string>('DB_LOGGING', 'false') === 'true',
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
    UsersModule,
    InventoryWarehouseModule,
    AuditModule,
    NotificationsModule,
    AccountingModule,
    HrModule,
    MessagesModule,
    SubscriptionsModule,
    LoggerModule,
    RedisCacheModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 100, // limit each IP to 100 requests per window
      },
    ]),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {}
