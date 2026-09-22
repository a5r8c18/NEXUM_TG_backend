import {
  IsString,
  IsNumber,
  IsOptional,
  IsDateString,
  IsUUID,
  IsIn,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

const attendanceStatuses = ['present', 'absent', 'late', 'leave', 'holiday'] as const;

/**
 * Topes de sanidad por parte diario: una jornada ordinaria de 8 h no admite
 * más de 16 h extraordinarias (24 h físicas) ni más de 24 h trabajadas.
 * El Reglamento de la Ley 116 limita además el acumulado de horas extras por
 * período; este tope evita registros imposibles que inflarían la nómina.
 */
const MAX_OVERTIME_HOURS_PER_DAY = 16;
const MAX_WORKED_HOURS_PER_DAY = 24;

export class CreateAttendanceDto {
  @IsString()
  @IsUUID()
  employeeId: string;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  @IsIn(attendanceStatuses)
  status?: 'present' | 'absent' | 'late' | 'leave' | 'holiday';

  @IsOptional()
  @IsString()
  @MaxLength(10)
  checkIn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  checkOut?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(MAX_WORKED_HOURS_PER_DAY)
  @Type(() => Number)
  hoursWorked?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(MAX_OVERTIME_HOURS_PER_DAY)
  @Type(() => Number)
  overtimeHours?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateAttendanceDto {
  @IsOptional()
  @IsString()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  @IsIn(attendanceStatuses)
  status?: 'present' | 'absent' | 'late' | 'leave' | 'holiday';

  @IsOptional()
  @IsString()
  @MaxLength(10)
  checkIn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  checkOut?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(MAX_WORKED_HOURS_PER_DAY)
  @Type(() => Number)
  hoursWorked?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(MAX_OVERTIME_HOURS_PER_DAY)
  @Type(() => Number)
  overtimeHours?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
