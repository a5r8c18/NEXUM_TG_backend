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
  @IsNumber()
  @IsInt()
  @Min(1)
  @Max(3)
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
