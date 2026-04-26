/* eslint-disable @typescript-eslint/no-unused-vars */
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountingController } from './accounting.controller';
import { SubelementsController } from './subelements.controller';
import { SubelementsService } from './subelements.service';
import { VoucherService } from './voucher.service';
import { ReportService } from './report.service';
import { AccountService } from './account.service';
import { CostCenterService } from './cost-center.service';
import { FiscalYearService } from './fiscal-year.service';
import { ElementoService } from './elemento.service';
import { ExpenseTypeService } from './expense-type.service';
import { Elemento } from '../entities/elemento.entity';
import { Account } from '../entities/account.entity';
import { Voucher, SourceModule } from '../entities/voucher.entity';
import { VoucherLine } from '../entities/voucher-line.entity';
import { CostCenter } from '../entities/cost-center.entity';
import { FiscalYear } from '../entities/fiscal-year.entity';
import { AccountingPeriod } from '../entities/accounting-period.entity';
import { ExpenseType } from '../entities/expense-type.entity';
import { Subelement } from '../entities/subelement.entity';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { PaginationModule } from '../common/pagination/pagination.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Elemento,
      Account,
      Voucher,
      VoucherLine,
      CostCenter,
      FiscalYear,
      AccountingPeriod,
      ExpenseType,
      Subelement,
    ]),
    forwardRef(() => AuthModule),
    AuditModule,
    PaginationModule,
  ],
  controllers: [AccountingController, SubelementsController],
  providers: [
    VoucherService,
    ReportService,
    AccountService,
    CostCenterService,
    FiscalYearService,
    SubelementsService,
    ElementoService,
    ExpenseTypeService,
  ],
  exports: [
    VoucherService,
    ReportService,
    AccountService,
    CostCenterService,
    FiscalYearService,
  ],
})
export class AccountingModule {}
