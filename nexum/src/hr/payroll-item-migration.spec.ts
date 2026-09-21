import * as dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config();

jest.setTimeout(60000);

describe('PayrollItem vacation_provision persistence (integration)', () => {
  let client: Client;
  let ids: { companyId?: number; employeeId?: string; payrollId?: number; itemId?: number } = {};

  beforeAll(async () => {
    client = new Client({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  afterEach(async () => {
    if (ids.itemId) {
      await client.query('DELETE FROM "payroll_items" WHERE id = $1', [ids.itemId]);
    }
    if (ids.payrollId) {
      await client.query('DELETE FROM "payrolls" WHERE id = $1', [ids.payrollId]);
    }
    if (ids.employeeId) {
      await client.query('DELETE FROM "employees" WHERE id = $1', [ids.employeeId]);
    }
    if (ids.companyId) {
      await client.query('DELETE FROM "companies" WHERE id = $1', [ids.companyId]);
    }
    ids = {};
  });

  it('persists vacation_provision and reads it back as a number', async () => {
    const suffix = Math.random().toString(36).slice(2, 10);

    const company = await client.query(
      'INSERT INTO "companies" (name, tax_id) VALUES ($1, $2) RETURNING id',
      [`Test Co ${suffix}`, `TEST-${suffix}`],
    );
    ids.companyId = company.rows[0].id;

    const employee = await client.query(
      `INSERT INTO "employees" ("companyId", "firstName", "lastName", "employeeCode", salary)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [ids.companyId, 'Juan', 'Pérez', `EMP-${suffix}`, 5000],
    );
    ids.employeeId = employee.rows[0].id;

    const payroll = await client.query(
      `INSERT INTO "payrolls" (company_id, period, "startDate", "endDate", "processedBy",
         "totalGross", "totalDeductions", "totalNet", status, concept)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [ids.companyId, `2026-${suffix}`, '2026-07-01', '2026-07-31', 'test', 0, 0, 0, 'draft', 'salario'],
    );
    ids.payrollId = payroll.rows[0].id;

    const item = await client.query(
      `INSERT INTO "payroll_items" ("companyId", "payrollId", "employeeId", "employeeName",
         "employeeDocument", position, "baseSalary", vacation_provision)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, vacation_provision`,
      [ids.companyId, ids.payrollId, ids.employeeId, 'Juan Pérez', '12345678901', 'Contador', 5000, 123.45],
    );
    ids.itemId = item.rows[0].id;

    const result = await client.query(
      'SELECT vacation_provision FROM "payroll_items" WHERE id = $1',
      [ids.itemId],
    );

    expect(result.rows).toHaveLength(1);
    expect(parseFloat(result.rows[0].vacation_provision)).toBeCloseTo(123.45, 2);
  });

  it('applies the default 0 when vacation_provision is not provided', async () => {
    const suffix = Math.random().toString(36).slice(2, 10);

    const company = await client.query(
      'INSERT INTO "companies" (name, tax_id) VALUES ($1, $2) RETURNING id',
      [`Test Co ${suffix}`, `TEST-${suffix}`],
    );
    ids.companyId = company.rows[0].id;

    const employee = await client.query(
      `INSERT INTO "employees" ("companyId", "firstName", "lastName", "employeeCode", salary)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [ids.companyId, 'Ana', 'García', `EMP-${suffix}`, 4000],
    );
    ids.employeeId = employee.rows[0].id;

    const payroll = await client.query(
      `INSERT INTO "payrolls" (company_id, period, "startDate", "endDate", "processedBy",
         "totalGross", "totalDeductions", "totalNet", status, concept)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [ids.companyId, `2026-${suffix}`, '2026-07-01', '2026-07-31', 'test', 0, 0, 0, 'draft', 'salario'],
    );
    ids.payrollId = payroll.rows[0].id;

    const item = await client.query(
      `INSERT INTO "payroll_items" ("companyId", "payrollId", "employeeId", "employeeName",
         "employeeDocument", position, "baseSalary")
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, vacation_provision`,
      [ids.companyId, ids.payrollId, ids.employeeId, 'Ana García', '12345678902', 'Auxiliar', 4000],
    );
    ids.itemId = item.rows[0].id;

    expect(parseFloat(item.rows[0].vacation_provision)).toBe(0);

    const result = await client.query(
      'SELECT vacation_provision FROM "payroll_items" WHERE id = $1',
      [ids.itemId],
    );
    expect(parseFloat(result.rows[0].vacation_provision)).toBe(0);
  });
});
