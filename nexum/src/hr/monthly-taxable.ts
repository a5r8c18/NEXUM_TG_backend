import { Repository } from 'typeorm';
import { Payroll } from '../entities/payroll.entity';
import { PayrollItem } from '../entities/payroll-item.entity';
import { TAXABLE_INCOME_CONCEPTS } from './payroll-concept';
import {
  calculateIncomeTaxSalaried,
  calculateSocialSecurity,
  round2,
} from './payroll-calculations';

/** Devengo y retenciones ya registradas del trabajador en el período. */
export interface MonthlyTaxableTotals {
  gross: number;
  socialSecurity: number;
  taxWithheld: number;
}

/**
 * Remuneraciones gravables y retenciones ya registradas en el período,
 * agrupadas por trabajador.
 *
 * El IIP (Res. 310/2020) y la CESS (Res. 41/2023) se calculan sobre el total
 * devengado del mes "por todos los conceptos de pago", no por cada nómina:
 * al generar una nómina se retiene solo la diferencia entre el impuesto del
 * acumulado mensual y lo ya retenido en las demás nóminas del período. Las
 * nóminas canceladas no cuentan; las en borrador sí, porque expresan la
 * intención de pago del mes.
 */
export async function monthlyTaxableTotals(
  payrollItemRepo: Repository<PayrollItem>,
  companyId: number,
  period: string,
): Promise<Map<string, MonthlyTaxableTotals>> {
  const rows = await payrollItemRepo
    .createQueryBuilder('item')
    .innerJoin(Payroll, 'p', 'p.id = item."payrollId"')
    .select('item."employeeId"', 'employeeId')
    .addSelect('COALESCE(SUM(item."grossSalary"), 0)', 'gross')
    .addSelect('COALESCE(SUM(item."socialSecurity"), 0)', 'socialSecurity')
    .addSelect('COALESCE(SUM(item."taxWithholding"), 0)', 'taxWithheld')
    .where('item."companyId" = :companyId', { companyId })
    .andWhere('p."period" = :period', { period })
    .andWhere('p."concept" IN (:...concepts)', {
      concepts: TAXABLE_INCOME_CONCEPTS,
    })
    .andWhere('p."status" <> :cancelled', { cancelled: 'cancelled' })
    .groupBy('item."employeeId"')
    .getRawMany<{
      employeeId: string;
      gross: string;
      socialSecurity: string;
      taxWithheld: string;
    }>();

  const totals = new Map<string, MonthlyTaxableTotals>();
  for (const row of rows) {
    totals.set(row.employeeId, {
      gross: Number(row.gross),
      socialSecurity: Number(row.socialSecurity),
      taxWithheld: Number(row.taxWithheld),
    });
  }
  return totals;
}

/**
 * CESS e IIP de una nueva línea del período: la diferencia entre lo que
 * corresponde al acumulado mensual y lo ya retenido en las nóminas anteriores.
 * Puede salir negativo si una nómina del período se editó a la baja: la
 * retención negativa devuelve al trabajador lo retenido de más en el mes.
 */
export function incrementalTaxes(
  prior: MonthlyTaxableTotals | undefined,
  gross: number,
): { socialSecurity: number; taxWithholding: number } {
  const base = (prior?.gross || 0) + gross;
  return {
    socialSecurity: round2(
      calculateSocialSecurity(base) - (prior?.socialSecurity || 0),
    ),
    taxWithholding: round2(
      calculateIncomeTaxSalaried(base) - (prior?.taxWithheld || 0),
    ),
  };
}
