/**
 * Fórmulas de cálculo de nómina según la legislación laboral cubana.
 *
 * Se implementan como funciones puras para poder verificarlas contra los
 * supuestos de cada artículo sin depender de la base de datos.
 */
import {
  IncapacityOrigin,
  MINIMUM_SUBSIDY,
  SOCIAL_BENEFIT_RATE,
  WEEKS_PER_YEAR,
  WORKING_DAYS_PER_MONTH,
  subsidyRate,
  subsidyWaitingDays,
} from './payroll-concept';

/** Redondea a dos decimales. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Redondea a cuatro decimales, para las tasas almacenadas. */
export function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * Contribución Especial a la Seguridad Social del trabajador: 5 % hasta 150 000
 * CUP y 10 % por encima de esa cifra.
 */
export function calculateSocialSecurity(grossSalary: number): number {
  const rate = grossSalary > 150000 ? 0.1 : 0.05;
  return round2(grossSalary * rate);
}

/**
 * Impuesto sobre los Ingresos Personales. Escala progresiva por tramos: cada
 * porcentaje se aplica solo a la porción del salario comprendida en su tramo.
 */
export function calculateIncomeTax(grossSalary: number): number {
  const brackets = [
    { limit: 3260, rate: 0 },
    { limit: 9510, rate: 0.03 },
    { limit: 15000, rate: 0.05 },
    { limit: 20000, rate: 0.075 },
    { limit: 25000, rate: 0.1 },
    { limit: 30000, rate: 0.15 },
    { limit: Infinity, rate: 0.2 },
  ];

  let tax = 0;
  let previousLimit = 0;
  for (const bracket of brackets) {
    if (grossSalary <= previousLimit) break;
    const upper = bracket.limit === Infinity ? grossSalary : bracket.limit;
    const taxableInBracket = Math.min(grossSalary, upper) - previousLimit;
    if (taxableInBracket > 0) {
      tax += taxableInBracket * bracket.rate;
    }
    previousLimit = upper;
  }
  return round2(tax);
}

/** Días de solapamiento (inclusivos) entre dos rangos de fechas. */
export function overlapDays(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): number {
  const start = new Date(
    Math.max(new Date(aStart).getTime(), new Date(bStart).getTime()),
  );
  const end = new Date(
    Math.min(new Date(aEnd).getTime(), new Date(bEnd).getTime()),
  );
  const ms = end.getTime() - start.getTime();
  if (isNaN(ms) || ms < 0) return 0;
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
}

// ── Subsidio por enfermedad o accidente (Art. 39-46) ──

export interface SubsidyInput {
  /** Salario promedio mensual del año inmediato anterior (Art. 39). */
  averageMonthlySalary: number;
  /** Días naturales de incapacidad comprendidos en el período que se liquida. */
  incapacityDays: number;
  /** Días de descanso semanal dentro de ese rango, que se excluyen (Art. 40). */
  restDays: number;
  origin: IncapacityOrigin;
  hospitalized: boolean;
  /**
   * Días de carencia ya consumidos en liquidaciones anteriores de la misma
   * incapacidad. Evita descontar de nuevo los tres primeros días cuando la
   * licencia abarca varios períodos de nómina.
   */
  waitingDaysAlreadyApplied?: number;
}

export interface SubsidyResult {
  /** Días efectivamente subsidiados. */
  paidDays: number;
  /** Días descontados por carencia en esta liquidación (Art. 42). */
  waitingDaysApplied: number;
  /** Salario diario promedio: promedio mensual entre 24 días hábiles. */
  dailyRate: number;
  /** Porcentaje aplicado según origen y hospitalización (Art. 40). */
  rate: number;
  /** Importe calculado antes de aplicar el mínimo legal. */
  rawAmount: number;
  /** Importe final del subsidio. */
  amount: number;
  /** Si se elevó el importe hasta la cuantía mínima del artículo 41. */
  minimumApplied: boolean;
}

/**
 * Calcula el subsidio por enfermedad o accidente.
 *
 * El salario diario se obtiene dividiendo el promedio mensual entre 24 días
 * hábiles. Se excluyen los días de descanso semanal y los días de carencia que
 * correspondan, y el resultado nunca baja de la cuantía mínima del artículo 41.
 */
