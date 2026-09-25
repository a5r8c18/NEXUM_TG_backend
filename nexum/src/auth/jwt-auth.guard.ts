/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '../entities/user.entity';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;
    const url = request.url;
    const method = request.method;

    console.log('🔐 JWT GUARD - Petición recibida:', {
      method,
      url,
      hasAuthHeader: !!authHeader,
      authHeader: authHeader ? authHeader.substring(0, 20) + '...' : 'none'
    });

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ JWT GUARD - No hay token Bearer válido');
      throw new UnauthorizedException('Token de autenticación requerido');
    }

    const token = authHeader.split(' ')[1];
    console.log('🔐 JWT GUARD - Token extraído, longitud:', token.length);

    try {
      const payload = this.jwtService.verify(token);
      console.log('✅ JWT GUARD - Token verificado exitosamente:', {
        sub: payload.sub,
        email: payload.email,
        role: payload.role,
        companyId: payload.companyId
      });
      
      // Adjuntar usuario decodificado al request
      request.user = {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        role: payload.role,
        companyId: payload.companyId,
        companyIds: payload.companyIds,
        tenantId: payload.tenantId,
        tenantType: payload.tenantType,
      };

      // Defensa en profundidad: si la petición trae X-Tenant-ID debe coincidir
      // con el tenant del JWT. Solo el superadmin puede operar sobre otro
      // tenant vía header.
      const headerTenantId = request.headers['x-tenant-id'];
      if (
        headerTenantId &&
        payload.role !== UserRole.SUPERADMIN &&
        String(headerTenantId) !== String(payload.tenantId)
      ) {
        throw new ForbiddenException(
          'X-Tenant-ID no coincide con el tenant del usuario',
        );
      }

      return true;
    } catch (error) {
      console.log('❌ JWT GUARD - Error verificando token:', {
        error: error.message,
        name: error.name,
        expiredAt: error.expiredAt
      });
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }
}
