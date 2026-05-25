import { Module, Global } from '@nestjs/common';
import { LoggerService } from './logger.service';
import { EncryptionService } from './services/encryption.service';

@Global()
@Module({
  providers: [LoggerService, EncryptionService],
  exports: [LoggerService, EncryptionService],
})
export class CommonModule {}
