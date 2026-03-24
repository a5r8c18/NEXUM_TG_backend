import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { Inventory } from '../entities/inventory.entity';
import { Movement } from '../entities/movement.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Inventory, Movement])],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
