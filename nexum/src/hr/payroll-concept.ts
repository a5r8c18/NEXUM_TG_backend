/**
 * Conceptos de nómina reconocidos por el sistema.
 *
 * Cada concepto tiene su propia fuente de datos, su propia fórmula de cálculo y
 * su propio juego de líneas contables, por lo que una nómina pertenece siempre a
 * un único concepto y a un único período.
 */
/**
 * No existe licencia de paternidad retribuida autónoma: el padre accede a la
 * prestación social por cesión de la madre (Art. 30.1.c DL 56/2021, mod. DL
 * 71/2023), que se paga en la nómina de maternidad con el padre como
 * beneficiario. Su ausencia se registra con el tipo de licencia 'paternity'.
 */
export type PayrollConcept =
  | 'salario'
  | 'vacaciones'
  | 'subsidio'
  | 'maternidad'
  | 'liquidacion'
  | 'horas_extras'
  | 'nocturnidad'
  | 'feriado'
  | 'libre';

export const PAYROLL_CONCEPTS: PayrollConcept[] = [
  'salario',
  'vacaciones',
  'subsidio',
  'maternidad',
  'liquidacion',
  'horas_extras',
  'nocturnidad',
  'feriado',
  'libre',
];

export const PAYROLL_CONCEPT_LABELS: Record<PayrollConcept, string> = {
  salario: 'Salario',
  vacaciones: 'Vacaciones',
  subsidio: 'Subsidio por enfermedad o accidente',
  maternidad: 'Licencia de maternidad',
  liquidacion: 'Liquidación por terminación',
  horas_extras: 'Horas extras',
  nocturnidad: 'Nocturnidad',
  feriado: 'Días feriados',
  libre: 'Concepto libre',
};

/**
 * Pagos adicionales por tiempo trabajado: horas extra (Art. 122 Ley 116),
 * nocturnidad (Res. 17/2025 MTSS) y feriado trabajado (Art. 111.c). Se
 * generan para varios trabajadores a la vez, son remuneración gravable,
 * cargan a gasto y acumulan vacaciones sobre el importe percibido.
 */
export const TIME_SUPPLEMENT_CONCEPTS: PayrollConcept[] = [
  'horas_extras',
  'nocturnidad',
  'feriado',
];

/** Conceptos que paga la entidad con cargo a gasto del período. */
export const EXPENSE_CONCEPTS: PayrollConcept[] = [
  'salario',
  'libre',
  ...TIME_SUPPLEMENT_CONCEPTS,
];

/**
 * Conceptos que se generan trabajador por trabajador: cada evento (unas
 * vacaciones, un certificado, una baja) es su propia nómina, así que varios
 * trabajadores pueden tenerla en el mismo período.
 */
export const SINGLE_WORKER_CONCEPTS: PayrollConcept[] = [
  'vacaciones',
  'subsidio',
  'maternidad',
  'liquidacion',
];

/** Bandas horarias del pago adicional por nocturnidad (Res. 17/2025 MTSS). */
export type NightShiftBand = 'evening' | 'night';

/** Rango legal de la tarifa en CUP por hora y valor inicial de cada banda. */
export const NIGHT_SHIFT_BANDS: Record<
  NightShiftBand,
  { label: string; min: number; max: number; default: number }
> = {
  evening: { label: '7:00 pm a 11:00 pm', min: 0.6, max: 1.2, default: 0.6 },
  night: { label: '11:00 pm a 7:00 am', min: 1.15, max: 2.3, default: 1.15 },
};

/**
 * Conceptos que consumen el fondo de vacaciones (492): el disfrute y la
 * liquidación del Art. 52. Todo lo demás acumula o es ajeno.
 */
export const VACATION_FUND_CONCEPTS: PayrollConcept[] = [
  'vacaciones',
  'liquidacion',
];

/**
 * Conceptos cuya retribución integra la base imponible mensual del Impuesto
 * sobre Ingresos Personales (Res. 41/2023: "el total de las remuneraciones…
 * por todos los conceptos de pago; incluyendo el pago por descanso
 * retribuido") y de la Contribución Especial a la Seguridad Social
 * (Res. 41/2023). El subsidio y la maternidad son prestaciones sociales, no
 * remuneraciones: están exentas y no entran en la base.
 */
export const TAXABLE_INCOME_CONCEPTS: PayrollConcept[] = [
  'salario',
  'vacaciones',
  'liquidacion',
  'libre',
  ...TIME_SUPPLEMENT_CONCEPTS,
];

