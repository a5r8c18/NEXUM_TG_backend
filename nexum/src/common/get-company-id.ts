import { ForbiddenException } from '@nestjs/common';

/**
 * Extrae companyId de forma segura del JWT del usuario.
 * - Superadmin puede pasar ?companyId= para acceder a cualquier empresa
 * - Otros roles SIEMPRE usan su companyId del token JWT
 */
export function getCompanyId(req: any): number {
  const user = req.user;
  if (!user) {
    throw new ForbiddenException('Usuario no autenticado');
  }

  // Prioridad: header X-Company-ID > query param > JWT companyId
  const headerCompanyId = req.headers?.['x-company-id'];
  if (headerCompanyId) {
    return parseInt(headerCompanyId as string, 10);
  }

  // Superadmin puede elegir empresa via query param
  if (user.role === 'superadmin') {
    const override = req.query?.companyId;
    if (override) {
      return parseInt(override as string, 10);
    }
  }

  // Fallback: usar JWT companyId
  if (!user.companyId) {
    throw new ForbiddenException('No tiene una empresa asignada');
  }

  return typeof user.companyId === 'number'
    ? user.companyId
    : parseInt(user.companyId as string, 10);
}
