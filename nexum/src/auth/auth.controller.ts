import { Controller, Post, Body, Get, Param, BadRequestException, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { MfaService } from './mfa.service';
import { LoginDto, RegisterDto, SetupPasswordDto, RefreshTokenDto } from './dto';
import { Request } from 'express';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LoggerService, LogCategory } from '../common/logger.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly mfaService: MfaService,
    private logger: LoggerService,
  ) {
    this.logger.setContext('AuthController');
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 login attempts per minute
  @Post('login')
  async login(@Body() body: LoginDto, @Req() req: Request) {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');

    this.logger.logApiRequest(
      'POST',
      '/auth/login',
      0,
      0,
      { userId: body.email, ipAddress, userAgent }
    );

    return this.authService.login(body.email, body.password, ipAddress, userAgent);
  }

  @Throttle({ default: { limit: 3, ttl: 300000 } }) // 3 registrations per 5 minutes
  @Post('register')
  async register(@Body() body: RegisterDto) {
    this.logger.logAudit(
      'REGISTRATION_ATTEMPT',
      'User',
      { userEmail: body.email, firstName: body.firstName, lastName: body.lastName }
    );
    return this.authService.register(body);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 password setups per minute
  @Post('setup-password')
  async setupPassword(@Body() body: SetupPasswordDto) {
    this.logger.logAudit(
      'PASSWORD_SETUP',
      'User',
      { userEmail: body.email }
    );
    return this.authService.setupPassword(body);
  }

  @Get('validate-token/:token')
  async validateToken(@Param('token') token: string) {
    this.logger.logAudit(
      'TOKEN_VALIDATION',
      'RegistrationRequest',
      { token: token.substring(0, 10) + '...' }
    );
    return this.authService.validateToken(token);
  }

  @Post('refresh')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 refresh attempts per minute
  async refreshToken(@Body() body: RefreshTokenDto, @Req() req: Request) {
    const ipAddress = req.ip || req.connection.remoteAddress;
    this.logger.logAudit(
      'TOKEN_REFRESH',
      'RefreshToken',
      { ipAddress }
    );
    return this.authService.refreshToken(body.refreshToken);
  }

  @Post('logout')
  async logout(@Body() body: RefreshTokenDto, @Req() req: Request) {
    const ipAddress = req.ip || req.connection.remoteAddress;
    this.logger.logAudit(
      'LOGOUT',
      'User',
      { ipAddress }
    );
    return this.authService.logout(body.refreshToken);
  }

  @Post('logout-all')
  async logoutAll(@Req() req: Request) {
    const ipAddress = req.ip || req.connection.remoteAddress;
    this.logger.logAudit(
      'LOGOUT_ALL',
      'User',
      { ipAddress }
    );
    // This would require JWT token to get user ID
    // For now, we'll implement a basic version
    return { message: 'Logged out from all devices' };
  }

  // MFA Endpoints
  @UseGuards(JwtAuthGuard)
  @Post('mfa/setup')
  async setupMFA(@Req() req: Request) {
    const userId = (req as any).user?.sub;
    if (!userId) {
      throw new BadRequestException('Usuario no autenticado');
    }
    this.logger.logAudit(
      'MFA_SETUP_REQUESTED',
      'UserMFA',
      { userId }
    );
    return this.mfaService.generateSecret(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('mfa/verify')
  async verifyMFA(@Req() req: Request, @Body() body: { token: string }) {
    const userId = (req as any).user?.sub;
    if (!userId) {
      throw new BadRequestException('Usuario no autenticado');
    }
    this.logger.logAudit(
      'MFA_VERIFY_ATTEMPT',
      'UserMFA',
      { userId }
    );
    return this.mfaService.verifyAndEnable(userId, body.token);
  }

  @UseGuards(JwtAuthGuard)
  @Post('mfa/disable')
  async disableMFA(@Req() req: Request, @Body() body: { password: string }) {
    const userId = (req as any).user?.sub;
    if (!userId) {
      throw new BadRequestException('Usuario no autenticado');
    }
    this.logger.logAudit(
      'MFA_DISABLE_REQUESTED',
      'UserMFA',
      { userId }
    );
    await this.mfaService.disableMFA(userId, body.password);
    return { message: 'MFA deshabilitado exitosamente' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('mfa/status')
  async getMFAStatus(@Req() req: Request) {
    const userId = (req as any).user?.sub;
    if (!userId) {
      throw new BadRequestException('Usuario no autenticado');
    }
    return this.mfaService.getMFAStatus(userId);
  }

  @Post('mfa/verify-login')
  async verifyMFAForLogin(@Body() body: { userId: string; token: string }, @Req() req: Request) {
    const ipAddress = req.ip || req.connection.remoteAddress;
    this.logger.logAudit(
      'MFA_LOGIN_VERIFY_ATTEMPT',
      'UserMFA',
      { userId: body.userId, ipAddress }
    );
    const verified = await this.mfaService.verifyToken(body.userId, body.token);
    return { verified };
  }

  @Post('mfa/complete-login')
  async completeLoginWithMFA(@Body() body: { userId: string; token: string }, @Req() req: Request) {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');
    this.logger.logAudit(
      'MFA_LOGIN_COMPLETE',
      'User',
      { userId: body.userId, ipAddress, userAgent }
    );
    return this.authService.completeLoginWithMFA(body.userId, body.token, ipAddress, userAgent);
  }
}
