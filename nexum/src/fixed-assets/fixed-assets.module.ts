import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FixedAssetsController } from './fixed-assets.controller';
import { FixedAssetsService } from './fixed-assets.service';
import { FixedAsset } from '../entities/fixed-asset.entity';
import { DepreciationHistory } from '../entities/depreciation-history.entity';
import { DepreciationCatalog } from '../entities/depreciation-catalog.entity';
import { FixedAssetInventory } from '../entities/fixed-asset-inventory.entity';
import { AuthModule } from '../auth/auth.module';
import { AccountingModule } from '../accounting/accounting.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([FixedAsset, DepreciationHistory, DepreciationCatalog, FixedAssetInventory]),
    forwardRef(() => AuthModule),
    forwardRef(() => AccountingModule),
    AuditModule,
  ],
  controllers: [FixedAssetsController],
  providers: [FixedAssetsService],
})
export class FixedAssetsModule {}
