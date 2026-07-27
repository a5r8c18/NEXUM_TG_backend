import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentSequence } from '../../entities/document-sequence.entity';
import { DocumentSequenceService } from './document-sequence.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([DocumentSequence])],
  providers: [DocumentSequenceService],
  exports: [DocumentSequenceService],
})
export class DocumentSequenceModule {}
