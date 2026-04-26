/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';
import { Voucher } from '../entities/voucher.entity';
import { User } from '../entities/user.entity';
import { Company } from '../entities/company.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Voucher, User, Company]),
  ],
  controllers: [MonitoringController],
  providers: [MonitoringService],
  exports: [MonitoringService],
})
export class MonitoringModule {}
