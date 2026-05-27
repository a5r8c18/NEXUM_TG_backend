import { IsString, IsNumber, IsOptional, IsDateString, IsArray, Min, MaxLength } from 'class-validator';

export class CreatePayrollDto {
  @IsString()
  @MaxLength(50)
  period: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsNumber()
  @Min(0)
  totalGross: number;

  @IsNumber()
  @Min(0)
  totalDeductions: number;

  @IsNumber()
  @Min(0)
  totalNet: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  processedBy?: string;

  @IsOptional()
  @IsArray()
  lines?: PayrollLineDto[];
}

export class PayrollLineDto {
  @IsString()
  employeeId: string;

  @IsNumber()
  @Min(0)
  grossSalary: number;

  @IsNumber()
  @Min(0)
  deductions: number;

  @IsNumber()
  @Min(0)
  netSalary: number;
}
