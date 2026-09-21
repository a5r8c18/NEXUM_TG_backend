import {
  IsString,
  IsNumber,
  IsOptional,
  IsDateString,
  IsUUID,
  IsBoolean,
  IsIn,
  IsInt,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

const leaveTypes = [
  'vacation',
  'sick',
  'unpaid',
  'maternity',
  'paternity',
  'other',
] as const;
const leaveStatuses = ['pending', 'approved', 'rejected', 'cancelled'] as const;
const origins = ['common', 'occupational'] as const;
const benefitVariants = ['a', 'b', 'c'] as const;

export class CreateLeaveDto {
  @IsString()
  @IsUUID()
  employeeId: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  employeeName?: string;

  @IsOptional()
  @IsString()
  @IsIn(leaveTypes)
  type?: 'vacation' | 'sick' | 'unpaid' | 'maternity' | 'paternity' | 'other';

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  days?: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  @IsIn(origins)
  origin?: 'common' | 'occupational';

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  hospitalized?: boolean;

  @IsOptional()
  @IsDateString()
  hospitalizationStart?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  medicalCertificate?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  multiplePregnancy?: boolean;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsDateString()
  prenatalStart?: string;

  @IsOptional()
  @IsDateString()
  postnatalStart?: string;

  @IsOptional()
  @IsString()
  @IsIn(benefitVariants)
  socialBenefitVariant?: 'a' | 'b' | 'c';

  @IsOptional()
  @IsString()
  @IsUUID()
  beneficiaryEmployeeId?: string;
}

export class UpdateLeaveDto {
  @IsOptional()
  @IsString()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  employeeName?: string;

  @IsOptional()
  @IsString()
  @IsIn(leaveTypes)
  type?: 'vacation' | 'sick' | 'unpaid' | 'maternity' | 'paternity' | 'other';

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  days?: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  @IsIn(origins)
  origin?: 'common' | 'occupational';

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  hospitalized?: boolean;

  @IsOptional()
  @IsDateString()
  hospitalizationStart?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  medicalCertificate?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  multiplePregnancy?: boolean;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsDateString()
  prenatalStart?: string;

  @IsOptional()
  @IsDateString()
  postnatalStart?: string;

  @IsOptional()
  @IsString()
  @IsIn(benefitVariants)
  socialBenefitVariant?: 'a' | 'b' | 'c';

  @IsOptional()
  @IsString()
  @IsUUID()
  beneficiaryEmployeeId?: string;
}

export class SetLeaveStatusDto {
  @IsString()
  @IsIn(leaveStatuses)
  status: 'approved' | 'rejected' | 'cancelled';

  @IsOptional()
  @IsString()
  @MaxLength(150)
  approvedBy?: string;
}
