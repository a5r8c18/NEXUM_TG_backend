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
// Modalidades del contrato (Ley 116): ordinario, a prueba, ejecución de obra.
const contractTypes = ['ordinary', 'trial_period', 'work_execution'] as const;
// Duración del vínculo (Art. 24 Ley 116).
const contractTerms = ['determinate', 'indeterminate'] as const;

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
  @IsIn(contractTypes)
  contractType?: 'ordinary' | 'trial_period' | 'work_execution';

  @IsOptional()
  @IsString()
  @IsIn(contractTerms)
  contractTerm?: 'determinate' | 'indeterminate';

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
  @IsIn(contractTypes)
  contractType?: 'ordinary' | 'trial_period' | 'work_execution';

  @IsOptional()
  @IsString()
  @IsIn(contractTerms)
  contractTerm?: 'determinate' | 'indeterminate';

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
