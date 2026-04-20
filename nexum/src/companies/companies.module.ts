import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CompaniesController,
  CompaniesPublicController,
} from './companies.controller';
import { CompaniesService } from './companies.service';
import { Company } from '../entities/company.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Company]), forwardRef(() => AuthModule)],
  controllers: [CompaniesController, CompaniesPublicController],
  providers: [CompaniesService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
