import { Module } from '@nestjs/common';
import { CsrfController } from './csrf.controller';
import { CsrfService } from './csrf.service';
import { CsrfGuard } from './csrf.guard';

@Module({
  controllers: [CsrfController],
  providers: [CsrfService, CsrfGuard],
  exports: [CsrfService, CsrfGuard],
})
export class CsrfModule {}
