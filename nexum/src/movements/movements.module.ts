import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MovementsController } from './movements.controller';
import { MovementsService } from './movements.service';
import { InventoryWarehouseModule } from '../inventory-warehouse/inventory-warehouse.module';
import { Movement } from '../entities/movement.entity';
import { DeliveryReport } from '../entities/delivery-report.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Movement, DeliveryReport]),
    InventoryWarehouseModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [MovementsController],
  providers: [MovementsService],
})
export class MovementsModule {}
