import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { LoggerService, LogCategory } from '../common/logger.service';

@Injectable()
export class OwnershipGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private logger: LoggerService,
  ) {
    this.logger.setContext('OwnershipGuard');
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      this.logger.logSecurity(
        LogCategory.SECURITY,
        'Ownership guard failed - no user in request',
        { action: 'OWNERSHIP_GUARD_FAILED', details: { reason: 'no_user' } }
      );
      throw new ForbiddenException('Usuario no autenticado');
    }

    // Superadmin can access all resources
    if (user.role === 'superadmin') {
      return true;
    }

    // Get the resource ID from the request parameters
    const resourceId = request.params?.id;
    if (!resourceId) {
      // If no resource ID, this guard doesn't apply (allow access)
      return true;
    }

    // Check if the resource belongs to the user's company
    // This is a simplified check - in production, you'd query the database
    // to verify the resource's ownership
    const userCompanyId = user.companyId;
    const userTenantId = user.tenantId;

    // For now, we'll add the ownership context to the request
    // The service layer should verify actual ownership
    request.ownershipContext = {
      userId: user.sub,
      companyId: userCompanyId,
      tenantId: userTenantId,
    };

    return true;
  }
}

export const RequireOwnership = () => {
  return (
    target: any,
    propertyKey?: string,
    descriptor?: PropertyDescriptor,
  ) => {
    Reflect.defineMetadata('requireOwnership', true, descriptor?.value || target);
  };
};
