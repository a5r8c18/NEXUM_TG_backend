import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { InventoryModule } from '../inventory/inventory.module';
import { AuthModule } from '../auth/auth.module';
import { AccountingModule } from '../accounting/accounting.module';
import { PaginationModule } from '../common/pagination/pagination.module';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceItem } from '../entities/invoice-item.entity';
import { Movement } from '../entities/movement.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Invoice, InvoiceItem, Movement]),
    InventoryModule,
    AuthModule,
    forwardRef(() => AccountingModule),
    PaginationModule,
  ],
  controllers: [InvoicesController],
  providers: [InvoicesService],
})
export class InvoicesModule {}
