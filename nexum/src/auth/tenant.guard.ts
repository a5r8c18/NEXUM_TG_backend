import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { LoggerService, LogCategory } from '../common/logger.service';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private logger: LoggerService,
  ) {
    this.logger.setContext('TenantGuard');
  }

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      'isPublic',
      [context.getHandler(), context.getClass()],
    );

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      this.logger.logSecurity(
        LogCategory.SECURITY,
        'Tenant guard failed - no user in request',
        { action: 'TENANT_GUARD_FAILED', details: { reason: 'no_user' } }
      );
      throw new ForbiddenException('Usuario no autenticado');
    }

    // Superadmin can access all tenants
    if (user.role === 'superadmin') {
      return true;
    }

    // For regular users, ensure tenant context is set
    if (!user.tenantId) {
      this.logger.logSecurity(
        LogCategory.SECURITY,
        'Tenant guard failed - no tenantId in user',
        { userId: user.sub, action: 'TENANT_GUARD_FAILED', details: { reason: 'no_tenant' } }
      );
      throw new ForbiddenException('Usuario sin tenant asignado');
    }

    // Add tenant filter to query if applicable
    const tenantId = user.tenantId;
    request.tenantId = tenantId;

    return true;
  }
}

export const Public = () => {
  return (
    target: any,
    propertyKey?: string,
    descriptor?: PropertyDescriptor,
  ) => {
    Reflect.defineMetadata('isPublic', true, descriptor?.value || target);
  };
};
