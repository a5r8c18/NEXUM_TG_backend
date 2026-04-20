import { Controller, Post, Body, Get, Param, BadRequestException, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto, SetupPasswordDto, RefreshTokenDto } from './dto';
import { Request } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 login attempts per minute
  @Post('login')
  login(@Body() body: LoginDto, @Req() req: Request) {
    console.log('AUTH CONTROLLER - Login attempt for email:', body.email);
    console.log('AUTH CONTROLLER - Request body:', body);
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');
    console.log('AUTH CONTROLLER - IP:', ipAddress, 'User-Agent:', userAgent);
    return this.authService.login(body.email, body.password, ipAddress, userAgent);
  }

  @Throttle({ default: { limit: 3, ttl: 300000 } }) // 3 registrations per 5 minutes
  @Post('register')
  register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 password setups per minute
  @Post('setup-password')
  setupPassword(@Body() body: SetupPasswordDto) {
    return this.authService.setupPassword(body);
  }

  @Get('validate-token/:token')
  validateToken(@Param('token') token: string) {
    return this.authService.validateToken(token);
  }

  @Post('refresh')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 refresh attempts per minute
  async refreshToken(@Body() body: RefreshTokenDto) {
    return this.authService.refreshToken(body.refreshToken);
  }

  @Post('logout')
  async logout(@Body() body: RefreshTokenDto) {
    return this.authService.logout(body.refreshToken);
  }

  @Post('logout-all')
  async logoutAll(@Req() req: Request) {
    // This would require JWT token to get user ID
    // For now, we'll implement a basic version
    return { message: 'Logged out from all devices' };
  }
}
