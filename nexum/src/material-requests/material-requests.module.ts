import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaterialRequest } from '../entities/material-request.entity';
import { MaterialRequestItem } from '../entities/material-request-item.entity';
import { MaterialRequestsService } from './material-requests.service';
import { MaterialRequestsController } from './material-requests.controller';
import { MovementsModule } from '../movements/movements.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MaterialRequest, MaterialRequestItem]),
    MovementsModule,
    CommonModule,
  ],
  providers: [MaterialRequestsService],
  controllers: [MaterialRequestsController],
  exports: [MaterialRequestsService],
})
export class MaterialRequestsModule {}
