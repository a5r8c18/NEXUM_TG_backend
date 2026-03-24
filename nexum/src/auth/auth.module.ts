import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AdminController } from './admin.controller';
import { AuthService } from './auth.service';
import { RegistrationRequestsService } from './registration-requests.service';
import { User } from '../entities/user.entity';
import { RegistrationRequest } from '../entities/registration-request.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, RegistrationRequest])],
  controllers: [AuthController, AdminController],
  providers: [RegistrationRequestsService, AuthService],
})
export class AuthModule {}
