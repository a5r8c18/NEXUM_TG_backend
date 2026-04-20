import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsDateString,
  IsIn,
  Min,
  Max,
  IsInt,
} from 'class-validator';

export class CreateFixedAssetDto {
  @IsString({ message: 'El código del activo debe ser texto' })
  @IsNotEmpty({ message: 'El código del activo es obligatorio' })
  asset_code: string;

  @IsString({ message: 'El nombre del activo debe ser texto' })
  @IsNotEmpty({ message: 'El nombre del activo es obligatorio' })
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt({ message: 'El número de grupo debe ser un entero' })
  @IsPositive({ message: 'El número de grupo debe ser mayor que 0' })
  group_number: number;

  @IsString({ message: 'El subgrupo debe ser texto' })
  @IsNotEmpty({ message: 'El subgrupo es obligatorio' })
  subgroup: string;

  @IsOptional()
  @IsString()
  subgroup_detail?: string;

  @IsNumber({}, { message: 'El valor de adquisición debe ser un número' })
  @IsPositive({ message: 'El valor de adquisición debe ser mayor que 0' })
  acquisition_value: number;

  @IsDateString({}, { message: 'La fecha de adquisición debe tener formato de fecha válido' })
  acquisition_date: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  responsible_person?: string;
}

export class UpdateFixedAssetDto {
  @IsOptional()
  @IsString()
  asset_code?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  group_number?: number;

  @IsOptional()
  @IsString()
  subgroup?: string;

  @IsOptional()
  @IsString()
  subgroup_detail?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  acquisition_value?: number;

  @IsOptional()
  @IsDateString()
  acquisition_date?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  responsible_person?: string;

  @IsOptional()
  @IsIn(['active', 'disposed', 'fully_depreciated'])
  status?: string;
}

export class ProcessDepreciationDto {
  @IsInt({ message: 'El año debe ser un entero' })
  @Min(2000, { message: 'El año debe ser mayor o igual a 2000' })
  @Max(2100, { message: 'El año debe ser menor o igual a 2100' })
  year: number;

  @IsInt({ message: 'El mes debe ser un entero' })
  @Min(1, { message: 'El mes debe estar entre 1 y 12' })
  @Max(12, { message: 'El mes debe estar entre 1 y 12' })
  month: number;
}
