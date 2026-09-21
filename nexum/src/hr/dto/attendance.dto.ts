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

const attendanceStatuses = ['present', 'absent', 'late', 'leave', 'holiday'] as const;

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
  @Type(() => Number)
  hoursWorked?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
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
  @Type(() => Number)
  hoursWorked?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  overtimeHours?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
