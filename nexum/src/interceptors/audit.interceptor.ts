/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditResource } from '../entities/audit-log.entity';

// Extender Request interface para incluir propiedades personalizadas
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    companyId: number;
    company?: {
      id: number;
      name: string;
      taxId: string;
      tenantId: string;
      tenantType: string;
    };
  };
  session?: {
    id: string;
  };
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const startTime = Date.now();

    // Extraer información del usuario si está autenticado
    const user = request.user;
    const companyId =
      user?.companyId || (request.headers['x-company-id'] as string);

    // Determinar acción y recurso basado en el método y ruta
    const { action, resource } = this.getActionAndResource(request);

    return next.handle().pipe(
      tap(() => {
        // Éxito: registrar la acción
        const duration = Date.now() - startTime;
        this.auditService.log({
          companyId: Number(companyId),
          userId: user?.id,
          userName: user ? `${user.firstName} ${user.lastName}` : undefined,
          userEmail: user?.email,
          userRole: user?.role,
          action,
          resource,
          resourceId: (request.params.id as string) || undefined,
          endpoint: request.url,
          method: request.method,
          ipAddress: this.getClientIp(request),
          userAgent: request.headers['user-agent'] as string,
          sessionId: request.session?.id,
          durationMs: duration,
          success: true,
          newValues: {
            ...this.extractRelevantData(request.body),
            // Agregar información de la empresa si está disponible
            companyInfo: user?.company
              ? {
                  id: user.company.id,
                  name: user.company.name,
                  taxId: user.company.taxId,
                  tenantId: user.company.tenantId,
                  tenantType: user.company.tenantType,
                }
              : null,
          },
        });
      }),
      catchError((error) => {
        // Error: registrar el fallo
        const duration = Date.now() - startTime;
        this.auditService.log({
          companyId: Number(companyId),
          userId: user?.id,
          userName: user ? `${user.firstName} ${user.lastName}` : undefined,
          userEmail: user?.email,
          userRole: user?.role,
          action,
          resource,
          resourceId: (request.params.id as string) || undefined,
          endpoint: request.url,
          method: request.method,
          ipAddress: this.getClientIp(request),
          userAgent: request.headers['user-agent'] as string,
          sessionId: request.session?.id,
          durationMs: duration,
          success: false,
          errorMessage: error.message,
          newValues: {
            ...this.extractRelevantData(request.body),
            // Agregar información de la empresa si está disponible
            companyInfo: user?.company
              ? {
                  id: user.company.id,
                  name: user.company.name,
                  taxId: user.company.taxId,
                  tenantId: user.company.tenantId,
                  tenantType: user.company.tenantType,
                }
              : null,
          },
        });

        throw error;
      }),
    );
  }

  private getActionAndResource(request: Request): {
    action: AuditAction;
    resource: AuditResource;
  } {
    const method = request.method;
    const path = request.path;

    // Mapear métodos HTTP a acciones
    const actionMap: Record<string, AuditAction> = {
      POST: AuditAction.CREATE,
      PUT: AuditAction.UPDATE,
      PATCH: AuditAction.UPDATE,
      DELETE: AuditAction.DELETE,
      GET: AuditAction.READ,
    };

    // Mapear rutas a recursos
    const resourceMap: Record<string, AuditResource> = {
      '/users': AuditResource.USER,
      '/companies': AuditResource.COMPANY,
      '/invoices': AuditResource.INVOICE,
      '/purchases': AuditResource.PURCHASE,
      '/inventory': AuditResource.INVENTORY,
      '/movements': AuditResource.MOVEMENT,
      '/warehouses': AuditResource.WAREHOUSE,
      '/reports': AuditResource.REPORT,
      '/fixed-assets': AuditResource.FIXED_ASSET,
      '/auth': AuditResource.AUTH,
    };

    // Detectar recursos especiales
    if (path.includes('/auth/login')) {
      return { action: AuditAction.LOGIN, resource: AuditResource.AUTH };
    }

    if (path.includes('/auth/logout')) {
      return { action: AuditAction.LOGOUT, resource: AuditResource.AUTH };
    }

    if (path.includes('/movements/transfer')) {
      return { action: AuditAction.TRANSFER, resource: AuditResource.MOVEMENT };
    }

    if (path.includes('/movements/entry')) {
      return { action: AuditAction.ENTRY, resource: AuditResource.MOVEMENT };
    }

    if (path.includes('/movements/exit')) {
      return { action: AuditAction.EXIT, resource: AuditResource.MOVEMENT };
    }

    if (path.includes('/movements/return')) {
      return { action: AuditAction.RETURN, resource: AuditResource.MOVEMENT };
    }

    // Mapeo general
    const action = actionMap[method] || AuditAction.READ;
    let resource = AuditResource.SYSTEM;

    for (const [route, res] of Object.entries(resourceMap)) {
      if (path.includes(route)) {
        resource = res;
        break;
      }
    }

    return { action, resource };
  }

  private getClientIp(request: Request): string {
    return (
      (request.headers['x-forwarded-for'] as string) ||
      (request.headers['x-real-ip'] as string) ||
      request.connection.remoteAddress ||
      request.socket.remoteAddress ||
      'unknown'
    );
  }

  private extractRelevantData(body: any): Record<string, any> {
    if (!body || typeof body !== 'object') return {};

    // Extraer solo campos relevantes para auditoría
    const relevantFields = [
      'id',
      'name',
      'email',
      'status',
      'amount',
      'quantity',
      'productCode',
      'productName',
      'customerName',
      'invoiceNumber',
      'movementType',
      'reason',
      'sourceWarehouse',
      'destinationWarehouse',
    ];

    const extracted: Record<string, any> = {};
    for (const field of relevantFields) {
      if (body[field] !== undefined) {
        extracted[field] = body[field];
      }
    }

    return extracted;
  }
}
