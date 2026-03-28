import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return false;
    }

    // Por ahora, simulamos la autenticación básica
    // En producción, aquí se verificaría el token JWT
    const token = authHeader.split(' ')[1];
    
    // Simulamos un usuario autenticado para pruebas
    request.user = {
      id: 'test-user-id',
      email: 'test@example.com',
      role: 'admin',
      companyId: 1
    };

    return true;
  }
}
