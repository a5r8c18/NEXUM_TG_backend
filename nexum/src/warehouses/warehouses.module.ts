import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WarehousesController } from './warehouses.controller';
import { WarehousesService } from './warehouses.service';
import { Warehouse } from '../entities/warehouse.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Warehouse]),
    forwardRef(() => AuthModule),
  ],
  controllers: [WarehousesController],
  providers: [WarehousesService],
  exports: [WarehousesService],
})
export class WarehousesModule {}
