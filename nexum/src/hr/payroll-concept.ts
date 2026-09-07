/**
 * Conceptos de nómina reconocidos por el sistema.
 *
 * Cada concepto tiene su propia fuente de datos, su propia fórmula de cálculo y
 * su propio juego de líneas contables, por lo que una nómina pertenece siempre a
 * un único concepto y a un único período.
 */
export type PayrollConcept =
  | 'salario'
  | 'vacaciones'
  | 'subsidio'
  | 'maternidad'
  | 'paternidad'
  | 'libre';

export const PAYROLL_CONCEPTS: PayrollConcept[] = [
  'salario',
  'vacaciones',
  'subsidio',
  'maternidad',
  'paternidad',
  'libre',
];

export const PAYROLL_CONCEPT_LABELS: Record<PayrollConcept, string> = {
  salario: 'Salario',
  vacaciones: 'Vacaciones',
  subsidio: 'Subsidio por enfermedad o accidente',
  maternidad: 'Licencia de maternidad',
  paternidad: 'Licencia de paternidad',
  libre: 'Concepto libre',
};

/**
 * Categoría ocupacional del trabajador. Determina la subcuenta analítica de
 * Nóminas por Pagar (455-00X0) donde se acredita el neto, según el Nomenclador
 * Cubano 2016.
 */
export type OccupationalCategory = '0010' | '0020' | '0030' | '0040' | '0050';

export const OCCUPATIONAL_CATEGORY_LABELS: Record<OccupationalCategory, string> = {
  '0010': 'Dirigentes',
  '0020': 'Técnicos',
  '0030': 'Trabajadores de Servicios',
  '0040': 'Obreros',
  '0050': 'Otros Trabajadores',
};

/** Sector de empleo. Decide quién paga las prestaciones por maternidad. */
export type EmploymentSector = 'state' | 'non_state';

/**
 * Modalidad de vínculo laboral. Gobierna los límites de duración del subsidio
 * (Art. 43 para indeterminado, Art. 45 para determinado / obra / a domicilio).
 */
export type ContractTerm =
  | 'indefinite'
  | 'fixed_term'
  | 'work'
  | 'home_based';

/** Origen de la enfermedad o lesión que causa el subsidio (Art. 40). */
export type IncapacityOrigin = 'common' | 'occupational';

/** Variante de prestación social por maternidad (Art. 30.1). */
export type SocialBenefitVariant = 'a' | 'b' | 'c';

// ── Parámetros legales (Cuba) ──

/** Días hábiles promedio del mes usados para el salario diario del subsidio. */
export const WORKING_DAYS_PER_MONTH = 24;

/** Salario mínimo vigente en CUP. */
export const MINIMUM_WAGE = 3210;

/** Cuantía mínima del subsidio: 50 % del salario mínimo vigente (Art. 41). */
export const MINIMUM_SUBSIDY = MINIMUM_WAGE * 0.5;

/** Retención mensual para el pago de subsidios de seguridad social (Art. 46). */
export const SUBSIDY_RETENTION_RATE = 0.015;

/** Cuota patronal de Seguridad Social. */
export const EMPLOYER_SOCIAL_SECURITY_RATE = 0.145;

/** Semanas del año usadas para el salario promedio semanal (Art. 16). */
export const WEEKS_PER_YEAR = 52;

/** Cuantía de la prestación social por maternidad (Art. 30.1). */
export const SOCIAL_BENEFIT_RATE = 0.6;

/**
 * Días de carencia antes de iniciar el pago del subsidio (Art. 42):
 * a partir del cuarto día si la incapacidad es de origen común y el trabajador
 * no está hospitalizado; desde el primer día en cualquier otro caso.
 */
export function subsidyWaitingDays(
  origin: IncapacityOrigin,
  hospitalized: boolean,
): number {
  return origin === 'common' && !hospitalized ? 3 : 0;
}

/**
 * Porcentaje del salario promedio que corresponde al subsidio diario (Art. 40).
 *
 *                        | Origen común | Prof. / accidente de trabajo
 *   Hospitalizado        |     50 %     |            70 %
 *   No hospitalizado     |     60 %     |            80 %
 */
export function subsidyRate(
  origin: IncapacityOrigin,
  hospitalized: boolean,
): number {
  if (origin === 'occupational') {
    return hospitalized ? 0.7 : 0.8;
  }
  return hospitalized ? 0.5 : 0.6;
}
