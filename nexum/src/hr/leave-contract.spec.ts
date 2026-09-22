import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { CreateLeaveDto, UpdateLeaveDto } from './dto/leave.dto';
import {
  PAYROLL_CONCEPTS,
  PAYROLL_CONCEPT_LABELS,
  subsidyRate,
  subsidyWaitingDays,
} from './payroll-concept';
import { NON_SALARY_LEAVE_TYPES } from './payroll-calculations';

/**
 * Fija el contrato de licencias entre el frontend y el backend.
 *
 * El formulario enviaba 'work' y 'mother'/'mother_working'/'other_worker',
 * valores que el dominio legal no reconoce: el primero hacía que un accidente
 * de trabajo se pagara como enfermedad común (Art. 40) y el segundo no cabía
 * siquiera en la columna varchar(1). Estos casos evitan la reaparición.
 */
describe('Contrato de licencias frontend ↔ backend', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });
  const base = {
    employeeId: '3f0c0b3e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
    startDate: '2026-07-01',
    endDate: '2026-07-10',
  };
  const asCreate = { type: 'body' as const, metatype: CreateLeaveDto };
  const asUpdate = { type: 'body' as const, metatype: UpdateLeaveDto };

  describe('origen de la incapacidad (Art. 40)', () => {
    it('acepta los dos valores del dominio legal', async () => {
      for (const origin of ['common', 'occupational']) {
        const dto = await pipe.transform(
          { ...base, type: 'sick', origin },
          asCreate,
        );
        expect(dto.origin).toBe(origin);
      }
    });

    it("rechaza el antiguo 'work' del formulario", async () => {
      await expect(
        pipe.transform({ ...base, type: 'sick', origin: 'work' }, asCreate),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('también valida el origen al actualizar', async () => {
      await expect(
        pipe.transform({ origin: 'work' }, asUpdate),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        pipe.transform({ origin: 'occupational' }, asUpdate),
      ).resolves.toMatchObject({ origin: 'occupational' });
    });
  });

  describe('el origen aceptado produce la tasa legal del Art. 40', () => {
    it("'occupational' paga 80 % sin hospitalizar y 70 % hospitalizado", () => {
      expect(subsidyRate('occupational', false)).toBe(0.8);
      expect(subsidyRate('occupational', true)).toBe(0.7);
    });

    it("'common' paga 60 % sin hospitalizar y 50 % hospitalizado", () => {
      expect(subsidyRate('common', false)).toBe(0.6);
      expect(subsidyRate('common', true)).toBe(0.5);
    });

    it('el accidente de trabajo no tiene días de carencia (Art. 42)', () => {
      expect(subsidyWaitingDays('occupational', false)).toBe(0);
      expect(subsidyWaitingDays('common', false)).toBe(3);
    });
  });

  describe('variante de prestación social (Art. 30.1)', () => {
    it('acepta a, b y c', async () => {
      for (const variant of ['a', 'b', 'c']) {
        const dto = await pipe.transform(
          { ...base, type: 'maternity', socialBenefitVariant: variant },
          asCreate,
        );
        expect(dto.socialBenefitVariant).toBe(variant);
      }
    });

    it('rechaza las etiquetas largas que enviaba el formulario', async () => {
      for (const variant of ['mother', 'mother_working', 'other_worker']) {
        await expect(
          pipe.transform(
            { ...base, type: 'maternity', socialBenefitVariant: variant },
            asCreate,
          ),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
    });

    it('caben en la columna varchar(1) de la entidad', () => {
      for (const variant of ['a', 'b', 'c']) {
        expect(variant.length).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('paternidad no es concepto de nómina (DL 56/2021)', () => {
    // El padre accede a la prestación social por cesión (Art. 30.1.c), pagada
    // en la nómina de maternidad con él como beneficiario; no existe un
    // derecho autónomo que justifique un concepto propio.
    it("el dominio de conceptos no incluye 'paternidad'", () => {
      expect(PAYROLL_CONCEPTS).not.toContain('paternidad');
      expect(PAYROLL_CONCEPT_LABELS).not.toHaveProperty('paternidad');
    });

    it("la licencia 'paternity' sigue siendo válida para la ausencia del padre", async () => {
      const dto = await pipe.transform(
        { ...base, type: 'paternity' },
        asCreate,
      );
      expect(dto.type).toBe('paternity');
    });

    it("la ausencia del padre por cesión se descuenta del salario ordinario", () => {
      expect(NON_SALARY_LEAVE_TYPES).toContain('paternity');
    });
  });
});
