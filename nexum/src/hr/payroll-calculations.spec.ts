import {
  calculateIncomeTaxSalaried,
  calculateIncomeTaxTcp,
  calculateMaternityBenefit,
  calculateSocialBenefit,
  calculateSocialSecurity,
  calculateSubsidy,
  calculateWeeklyAverageSalary,
  evaluateSubsidyLimit,
  nonWorkedWorkingDays,
  overlapDays,
  overlapWorkingDays,
  round2,
  vacationDailyRate,
} from './payroll-calculations';
import {
  MINIMUM_SUBSIDY,
  VACATION_ACCRUAL_RATE,
  WORKING_DAYS_PER_MONTH,
  subsidyRate,
  subsidyWaitingDays,
} from './payroll-concept';

describe('Contribución a la Seguridad Social', () => {
  it('aplica el 5 % hasta 15 000 CUP', () => {
    expect(calculateSocialSecurity(10000)).toBe(500);
    expect(calculateSocialSecurity(15000)).toBe(750);
  });

  it('aplica el 10 % por encima de 15 000 CUP', () => {
    expect(calculateSocialSecurity(15001)).toBe(750.1);
  });
});

describe('Impuesto sobre los Ingresos Personales — asalariados (Res. 41/2023)', () => {
  it('exime hasta 3 260 CUP', () => {
    expect(calculateIncomeTaxSalaried(0)).toBe(0);
    expect(calculateIncomeTaxSalaried(3260)).toBe(0);
  });

  it('aplica 3 % por encima de 3 260 CUP', () => {
    // 3 261 − 3 260 = 1 CUP × 3 % = 0.03
    expect(calculateIncomeTaxSalaried(3261)).toBe(0.03);
    // (9 510 − 3 260) × 3 % = 6 250 × 0.03 = 187.50
    expect(calculateIncomeTaxSalaried(9510)).toBe(187.5);
  });

  it('aplica 5 % entre 9 510 y 15 000 CUP', () => {
    // 187.50 + (9 511 − 9 510) × 5 % = 187.55
    expect(calculateIncomeTaxSalaried(9511)).toBe(187.55);
    // 187.50 + (15 000 − 9 510) × 5 % = 462
    expect(calculateIncomeTaxSalaried(15000)).toBe(462);
  });

  it('aplica los tramos progresivos por encima de 15 000 CUP', () => {
    // 462 + (20 000 − 15 000) × 7,5 % = 837
    expect(calculateIncomeTaxSalaried(20000)).toBe(837);
    // 837 + (25 000 − 20 000) × 10 % = 1 337
    expect(calculateIncomeTaxSalaried(25000)).toBe(1337);
    // 1 337 + (30 000 − 25 000) × 15 % = 2 087
    expect(calculateIncomeTaxSalaried(30000)).toBe(2087);
    // 2 087 + (50 000 − 30 000) × 20 % = 6 087
    expect(calculateIncomeTaxSalaried(50000)).toBe(6087);
  });
});

describe('Impuesto sobre los Ingresos Personales — TCP (Res. 271/2024)', () => {
  it('exime el primer tramo', () => {
    expect(calculateIncomeTaxTcp(3260)).toBe(0);
  });

  it('aplica la escala de forma progresiva, no plana', () => {
    // 3 260 exentos + 6 250 al 3 % = 187.50
    expect(calculateIncomeTaxTcp(9510)).toBe(187.5);
  });

  it('acumula los tramos intermedios', () => {
    // 187.50 + (15 000 − 9 510) × 5 % = 462
    expect(calculateIncomeTaxTcp(15000)).toBe(462);
  });

  it('aplica el 20 % solo al exceso sobre 30 000', () => {
    // En 30 000: 1 877.50; en 40 000 se suman 10 000 × 20 % = 2 000
    expect(calculateIncomeTaxTcp(30000)).toBe(2087);
    expect(calculateIncomeTaxTcp(40000)).toBe(4087);
  });
});

