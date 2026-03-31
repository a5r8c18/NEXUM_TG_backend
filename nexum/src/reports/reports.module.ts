import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { AuthModule } from '../auth/auth.module';
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
    forwardRef(() => AuthModule),
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
