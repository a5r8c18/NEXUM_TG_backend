import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UserCompaniesService } from './user-companies.service';
import { UsersController } from './users.controller';
import { User } from '../entities/user.entity';
import { UserCompany } from '../entities/user-company.entity';
import { Company } from '../entities/company.entity';
import { CompaniesModule } from '../companies/companies.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserCompany, Company]),
    CompaniesModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [UsersController],
  providers: [UsersService, UserCompaniesService],
  exports: [UsersService, UserCompaniesService],
})
export class UsersModule {}
