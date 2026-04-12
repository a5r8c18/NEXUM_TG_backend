import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { JournalEntry } from '../entities/journal-entry.entity';
import { Partida } from '../entities/partida.entity';
import { Elemento } from '../entities/elemento.entity';
import { Account } from '../entities/account.entity';
import { Voucher, SourceModule } from '../entities/voucher.entity';
import { VoucherLine } from '../entities/voucher-line.entity';
import { CostCenter } from '../entities/cost-center.entity';
import { FiscalYear } from '../entities/fiscal-year.entity';
import { AccountingPeriod } from '../entities/accounting-period.entity';
import { ExpenseType } from '../entities/expense-type.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      JournalEntry,
      Partida,
      Elemento,
      Account,
      Voucher,
      VoucherLine,
      CostCenter,
      FiscalYear,
      AccountingPeriod,
      ExpenseType,
    ]),
    forwardRef(() => AuthModule),
  ],
  controllers: [AccountingController],
  providers: [AccountingService],
  exports: [AccountingService],
})
export class AccountingModule {}
