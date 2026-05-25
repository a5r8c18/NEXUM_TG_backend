import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BudgetController } from './budget.controller';
import { BudgetService } from './budget.service';
import { Budget } from '../entities/budget.entity';
import { BudgetLine } from '../entities/budget-line.entity';
import { VoucherLine } from '../entities/voucher-line.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Budget, BudgetLine, VoucherLine]),
    forwardRef(() => AuthModule),
  ],
  controllers: [BudgetController],
  providers: [BudgetService],
  exports: [BudgetService],
})
export class BudgetModule {}
