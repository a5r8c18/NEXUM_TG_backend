import {
  IsString,
  IsNumber,
  IsOptional,
  IsDateString,
  IsUUID,
  IsBoolean,
  IsIn,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

const employeeStatuses = ['active', 'inactive', 'on_leave'] as const;
const contractTypes = ['ordinary', 'trial_period', 'work_execution'] as const;
const activities = ['direct', 'indirect'] as const;
const occupationalCategories = ['0010', '0020', '0030', '0040', '0050'] as const;
const employmentSectors = ['state', 'non_state'] as const;
const contractTerms = ['determinate', 'indeterminate'] as const;

export class CreateEmployeeDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  employeeCode?: string;

  @IsString()
  @MaxLength(50)
  firstName: string;

  @IsString()
  @MaxLength(50)
  lastName: string;

  @IsOptional()
  @IsString()
  @MaxLength(36)
  costCenterId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(36)
  positionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  position?: string;

  @IsOptional()
  @IsString()
  @MaxLength(36)
  departmentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  departmentName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(36)
  userId?: string;

  @IsOptional()
  @IsDateString()
  hireDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  salary?: number;

  @IsOptional()
  @IsString()
  @IsIn(contractTypes)
  contractType?: 'trial_period' | 'work_execution';

  @IsOptional()
  @IsString()
  @IsIn(activities)
  activity?: 'direct' | 'indirect';

  @IsOptional()
  @IsString()
  @IsIn(employeeStatuses)
  status?: 'active' | 'inactive' | 'on_leave';

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  documentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  bankAccount?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  initialVacationDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  initialVacationAmount?: number;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  unionMember?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  overtimeRate?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  expenseAccountCode?: string;

  @IsOptional()
  @IsString()
  @IsIn(occupationalCategories)
  occupationalCategory?: '0010' | '0020' | '0030' | '0040' | '0050';

  @IsOptional()
  @IsString()
  @IsIn(employmentSectors)
  employmentSector?: 'state' | 'non_state';

  @IsOptional()
  @IsString()
  @IsIn(contractTerms)
  contractTerm?: 'determinate' | 'indeterminate';
}

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  employeeCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(36)
  costCenterId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(36)
  positionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  position?: string;

  @IsOptional()
  @IsString()
  @MaxLength(36)
  departmentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  departmentName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(36)
  userId?: string;

  @IsOptional()
  @IsDateString()
  hireDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  salary?: number;

  @IsOptional()
  @IsString()
  @IsIn(contractTypes)
  contractType?: 'trial_period' | 'work_execution';

  @IsOptional()
  @IsString()
  @IsIn(activities)
  activity?: 'direct' | 'indirect';

  @IsOptional()
  @IsString()
  @IsIn(employeeStatuses)
  status?: 'active' | 'inactive' | 'on_leave';

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  documentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  bankAccount?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  initialVacationDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  initialVacationAmount?: number;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  unionMember?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  overtimeRate?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  expenseAccountCode?: string;

  @IsOptional()
  @IsString()
  @IsIn(occupationalCategories)
  occupationalCategory?: '0010' | '0020' | '0030' | '0040' | '0050';

  @IsOptional()
  @IsString()
  @IsIn(employmentSectors)
  employmentSector?: 'state' | 'non_state';

  @IsOptional()
  @IsString()
  @IsIn(contractTerms)
  contractTerm?: 'determinate' | 'indeterminate';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  changedBy?: string;

  @IsOptional()
  @IsString()
  salaryChangeReason?: string;
}
