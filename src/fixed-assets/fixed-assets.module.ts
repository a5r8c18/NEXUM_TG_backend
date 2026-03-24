import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FixedAssetsController } from './fixed-assets.controller';
import { FixedAssetsService } from './fixed-assets.service';
import { FixedAsset } from '../entities/fixed-asset.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FixedAsset])],
  controllers: [FixedAssetsController],
  providers: [FixedAssetsService],
})
export class FixedAssetsModule {}