export function calculateSubsidy(input: SubsidyInput): SubsidyResult {
  const {
    averageMonthlySalary,
    incapacityDays,
    restDays,
    origin,
    hospitalized,
    waitingDaysAlreadyApplied = 0,
  } = input;

  const totalWaitingDays = subsidyWaitingDays(origin, hospitalized);
  const waitingDaysApplied = Math.max(
    0,
    Math.min(totalWaitingDays - waitingDaysAlreadyApplied, incapacityDays),
  );

  const paidDays = Math.max(
    0,
    incapacityDays - restDays - waitingDaysApplied,
  );
  const dailyRate = round2(averageMonthlySalary / WORKING_DAYS_PER_MONTH);
  const rate = subsidyRate(origin, hospitalized);
  const rawAmount = round2(paidDays * dailyRate * rate);

  // El mínimo del artículo 41 protege la cuantía del subsidio, pero no puede
  // generar un pago cuando no hay ningún día subsidiable.
  const minimumApplied = paidDays > 0 && rawAmount < MINIMUM_SUBSIDY;
  const amount = minimumApplied ? round2(MINIMUM_SUBSIDY) : rawAmount;

  return {
    paidDays,
    waitingDaysApplied,
    dailyRate,
    rate,
    rawAmount,
    amount,
    minimumApplied,
  };
}

/**
 * Límite de duración del subsidio en días naturales (Art. 43): seis meses
 * consecutivos, prorrogables a seis meses más.
 */
export const SUBSIDY_LIMIT_DAYS = 180;
export const SUBSIDY_EXTENDED_LIMIT_DAYS = 360;

export type SubsidyLimitWarning =
  | { level: 'none' }
  | { level: 'limit'; accumulatedDays: number; message: string }
  | { level: 'extended'; accumulatedDays: number; message: string };

/**
 * Evalúa si la incapacidad acumulada supera los límites del artículo 43. Solo
 * produce advertencias: la decisión de continuar el pago queda en el usuario.
 */
export function evaluateSubsidyLimit(
  accumulatedDays: number,
): SubsidyLimitWarning {
  if (accumulatedDays > SUBSIDY_EXTENDED_LIMIT_DAYS) {
    return {
      level: 'extended',
      accumulatedDays,
      message:
        `La incapacidad acumulada (${accumulatedDays} días) supera los doce meses ` +
        'del artículo 43. Se requiere dictamen de la Comisión de Peritaje Médico Laboral.',
    };
  }
  if (accumulatedDays > SUBSIDY_LIMIT_DAYS) {
    return {
      level: 'limit',
      accumulatedDays,
      message:
        `La incapacidad acumulada (${accumulatedDays} días) supera los seis meses ` +
        'del artículo 43. Verifique la prórroga antes de continuar el pago.',
    };
  }
  return { level: 'none' };
}

// ── Maternidad (Art. 16-33) ──

export interface MaternityBaseInput {
  /** Salario devengado en los doce meses inmediatos anteriores. */
  salaryInPeriod: number;
  /**
   * Semanas efectivamente laboradas cuando son menos de doce meses (Art. 17).
   * Si no se indica, se usan las 52 semanas del artículo 16.
   */
  weeksWorked?: number;
}

/**
 * Salario promedio semanal, base de la prestación económica por maternidad.
 *
 * Art. 16: el salario de los doce meses anteriores se divide entre 52 semanas.
 * Art. 17: si laboró menos de doce meses, se divide entre las semanas laboradas.
 */
export function calculateWeeklyAverageSalary(
  input: MaternityBaseInput,
): number {
  const { salaryInPeriod, weeksWorked } = input;
  const divisor =
    weeksWorked && weeksWorked > 0 && weeksWorked < WEEKS_PER_YEAR
      ? weeksWorked
      : WEEKS_PER_YEAR;
  return round2(salaryInPeriod / divisor);
}

/**
 * Prestación económica por maternidad correspondiente a un plazo (Art. 18).
 * Cada plazo cubre un número determinado de semanas de licencia.
 */
export function calculateMaternityBenefit(
  weeklyAverageSalary: number,
  weeks: number,
): number {
  return round2(weeklyAverageSalary * weeks);
}

/**
 * Prestación social por maternidad: 60 % de la base de cálculo (Art. 30.1).
 *
 * En las variantes a y b la base es la de la madre; en la variante c es el
 * salario promedio mensual del familiar que asume el cuidado del menor.
 */
export function calculateSocialBenefit(monthlyBase: number): number {
  return round2(monthlyBase * SOCIAL_BENEFIT_RATE);
}

export { SOCIAL_BENEFIT_RATE, MINIMUM_SUBSIDY, WORKING_DAYS_PER_MONTH };
