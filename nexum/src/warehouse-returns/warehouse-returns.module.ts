import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WarehouseReturn } from '../entities/warehouse-return.entity';
import { WarehouseReturnItem } from '../entities/warehouse-return-item.entity';
import { WarehouseReturnsService } from './warehouse-returns.service';
import { WarehouseReturnsController } from './warehouse-returns.controller';
import { MovementsModule } from '../movements/movements.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WarehouseReturn, WarehouseReturnItem]),
    MovementsModule,
    CommonModule,
  ],
  providers: [WarehouseReturnsService],
  controllers: [WarehouseReturnsController],
  exports: [WarehouseReturnsService],
})
export class WarehouseReturnsModule {}
