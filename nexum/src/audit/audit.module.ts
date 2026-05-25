import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { ImmutableAuditService } from './immutable-audit.service';
import { AuditLog } from '../entities/audit-log.entity';
import { ImmutableAuditLog } from '../entities/immutable-audit-log.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog, ImmutableAuditLog]),
    forwardRef(() => AuthModule),
  ],
  controllers: [AuditController],
  providers: [AuditService, ImmutableAuditService],
  exports: [AuditService, ImmutableAuditService],
})
export class AuditModule {}
