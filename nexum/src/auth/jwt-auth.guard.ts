/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    console.log('JWT GUARD - Auth header:', authHeader ? 'Present' : 'Missing');
    console.log('JWT GUARD - Request URL:', request.url);

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('JWT GUARD - No Bearer token found');
      throw new UnauthorizedException('Token de autenticación requerido');
    }

    const token = authHeader.split(' ')[1];
    console.log('JWT GUARD - Token length:', token.length);
    console.log('JWT GUARD - Token preview:', token.substring(0, 20) + '...');

    try {
      const payload = this.jwtService.verify(token);
      console.log('JWT GUARD - Token verified successfully');
      console.log('JWT GUARD - Payload:', payload);
      
      // Adjuntar usuario decodificado al request
      request.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        companyId: payload.companyId,
        tenantId: payload.tenantId,
        tenantType: payload.tenantType,
      };
      console.log('JWT GUARD - User attached to request:', request.user);
      return true;
    } catch (error) {
      console.log('JWT GUARD - Token verification failed:', error);
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }
}
