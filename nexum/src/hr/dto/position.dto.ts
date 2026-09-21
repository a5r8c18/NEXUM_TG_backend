import {
  IsString,
  IsNumber,
  IsOptional,
  IsInt,
  IsBoolean,
  IsUUID,
  IsIn,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

const timeUnits = ['hours', 'days'] as const;

export class CreatePositionDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  baseSalary?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  workingHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  timeBank?: number;

  @IsOptional()
  @IsString()
  @IsIn(timeUnits)
  timeUnit?: 'hours' | 'days';

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  salaryRate?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  paymentConcept?: string;

  @IsOptional()
  @IsString()
  @MaxLength(36)
  departmentId?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  approvedCount?: number;
}

export class UpdatePositionDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  baseSalary?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  workingHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  timeBank?: number;

  @IsOptional()
  @IsString()
  @IsIn(timeUnits)
  timeUnit?: 'hours' | 'days';

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  salaryRate?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  paymentConcept?: string;

  @IsOptional()
  @IsString()
  @MaxLength(36)
  departmentId?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  approvedCount?: number;
}
