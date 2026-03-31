import { Controller, Post, Body, Get, Param, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }

  @Post('register')
  register(
    @Body()
    body: {
      firstName: string;
      lastName: string;
      email: string;
      password: string;
    },
  ) {
    return this.authService.register(body);
  }

  @Post('setup-password')
  setupPassword(
    @Body()
    body: {
      email: string;
      password: string;
      firstName?: string;
      lastName?: string;
    },
  ) {
    return this.authService.setupPassword(body);
  }

  @Get('validate-token/:token')
  validateToken(@Param('token') token: string) {
    return this.authService.validateToken(token);
  }
}
