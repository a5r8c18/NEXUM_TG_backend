import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PhysicalCountController } from './physical-count.controller';
import { PhysicalCountService } from './physical-count.service';
import { PhysicalCount, PhysicalCountStatus } from '../entities/physical-count.entity';
import { PhysicalCountItem } from '../entities/physical-count-item.entity';
import { InventoryWarehouseModule } from '../inventory-warehouse/inventory-warehouse.module';
import { MovementsModule } from '../movements/movements.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PhysicalCount, PhysicalCountItem]),
    InventoryWarehouseModule,
    MovementsModule,
    JwtModule.register({}),
  ],
  controllers: [PhysicalCountController],
  providers: [PhysicalCountService],
  exports: [PhysicalCountService],
})
export class PhysicalCountModule {}
