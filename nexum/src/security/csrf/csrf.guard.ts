/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { CsrfService } from './csrf.service';
import { CSRF_METADATA_KEY } from './csrf.decorators';

@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly logger = new Logger(CsrfGuard.name);

  constructor(
    private readonly csrfService: CsrfService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    // Check if CSRF protection is disabled for this endpoint
    const isCsrfDisabled = this.reflector.get<boolean>(
      CSRF_METADATA_KEY,
      context.getHandler(),
    );
    if (isCsrfDisabled) {
      return true;
    }

    // Skip CSRF for GET, HEAD, OPTIONS requests (they are safe)
    const method = request.method;
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return true;
    }

    // Validate CSRF token for unsafe methods
    const token = this.extractCsrfToken(request);
    const sessionId = this.getSessionId(request);

    if (
      !token ||
      !sessionId ||
      !this.csrfService.validateToken(token, sessionId || undefined)
    ) {
      this.logger.warn(
        `CSRF validation failed for ${method} ${request.originalUrl}`,
      );
      throw new ForbiddenException('CSRF token validation failed');
    }

    return true;
  }

  /**
   * Extract CSRF token from request
   */
  private extractCsrfToken(request: Request): string | null {
    // Try to get token from header
    const headerToken = request.header('x-csrf-token');
    if (headerToken) {
      return headerToken;
    }

    // Try to get token from cookie
    const cookieToken = request.cookies?.['_csrf'];
    if (cookieToken) {
      return cookieToken;
    }

    // Try to get token from request body (for form submissions)
    const bodyToken = request.body?._csrf;
    if (bodyToken) {
      return bodyToken;
    }

    return null;
  }

  /**
   * Extract session ID from request
   */
  private getSessionId(request: Request): string | null {
    // Try to get session ID from JWT payload
    const user = (request as any).user;
    if (user?.sessionId) {
      return user.sessionId;
    }

    // Try to get session ID from session
    if ((request as any).session?.id) {
      return (request as any).session.id;
    }

    // Try to get session ID from cookie
    const sessionIdCookie = request.cookies?.['sessionId'];
    if (sessionIdCookie) {
      return sessionIdCookie;
    }

    return null;
  }
}
