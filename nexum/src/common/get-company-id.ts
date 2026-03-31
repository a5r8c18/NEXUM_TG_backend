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

  // Superadmin puede elegir empresa via query/body
  if (user.role === 'superadmin') {
    const override =
      req.query?.companyId || req.body?.companyId;
    if (override) {
      return parseInt(override as string, 10);
    }
  }

  // Para todos los demás (y superadmin sin override): usar JWT companyId
  if (!user.companyId) {
    throw new ForbiddenException('No tiene una empresa asignada');
  }

  return typeof user.companyId === 'number'
    ? user.companyId
    : parseInt(user.companyId as string, 10);
}
