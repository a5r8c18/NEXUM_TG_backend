/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  Controller,
  Get,
  Post,
  Res,
  Req,
  UseGuards,
  Body,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CsrfService } from './csrf.service';

@ApiTags('CSRF')
@Controller('csrf')
@UseGuards(JwtAuthGuard)
export class CsrfController {
  constructor(private readonly csrfService: CsrfService) {}

  @Get('token')
  @ApiOperation({ summary: 'Get CSRF token' })
  @ApiResponse({
    status: 200,
    description: 'CSRF token generated successfully',
  })
  async getCsrfToken(@Req() req: Request, @Res() res: Response) {
    const sessionId = this.getSessionId(req);
    const token = this.csrfService.generateToken(sessionId || undefined);

    // Set CSRF token in cookie
    res.cookie('_csrf', token, {
      httpOnly: false, // Allow JavaScript access
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 3600000, // 1 hour
    });

    return {
      csrfToken: token,
      expiresIn: 3600, // 1 hour in seconds
    };
  }

  @Post('validate')
  @ApiOperation({ summary: 'Validate CSRF token' })
  @ApiResponse({ status: 200, description: 'CSRF token is valid' })
  @ApiResponse({ status: 400, description: 'CSRF token is invalid' })
  async validateCsrfToken(
    @Req() req: Request,
    @Body() body: { token: string },
  ) {
    const sessionId = this.getSessionId(req);
    const isValid = this.csrfService.validateToken(body.token, sessionId || undefined);

    return {
      valid: isValid,
      sessionId,
    };
  }

  @Post('revoke')
  @ApiOperation({ summary: 'Revoke CSRF token' })
  @ApiResponse({ status: 200, description: 'CSRF token revoked successfully' })
  async revokeCsrfToken(@Req() req: Request, @Body() body: { token: string }) {
    const sessionId = this.getSessionId(req);
    this.csrfService.revokeToken(body.token, sessionId || undefined);

    return {
      message: 'CSRF token revoked successfully',
    };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get CSRF statistics' })
  @ApiResponse({
    status: 200,
    description: 'CSRF statistics retrieved successfully',
  })
  async getCsrfStats() {
    return this.csrfService.getStats();
  }

  private getSessionId(req: Request): string | null {
    const user = (req as any).user;
    return user?.sessionId || null;
  }
}
