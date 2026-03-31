import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { JournalEntry } from '../entities/journal-entry.entity';
import { Account } from '../entities/account.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([JournalEntry, Account]),
    forwardRef(() => AuthModule),
  ],
  controllers: [AccountingController],
  providers: [AccountingService],
  exports: [AccountingService],
})
export class AccountingModule {}
