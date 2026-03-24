import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReceptionReport } from '../entities/reception-report.entity';
import { DeliveryReport } from '../entities/delivery-report.entity';
import { Inventory } from '../entities/inventory.entity';
import { Movement } from '../entities/movement.entity';
import { Purchase } from '../entities/purchase.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ReceptionReport,
      DeliveryReport,
      Inventory,
      Movement,
      Purchase,
    ]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
