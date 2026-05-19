import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinanceService } from './finance.service';
import { FinanceController } from './finance.controller';
import { AccountReceivable } from '../entities/account-receivable.entity';
import { AccountPayable } from '../entities/account-payable.entity';
import { BankAccount } from '../entities/bank-account.entity';
import { BankTransaction } from '../entities/bank-transaction.entity';
import { Payment } from '../entities/payment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AccountReceivable,
      AccountPayable,
      BankAccount,
      BankTransaction,
      Payment,
    ]),
  ],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