describe('Subsidio: porcentajes del artículo 40', () => {
  it('paga 50 % en enfermedad común con hospitalización', () => {
    expect(subsidyRate('common', true)).toBe(0.5);
  });

  it('paga 60 % en enfermedad común sin hospitalización', () => {
    expect(subsidyRate('common', false)).toBe(0.6);
  });

  it('paga 70 % en enfermedad profesional con hospitalización', () => {
    expect(subsidyRate('occupational', true)).toBe(0.7);
  });

  it('paga 80 % en enfermedad profesional sin hospitalización', () => {
    expect(subsidyRate('occupational', false)).toBe(0.8);
  });
});

describe('Subsidio: días de carencia del artículo 42', () => {
  it('descuenta tres días en origen común sin hospitalización', () => {
    expect(subsidyWaitingDays('common', false)).toBe(3);
  });

  it('no descuenta días si está hospitalizado', () => {
    expect(subsidyWaitingDays('common', true)).toBe(0);
  });

  it('no descuenta días en accidente de trabajo', () => {
    expect(subsidyWaitingDays('occupational', false)).toBe(0);
    expect(subsidyWaitingDays('occupational', true)).toBe(0);
  });
});

describe('Subsidio: cálculo del importe', () => {
  it('divide el promedio mensual entre 24 días hábiles', () => {
    const result = calculateSubsidy({
      averageMonthlySalary: 9600,
      incapacityDays: 10,
      restDays: 0,
      origin: 'occupational',
      hospitalized: false,
    });
    expect(result.dailyRate).toBe(400);
  });

  it('excluye los días de descanso semanal y los de carencia', () => {
    const result = calculateSubsidy({
      averageMonthlySalary: 24000,
      incapacityDays: 14,
      restDays: 4,
      origin: 'common',
      hospitalized: false,
    });
    // 14 días − 4 de descanso − 3 de carencia = 7 días pagados
    expect(result.paidDays).toBe(7);
    expect(result.waitingDaysApplied).toBe(3);
    // 24000 / 24 = 1000 diario; 7 × 1000 × 60 % = 4200
    expect(result.amount).toBe(4200);
  });

  it('paga desde el primer día en accidente de trabajo', () => {
    const result = calculateSubsidy({
      averageMonthlySalary: 24000,
      incapacityDays: 10,
      restDays: 0,
      origin: 'occupational',
      hospitalized: false,
    });
    expect(result.waitingDaysApplied).toBe(0);
    // 10 × 1000 × 80 % = 8000
    expect(result.amount).toBe(8000);
  });

  it('eleva el importe hasta el mínimo del artículo 41', () => {
    const result = calculateSubsidy({
      averageMonthlySalary: 3210,
      incapacityDays: 5,
      restDays: 0,
      origin: 'common',
      hospitalized: true,
    });
    expect(result.minimumApplied).toBe(true);
    expect(result.amount).toBe(MINIMUM_SUBSIDY);
    expect(result.rawAmount).toBeLessThan(MINIMUM_SUBSIDY);
  });

  it('no genera pago ni mínimo si no hay días subsidiables', () => {
    const result = calculateSubsidy({
      averageMonthlySalary: 24000,
      incapacityDays: 3,
      restDays: 0,
      origin: 'common',
      hospitalized: false,
    });
    expect(result.paidDays).toBe(0);
    expect(result.amount).toBe(0);
    expect(result.minimumApplied).toBe(false);
  });

  it('no vuelve a descontar la carencia ya aplicada en un período anterior', () => {
    const result = calculateSubsidy({
      averageMonthlySalary: 24000,
      incapacityDays: 10,
      restDays: 0,
      origin: 'common',
      hospitalized: false,
      waitingDaysAlreadyApplied: 3,
    });
    expect(result.waitingDaysApplied).toBe(0);
    expect(result.paidDays).toBe(10);
  });
});

describe('Subsidio: límites de duración del artículo 43', () => {
  it('no advierte dentro de los seis meses', () => {
    expect(evaluateSubsidyLimit(180).level).toBe('none');
  });

  it('advierte al superar los seis meses', () => {
    expect(evaluateSubsidyLimit(181).level).toBe('limit');
  });

  it('advierte al superar los doce meses', () => {
    expect(evaluateSubsidyLimit(361).level).toBe('extended');
  });
});

