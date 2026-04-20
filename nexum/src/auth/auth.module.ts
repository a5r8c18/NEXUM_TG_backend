import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AdminController } from './admin.controller';
import { TenantRequestsController } from './tenant-requests.controller';
import { AuthService } from './auth.service';
import { RegistrationRequestsService } from './registration-requests.service';
import { EmailService } from './email.service';
import { RefreshTokenService } from './refresh-token.service';
import { RolesGuard } from './roles.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { User } from '../entities/user.entity';
import { Company } from '../entities/company.entity';
import { RegistrationRequest } from '../entities/registration-request.entity';
import { RefreshToken } from './refresh-token.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Company, RegistrationRequest, RefreshToken]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error('JWT_SECRET environment variable is required');
        }
        return {
          secret,
          signOptions: { expiresIn: '24h' },
        };
      },
    }),
  ],
  controllers: [AuthController, AdminController, TenantRequestsController],
  providers: [RegistrationRequestsService, AuthService, EmailService, RefreshTokenService, RolesGuard, JwtAuthGuard],
  exports: [RolesGuard, JwtAuthGuard, JwtModule],
})
export class AuthModule {}
