import { ForbiddenException } from '@nestjs/common';

/**
 * Extrae companyId de forma segura del JWT del usuario.
 * - Superadmin puede elegir empresa vía header X-Company-ID o ?companyId=
 * - Otros roles SIEMPRE usan su companyId del token JWT; un override
 *   que apunte a otra empresa se rechaza.
 */
export function getCompanyId(req: any): number {
  const user = req.user;
  if (!user) {
    throw new ForbiddenException('Usuario no autenticado');
  }

  const jwtCompanyId = user.companyId
    ? typeof user.companyId === 'number'
      ? user.companyId
      : parseInt(user.companyId as string, 10)
    : undefined;

  if (user.role === 'superadmin') {
    const override =
      req.headers?.['x-company-id'] ?? req.query?.companyId;
    if (override) {
      const parsed = parseInt(override as string, 10);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
    if (jwtCompanyId !== undefined && !Number.isNaN(jwtCompanyId)) {
      return jwtCompanyId;
    }
    throw new ForbiddenException('No tiene una empresa asignada');
  }

  if (jwtCompanyId === undefined || Number.isNaN(jwtCompanyId)) {
    throw new ForbiddenException('No tiene una empresa asignada');
  }

  const override =
    req.headers?.['x-company-id'] ?? req.query?.companyId;
  if (override) {
    const parsed = parseInt(override as string, 10);
    if (!Number.isNaN(parsed)) {
      const allowed = new Set<number>([
        jwtCompanyId,
        ...(Array.isArray(user.companyIds) ? user.companyIds : []),
      ]);
      if (!allowed.has(parsed)) {
        throw new ForbiddenException('No tiene acceso a la empresa indicada');
      }
      return parsed;
    }
  }

  return jwtCompanyId;
}
