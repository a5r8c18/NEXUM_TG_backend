import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AdminController } from './admin.controller';
import { TenantRequestsController } from './tenant-requests.controller';
import { AuthService } from './auth.service';
import { RegistrationRequestsService } from './registration-requests.service';
import { EmailService } from './email.service';
import { User } from '../entities/user.entity';
import { Company } from '../entities/company.entity';
import { RegistrationRequest } from '../entities/registration-request.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Company, RegistrationRequest])],
  controllers: [AuthController, AdminController, TenantRequestsController],
  providers: [RegistrationRequestsService, AuthService, EmailService],
})
export class AuthModule {}
