import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MovementsController } from './movements.controller';
import { MovementsService } from './movements.service';
import { InventoryWarehouseModule } from '../inventory-warehouse/inventory-warehouse.module';
import { Movement } from '../entities/movement.entity';
import { DeliveryReport } from '../entities/delivery-report.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Movement, DeliveryReport]),
    InventoryWarehouseModule,
  ],
  controllers: [MovementsController],
  providers: [MovementsService],
})
export class MovementsModule {}
