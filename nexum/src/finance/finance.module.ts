import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { FinanceService } from './finance.service';
import { FinanceController } from './finance.controller';
import { AccountReceivable } from '../entities/account-receivable.entity';
import { AccountPayable } from '../entities/account-payable.entity';
import { BankAccount } from '../entities/bank-account.entity';
import { BankTransaction } from '../entities/bank-transaction.entity';
import { Payment } from '../entities/payment.entity';
import { CashRegister } from '../entities/cash-register.entity';
import { CashMovement } from '../entities/cash-movement.entity';
import { BankReconciliation } from '../entities/bank-reconciliation.entity';
import { Invoice } from '../entities/invoice.entity';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AccountReceivable,
      AccountPayable,
      BankAccount,
      BankTransaction,
      Payment,
      CashRegister,
      CashMovement,
      BankReconciliation,
      Invoice,
    ]),
    AuthModule,
    forwardRef(() => AccountingModule),
  ],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
