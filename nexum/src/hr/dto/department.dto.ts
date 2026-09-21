import {
  IsString,
  IsOptional,
  IsBoolean,
  IsUUID,
  IsIn,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDepartmentDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(36)
  managerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  managerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(36)
  costCenterId?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isActive?: boolean;
}

export class UpdateDepartmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(36)
  managerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  managerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(36)
  costCenterId?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isActive?: boolean;
}