describe('Maternidad: base de cálculo', () => {
  it('divide entre 52 semanas el salario de doce meses (Art. 16)', () => {
    expect(calculateWeeklyAverageSalary({ salaryInPeriod: 104000 })).toBe(2000);
  });

  it('divide entre las semanas laboradas si son menos de doce meses (Art. 17)', () => {
    expect(
      calculateWeeklyAverageSalary({ salaryInPeriod: 26000, weeksWorked: 13 }),
    ).toBe(2000);
  });

  it('ignora un número de semanas mayor que el año', () => {
    expect(
      calculateWeeklyAverageSalary({ salaryInPeriod: 104000, weeksWorked: 60 }),
    ).toBe(2000);
  });
});

describe('Maternidad: prestaciones', () => {
  it('liquida la prestación económica por semanas del plazo (Art. 18)', () => {
    expect(calculateMaternityBenefit(2000, 6)).toBe(12000);
  });

  it('aplica el 60 % en la prestación social (Art. 30.1)', () => {
    expect(calculateSocialBenefit(10000)).toBe(6000);
  });
});

describe('Solapamiento de rangos de fechas', () => {
  it('cuenta los días de forma inclusiva', () => {
    expect(overlapDays('2026-05-01', '2026-05-31', '2026-05-10', '2026-05-14')).toBe(5);
  });

  it('devuelve cero si no hay intersección', () => {
    expect(overlapDays('2026-05-01', '2026-05-05', '2026-06-01', '2026-06-05')).toBe(0);
  });

  it('recorta la licencia al período de la nómina', () => {
    expect(overlapDays('2026-05-01', '2026-05-31', '2026-04-20', '2026-05-04')).toBe(4);
  });
});

describe('Días laborables de solapamiento (vacaciones)', () => {
  // Septiembre 2026: 1 = martes; 5-6 y 12-13 son sábado-domingo.
  it('excluye sábados y domingos del conteo', () => {
    // Licencia de lunes 7 a domingo 13 → 7 días naturales, 5 laborables.
    expect(
      overlapWorkingDays('2026-09-07', '2026-09-13', '2026-09-01', '2026-09-30'),
    ).toBe(5);
  });

  it('cuenta 10 días laborables en dos semanas naturales', () => {
    expect(
      overlapWorkingDays('2026-09-07', '2026-09-18', '2026-09-01', '2026-09-30'),
    ).toBe(10);
  });

  it('devuelve cero si el solapamiento cae solo en fin de semana', () => {
    expect(
      overlapWorkingDays('2026-09-05', '2026-09-06', '2026-09-01', '2026-09-30'),
    ).toBe(0);
  });

  it('recorta la licencia al período contando solo laborables', () => {
    // Licencia vie 4 - mar 8, período desde lun 7 → solapan lun 7 y mar 8 = 2.
    expect(
      overlapWorkingDays('2026-09-04', '2026-09-08', '2026-09-07', '2026-09-30'),
    ).toBe(2);
  });
});

describe('Días no pagados con salario ordinario', () => {
  const start = '2026-09-01';
  const end = '2026-09-30';

  it('no descuenta nada sin licencias', () => {
    expect(nonWorkedWorkingDays([], start, end)).toBe(0);
  });

  it('descuenta los días laborables de una licencia parcial', () => {
    // Lunes 7 a viernes 18 → 10 laborables.
    expect(
      nonWorkedWorkingDays(
        [{ startDate: '2026-09-07', endDate: '2026-09-18' }],
        start,
        end,
      ),
    ).toBe(10);
  });

  it('suma licencias de distinto concepto sin pagar dos veces el día', () => {
    // 5 laborables de vacaciones + 5 de certificado médico = 10 no pagados.
    expect(
      nonWorkedWorkingDays(
        [
          { startDate: '2026-09-07', endDate: '2026-09-11' },
          { startDate: '2026-09-14', endDate: '2026-09-18' },
        ],
        start,
        end,
      ),
    ).toBe(10);
  });

  it('cuenta 24 días cuando la licencia cubre todo el período', () => {
    expect(
      nonWorkedWorkingDays(
        [{ startDate: '2026-08-15', endDate: '2026-10-15' }],
        start,
        end,
      ),
    ).toBe(24);
  });

  it('topa el acumulado de varias licencias en los 24 días del mes', () => {
    expect(
      nonWorkedWorkingDays(
        [
          { startDate: '2026-09-01', endDate: '2026-09-18' },
          { startDate: '2026-09-14', endDate: '2026-09-30' },
        ],
        start,
        end,
      ),
    ).toBe(24);
  });

  it('ignora licencias fuera del período', () => {
    expect(
      nonWorkedWorkingDays(
        [{ startDate: '2026-07-01', endDate: '2026-07-31' }],
        start,
        end,
      ),
    ).toBe(0);
  });
});