/**
 * Conceptos sobre los que la entidad paga aporte patronal (14 %) e
 * impuesto por la utilización de la fuerza de trabajo (5 %). Las vacaciones,
 * la liquidación, el subsidio y la maternidad no generan estos tributos
 * patronales.
 */
export const EMPLOYER_TAX_CONCEPTS: PayrollConcept[] = [
  'salario',
  'libre',
  ...TIME_SUPPLEMENT_CONCEPTS,
];

/**
 * Categoría ocupacional del trabajador (Nomenclador 2016). Es un dato
 * estadístico del Modelo SC-4-06: la subcuenta de Nóminas por Pagar donde se
 * acredita el neto no se deriva de ella, sino de la que la empresa haya
 * creado y asignado en la ficha (`payableSubaccount`).
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
 * (Art. 43 para indeterminado, Art. 45 para determinado).
 */
export type ContractTerm = 'determinate' | 'indeterminate';

/** Origen de la enfermedad o lesión que causa el subsidio (Art. 40). */
export type IncapacityOrigin = 'common' | 'occupational';

/**
 * Variante de prestación social por maternidad (Art. 30.1 DL 56/2021, mod. DL
 * 71/2023): a) la madre cuida al menor, b) la madre se reincorpora y simultanea
 * salario con prestación, c) cedida al padre o abuelo que asume el cuidado.
 */
export type SocialBenefitVariant = 'a' | 'b' | 'c';

// ── Parámetros legales (Cuba) ──

/** Días hábiles promedio del mes usados para el salario diario del subsidio. */
export const WORKING_DAYS_PER_MONTH = 24;

/**
 * Jornada legal mensual promedio (44 h semanales): base de la tarifa horaria
 * (salario / 190,6) y tope del tiempo remunerable del mes.
 */
export const MONTHLY_LEGAL_HOURS = 190.6;

/**
 * Horas que cubre un día laborable: 190,6 / 24 = 7,9416. Con esta
 * equivalencia la tarifa diaria (horaria × 7,9416) coincide con salario / 24.
 */
export const HOURS_PER_WORKDAY = MONTHLY_LEGAL_HOURS / WORKING_DAYS_PER_MONTH;

/**
 * Tasa de acumulación de vacaciones anuales pagadas (Art. 102 Ley 116): se
 * multiplican por 9,09 % los días efectivamente laborados y los salarios
 * percibidos. Equivale a 2,18 días por cada 24 laborables, o sea un mes de
 * descanso por cada once de trabajo.
 */
export const VACATION_ACCRUAL_RATE = 0.0909;

/** Períodos en días naturales en que puede otorgarse el descanso (Art. 105). */
export const LEGAL_VACATION_PERIODS: readonly number[] = [30, 20, 15, 10, 7];

/** Cuota sindical: 1 % del devengado, retenido al trabajador afiliado. */
export const UNION_DUES_RATE = 0.01;

/** Salario mínimo vigente en CUP. */
export const MINIMUM_WAGE = 3210;

/** Cuantía mínima del subsidio: 50 % del salario mínimo vigente (Art. 41). */
export const MINIMUM_SUBSIDY = MINIMUM_WAGE * 0.5;

/**
 * Parte del aporte patronal destinada a las prestaciones de seguridad social a
 * corto plazo (Art. 46). No se entera al presupuesto: se acumula en la
 * provisión 500 para pagar subsidios, maternidad, etc.
 */
export const SUBSIDY_RETENTION_RATE = 0.015;

/**
 * Parte del aporte patronal que se entera al Presupuesto del Estado (cuenta
 * 440 Obligaciones con el Presupuesto del Estado).
 */
export const EMPLOYER_SOCIAL_SECURITY_BUDGET_RATE = 0.125;

/**
 * Contribución a la Seguridad Social a cargo del empleador: 14 % de la nómina,
 * de los cuales 12,5 % van al presupuesto y 1,5 % a la provisión para
 * prestaciones a corto plazo.
 */
export const EMPLOYER_SOCIAL_SECURITY_RATE =
  EMPLOYER_SOCIAL_SECURITY_BUDGET_RATE + SUBSIDY_RETENTION_RATE;

/**
 * Impuesto por la Utilización de la Fuerza de Trabajo: 5 % del total de las
 * remuneraciones pagadas. Es un tributo a cargo de la entidad, no una
 * retención al trabajador.
 */
export const LABOR_FORCE_TAX_RATE = 0.05;

/** Semanas del año usadas para el salario promedio semanal (Art. 16 DL 56/2021). */
export const WEEKS_PER_YEAR = 52;

/** Cuantía de la prestación social por maternidad (Art. 30.1 DL 56/2021). */
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
