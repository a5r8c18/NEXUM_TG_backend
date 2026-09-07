import {
  calculateIncomeTax,
  calculateMaternityBenefit,
  calculateSocialBenefit,
  calculateSocialSecurity,
  calculateSubsidy,
  calculateWeeklyAverageSalary,
  evaluateSubsidyLimit,
  overlapDays,
} from './payroll-calculations';
import {
  MINIMUM_SUBSIDY,
  subsidyRate,
  subsidyWaitingDays,
} from './payroll-concept';

describe('Contribución a la Seguridad Social', () => {
  it('aplica el 5 % hasta 150 000 CUP', () => {
    expect(calculateSocialSecurity(10000)).toBe(500);
    expect(calculateSocialSecurity(150000)).toBe(7500);
  });

  it('aplica el 10 % por encima de 150 000 CUP', () => {
    expect(calculateSocialSecurity(150001)).toBe(15000.1);
  });
});

describe('Impuesto sobre los Ingresos Personales', () => {
  it('exime el primer tramo', () => {
    expect(calculateIncomeTax(3260)).toBe(0);
  });

  it('aplica la escala de forma progresiva, no plana', () => {
    // 3260 exentos + 6250 al 3 % = 187.50
    expect(calculateIncomeTax(9510)).toBe(187.5);
  });

  it('acumula los tramos intermedios', () => {
    // 187.50 + (15000 − 9510) × 5 % = 187.50 + 274.50 = 462
    expect(calculateIncomeTax(15000)).toBe(462);
  });

  it('aplica el 20 % solo al exceso sobre 30 000', () => {
    const at30k = calculateIncomeTax(30000);
    expect(calculateIncomeTax(40000)).toBe(Math.round((at30k + 2000) * 100) / 100);
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