describe('Acumulación de vacaciones (Art. 102)', () => {
  it('acumula 2,18 días por un mes completo de 24 laborables', () => {
    expect(
      round2(WORKING_DAYS_PER_MONTH * VACATION_ACCRUAL_RATE),
    ).toBeCloseTo(2.18, 2);
  });

  it('acumula un mes de descanso por cada once de trabajo', () => {
    // 11 meses × 24 laborables × 9,09 % ≈ 24 días laborables = un mes.
    expect(
      Math.round(11 * WORKING_DAYS_PER_MONTH * VACATION_ACCRUAL_RATE),
    ).toBe(WORKING_DAYS_PER_MONTH);
  });

  it('no acumula por los días no trabajados', () => {
    // Mes con 10 días de licencia: solo acumulan los 14 laborables pagados.
    const paidUnits = WORKING_DAYS_PER_MONTH - 10;
    expect(round2(paidUnits * VACATION_ACCRUAL_RATE)).toBeCloseTo(1.27, 2);
  });

  it('la provisión es el 9,09 % de los salarios percibidos, no del contractual', () => {
    const baseSalary = 5000;
    // 10 días de licencia → devengo de 14/24 del salario contractual.
    const gross = round2((baseSalary / WORKING_DAYS_PER_MONTH) * 14);
    expect(round2(gross * VACATION_ACCRUAL_RATE)).toBeCloseTo(265.13, 2);
    expect(round2(baseSalary * VACATION_ACCRUAL_RATE)).toBeCloseTo(454.5, 2);
  });
});

describe('Retribución de las vacaciones (Art. 102)', () => {
  const contractualRate = round2(5000 / WORKING_DAYS_PER_MONTH); // 208.33

  it('paga a la tarifa del fondo acumulado', () => {
    // 11 meses a 5 000: 24 días y 4 999,50 acumulados → ~208,31 por día.
    const balance = { days: 24, amount: 4999.5 };
    expect(vacationDailyRate(balance, contractualRate)).toBeCloseTo(208.31, 2);
  });

  it('el fondo cubre el mes de vacaciones del Art. 101', () => {
    // Once meses de acumulación pagan un mes completo de descanso.
    const monthlyAccrual = round2(5000 * VACATION_ACCRUAL_RATE);
    const balance = {
      days: 11 * WORKING_DAYS_PER_MONTH * VACATION_ACCRUAL_RATE,
      amount: 11 * monthlyAccrual,
    };
    const rate = vacationDailyRate(balance, contractualRate);
    expect(round2(rate * WORKING_DAYS_PER_MONTH)).toBeCloseTo(5000, 0);
  });

  it('ignora el aumento de salario posterior a la acumulación', () => {
    // El fondo se formó con 5 000; el salario subió a 8 000. Se paga lo
    // acumulado, no la tarifa nueva: la 492 no queda en déficit.
    const balance = { days: 24, amount: 4999.5 };
    const newContractualRate = round2(8000 / WORKING_DAYS_PER_MONTH);
    const rate = vacationDailyRate(balance, newContractualRate);
    expect(rate).toBeCloseTo(208.31, 2);
    expect(round2(rate * 24)).toBeCloseTo(balance.amount, 0);
  });

  it('recurre a la tarifa contractual si no hay acumulado', () => {
    expect(vacationDailyRate(undefined, contractualRate)).toBe(contractualRate);
    expect(vacationDailyRate({ days: 0, amount: 0 }, contractualRate)).toBe(
      contractualRate,
    );
  });

  it('recurre a la tarifa contractual si el saldo quedó en negativo', () => {
    expect(
      vacationDailyRate({ days: -2, amount: -400 }, contractualRate),
    ).toBe(contractualRate);
  });
});
