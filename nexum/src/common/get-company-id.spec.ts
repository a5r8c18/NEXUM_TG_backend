import { ForbiddenException } from '@nestjs/common';
import { getCompanyId } from './get-company-id';

function req(overrides: {
  user?: any;
  headers?: Record<string, string>;
  query?: Record<string, string>;
}) {
  return {
    user: overrides.user,
    headers: overrides.headers ?? {},
    query: overrides.query ?? {},
  } as any;
}

describe('getCompanyId — aislamiento de empresas', () => {
  it('rechaza peticiones sin usuario autenticado', () => {
    expect(() => getCompanyId(req({}))).toThrow(ForbiddenException);
  });

  it('un rol normal usa el companyId de su JWT', () => {
    expect(
      getCompanyId(req({ user: { role: 'user', companyId: 7 } })),
    ).toBe(7);
  });

  it('rechaza un X-Company-ID que apunte a otra empresa', () => {
    expect(() =>
      getCompanyId(
        req({
          user: { role: 'user', companyId: 7 },
          headers: { 'x-company-id': '3' },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('rechaza un ?companyId= que apunte a otra empresa', () => {
    expect(() =>
      getCompanyId(
        req({
          user: { role: 'admin', companyId: 7 },
          query: { companyId: '3' },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('acepta el header cuando coincide con la empresa del JWT', () => {
    expect(
      getCompanyId(
        req({
          user: { role: 'user', companyId: 7 },
          headers: { 'x-company-id': '7' },
        }),
      ),
    ).toBe(7);
  });

  it('un usuario multiempresa puede operar sobre una empresa de su lista JWT', () => {
    expect(
      getCompanyId(
        req({
          user: { role: 'user', companyId: 7, companyIds: [7, 12] },
          headers: { 'x-company-id': '12' },
        }),
      ),
    ).toBe(12);
  });

  it('un usuario multiempresa no puede operar sobre una empresa fuera de su lista', () => {
    expect(() =>
      getCompanyId(
        req({
          user: { role: 'user', companyId: 7, companyIds: [7, 12] },
          headers: { 'x-company-id': '3' },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('superadmin puede operar sobre otra empresa vía header', () => {
    expect(
      getCompanyId(
        req({
          user: { role: 'superadmin', companyId: 1 },
          headers: { 'x-company-id': '9' },
        }),
      ),
    ).toBe(9);
  });

  it('superadmin puede operar sobre otra empresa vía query', () => {
    expect(
      getCompanyId(
        req({
          user: { role: 'superadmin', companyId: 1 },
          query: { companyId: '9' },
        }),
      ),
    ).toBe(9);
  });

  it('rechaza a un rol normal sin empresa asignada', () => {
    expect(() =>
      getCompanyId(req({ user: { role: 'user' } })),
    ).toThrow(ForbiddenException);
  });
});
