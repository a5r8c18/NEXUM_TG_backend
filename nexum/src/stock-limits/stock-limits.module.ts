import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockLimitsController } from './stock-limits.controller';
import { StockLimitsService } from './stock-limits.service';
import { StockLimit } from '../entities/stock-limit.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([StockLimit]),
    forwardRef(() => AuthModule),
  ],
  controllers: [StockLimitsController],
  providers: [StockLimitsService],
})
export class StockLimitsModule {}
