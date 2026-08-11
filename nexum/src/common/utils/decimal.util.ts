/**
 * Utilidades de precisión decimal para importes y costos unitarios.
 *
 * El sistema almacena precios y costos con 8 decimales (decimal(18,8) / decimal(20,8))
 * para no perder residuos al calcular el Costo Promedio Ponderado (NCC Res. 235-2005 MFP).
 * Redondear a 2 decimales en pasos intermedios provocaba descuadres al liquidar
 * cuentas por pagar/cobrar en las devoluciones.
 */

/** Decimales de trabajo para costos unitarios e importes. */
export const DECIMAL_SCALE = 8;

/**
 * Tolerancia para considerar dos importes monetarios equivalentes.
 * Por debajo de medio centavo la diferencia es residuo de redondeo, no deuda real.
 */
export const MONETARY_EPSILON = 0.005;

/** Redondea a la escala de trabajo (8 decimales) evitando artefactos de coma flotante. */
export function roundDecimal(value: number, scale: number = DECIMAL_SCALE): number {
  if (!Number.isFinite(value)) return 0;
  const factor = Math.pow(10, scale);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Convierte a número un valor que TypeORM puede devolver como string
 * (las columnas `decimal` de Postgres se leen como string) y lo redondea.
 */
export function toDecimal(value: unknown, scale: number = DECIMAL_SCALE): number {
  const num = typeof value === 'number' ? value : Number(value ?? 0);
  return roundDecimal(Number.isFinite(num) ? num : 0, scale);
}

/** Indica si el saldo restante es despreciable y la cuenta debe considerarse liquidada. */
export function isSettled(balance: number): boolean {
  return Math.abs(balance) < MONETARY_EPSILON;
}
