import {
  IsString,
  IsNumber,
  IsOptional,
  IsDateString,
  IsArray,
  IsInt,
  IsUUID,
  ValidateNested,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PayrollLineItemDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  id?: number;

  @IsString()
  @IsUUID()
  employeeId: string;

  @IsString()
  @MaxLength(100)
  employeeName: string;

  @IsString()
  @MaxLength(20)
  employeeDocument: string;

  @IsString()
  @MaxLength(100)
  position: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  costCenterId?: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  baseSalary: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  paidUnits?: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  overtimeHours: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  overtimePay: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  bonuses: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  commissions: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  allowances: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  grossSalary?: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  socialSecurity: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  healthInsurance: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  pension: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  taxWithholding: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  otherDeductions: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreatePayrollDto {
  @IsString()
  @MaxLength(50)
  period: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsString()
  @MaxLength(255)
  processedBy: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PayrollLineItemDto)
  items: PayrollLineItemDto[];
}

export class GeneratePayrollDto {
  @IsString()
  @MaxLength(50)
  period: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  processedBy?: string;
}

export class GenerateMaternityDto extends GeneratePayrollDto {
  /**
   * 1-3: plazos de la prestación económica (Art. 18 DL 56/2021).
   * 4: prestación social mensual del período (Art. 30.1).
   */
  @IsNumber()
  @IsInt()
  @Min(1)
  @Max(4)
  @Type(() => Number)
  installment: number;
}

export class GenerateFreeItemDto {
  @IsString()
  @IsUUID()
  employeeId: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}

export class GenerateFreeDto extends GeneratePayrollDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GenerateFreeItemDto)
  items: GenerateFreeItemDto[];
}

export class GenerateSettlementDto extends GeneratePayrollDto {
  @IsString()
  @IsUUID()
  employeeId: string;
}

export class ManualPayrollItemDto {
  @IsString()
  @IsUUID()
  employeeId: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  days: number;

  /** Horas sueltas trabajadas además de los días; en trabajadores por horas es la unidad principal. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  hours?: number;

  /** Nocturnidad: horas de la banda 11:00 pm a 7:00 am (`hours` es la de 7 a 11 pm). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  nightHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  grossSalary?: number;
}

export class NightShiftRatesDto {
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  nightShiftRateEvening: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  nightShiftRateNight: number;
}

export class GenerateManualDto extends GeneratePayrollDto {
  @IsString()
  @MaxLength(20)
  concept: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManualPayrollItemDto)
  items: ManualPayrollItemDto[];
}

export class UpdatePayrollItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PayrollLineItemDto)
  items: PayrollLineItemDto[];
}

export class ProcessPayrollDto {
  @IsString()
  @MaxLength(255)
  processedBy: string;
}

export class PayPayrollDto {
  @IsOptional()
  @IsString()
  @IsUUID()
  bankAccountId?: string;
}

export class CancelPayrollDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
