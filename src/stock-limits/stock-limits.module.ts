import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockLimitsController } from './stock-limits.controller';
import { StockLimitsService } from './stock-limits.service';
import { StockLimit } from '../entities/stock-limit.entity';

@Module({
  imports: [TypeOrmModule.forFeature([StockLimit])],
  controllers: [StockLimitsController],
  providers: [StockLimitsService],
})
export class StockLimitsModule {}
