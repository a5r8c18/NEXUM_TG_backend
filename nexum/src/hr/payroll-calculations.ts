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
 * Contribución Especial a la Seguridad Social del trabajador: 5 % hasta
 * 15 000 CUP y 10 % solo sobre el excedente.
 */
export function calculateSocialSecurity(grossSalary: number): number {
  const brackets = [
    { limit: 15000, rate: 0.05 },
    { limit: Infinity, rate: 0.1 },
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

/**
 * Impuesto sobre los Ingresos Personales para trabajadores asalariados.
 *
 * Escala progresiva según Resolución 310/2020 (Gaceta Oficial Extraordinaria
 * No. 70 de 2020): exento hasta 3 260 CUP, 3 % entre 3 260 y 9 510 CUP,
 * y 5 % por encima de 9 510 CUP.
 */
export function calculateIncomeTaxSalaried(grossSalary: number): number {
  if (grossSalary <= 3260) return 0;
  if (grossSalary <= 9510) {
    return round2((grossSalary - 3260) * 0.03);
  }
  const firstBracket = (9510 - 3260) * 0.03;
  return round2(firstBracket + (grossSalary - 9510) * 0.05);
}

/**
 * Impuesto sobre los Ingresos Personales para trabajadores por cuenta propia.
 *
 * Escala progresiva de 7 tramos según Resolución 271/2024 (Gaceta Oficial
 * No. 78 Ordinaria de 2024): 0 %, 3 %, 5 %, 7.5 %, 10 %, 15 % y 20 %.
 */
export function calculateIncomeTaxTcp(grossSalary: number): number {
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

/** Convierte 'YYYY-MM-DD[...]' a Date local para evaluar el día de la semana. */
function parseLocalDate(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/**
 * Días laborables (lunes a viernes) de solapamiento entre dos rangos de
 * fechas. Los fines de semana no computan porque el salario diario se expresa
 * en días laborables (base de 24 por mes).
 */
export function overlapWorkingDays(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): number {
  const start = new Date(
    Math.max(parseLocalDate(aStart).getTime(), parseLocalDate(bStart).getTime()),
  );
  const end = new Date(
    Math.min(parseLocalDate(aEnd).getTime(), parseLocalDate(bEnd).getTime()),
  );
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0;
  let days = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) days++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/**
 * Licencias que no generan salario ordinario en el período: las no retribuidas
 * y las que se pagan por otro concepto (vacaciones, subsidio y maternidad
 * tienen su propia nómina). La licencia 'paternity' registra la ausencia del
 * padre que asume el cuidado del menor por cesión (Art. 30.1.c DL 56/2021,
 * mod. DL 71/2023): se descuenta aquí y se retribuye en la nómina de
 * maternidad con el padre como beneficiario. Registrar ambas evita pagar dos
 * veces el mismo día.
 */
export const NON_SALARY_LEAVE_TYPES = [
  'unpaid',
  'vacation',
  'sick',
  'maternity',
  'paternity',
] as const;

/** Licencia reducida a lo que necesita el cálculo de días no trabajados. */
export interface LeavePeriod {
  startDate: string;
  endDate: string;
}

/**
 * Días laborables del período que no se remuneran con salario ordinario, ya
 * sea porque la licencia no es retribuida o porque la paga otra nómina por
 * concepto. Una licencia que cubre todo el período consume los 24 días
 * laborables del mes, y el total nunca excede esa base.
 */
export function nonWorkedWorkingDays(
  leaves: LeavePeriod[],
  periodStart: string,
  periodEnd: string,
): number {
  const days = leaves.reduce((sum, leave) => {
    const coversPeriod =
      leave.startDate <= periodStart && leave.endDate >= periodEnd;
    return (
      sum +
      (coversPeriod
        ? WORKING_DAYS_PER_MONTH
        : overlapWorkingDays(
            leave.startDate,
            leave.endDate,
            periodStart,
            periodEnd,
          ))
    );
  }, 0);
  return Math.min(days, WORKING_DAYS_PER_MONTH);
}

/**
 * Tarifa diaria con que se retribuyen las vacaciones (Art. 102 Ley 116): la
 * cuantía es lo acumulado, o sea el importe acumulado entre los días
 * acumulados. Pagar N días debita del fondo exactamente lo que esos N días
 * generaron, así que un cambio de salario entre la acumulación y el disfrute
 * no deja la provisión 492 en déficit ni con excedente.
 *
 * Sin acumulado —primer año o apertura del sistema— se recurre a la tarifa
 * contractual: `salario / 24`.
 */
export function vacationDailyRate(
  balance: { days: number; amount: number } | undefined,
  contractualRate: number,
): number {
  if (!balance || balance.days <= 0 || balance.amount <= 0) {
    return round2(contractualRate);
  }
  return round2(balance.amount / balance.days);
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
 * Salario promedio semanal, base de la prestación económica por maternidad
 * (DL 56/2021, mod. DL 71/2023).
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
 * Prestación económica por maternidad correspondiente a un plazo (Art. 18
 * DL 56/2021). Cada plazo cubre un número determinado de semanas de licencia.
 */
export function calculateMaternityBenefit(
  weeklyAverageSalary: number,
  weeks: number,
): number {
  return round2(weeklyAverageSalary * weeks);
}

/**
 * Prestación social por maternidad: 60 % de la base de cálculo (Art. 30.1
 * DL 56/2021, mod. DL 71/2023).
 *
 * En las variantes a y b la base es la de la madre; en la variante c es el
 * salario promedio mensual del padre o abuelo que asume el cuidado del menor,
 * calculado sobre los doce meses anteriores al nacimiento.
 */
export function calculateSocialBenefit(monthlyBase: number): number {
  return round2(monthlyBase * SOCIAL_BENEFIT_RATE);
}

export { SOCIAL_BENEFIT_RATE, MINIMUM_SUBSIDY, WORKING_DAYS_PER_MONTH };
