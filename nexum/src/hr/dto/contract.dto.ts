import {
  IsString,
  IsNumber,
  IsOptional,
  IsDateString,
  IsUUID,
  IsIn,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

const contractStatuses = ['active', 'expired', 'terminated', 'suspended'] as const;

export class CreateContractDto {
  @IsString()
  @IsUUID()
  employeeId: string;

  @IsOptional()
  @IsString()
  @MaxLength(36)
  positionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  contractType?: string;

  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  salary?: number;

  @IsOptional()
  @IsString()
  @IsIn(contractStatuses)
  status?: 'active' | 'expired' | 'terminated' | 'suspended';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  documentUrl?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateContractDto {
  @IsOptional()
  @IsString()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(36)
  positionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  contractType?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  salary?: number;

  @IsOptional()
  @IsString()
  @IsIn(contractStatuses)
  status?: 'active' | 'expired' | 'terminated' | 'suspended';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  documentUrl?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
