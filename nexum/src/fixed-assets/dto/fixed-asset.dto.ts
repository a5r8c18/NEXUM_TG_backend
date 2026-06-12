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
import { IsNotFutureDate } from './fixed-asset-validator';

export class CreateFixedAssetDto {
  @IsString({ message: 'El código del activo debe ser texto' })
  @IsNotEmpty({ message: 'El código del activo es obligatorio' })
  assetCode: string;

  @IsString({ message: 'El nombre del activo debe ser texto' })
  @IsNotEmpty({ message: 'El nombre del activo es obligatorio' })
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt({ message: 'El número de grupo debe ser un entero' })
  @IsPositive({ message: 'El número de grupo debe ser mayor que 0' })
  groupNumber: number;

  @IsString({ message: 'El subgrupo debe ser texto' })
  @IsNotEmpty({ message: 'El subgrupo es obligatorio' })
  subgroup: string;

  @IsOptional()
  @IsString()
  subgroupDetail?: string;

  @IsNumber({}, { message: 'El valor de adquisición debe ser un número' })
  @IsPositive({ message: 'El valor de adquisición debe ser mayor que 0' })
  @Max(999999999.99, { message: 'El valor de adquisición no puede exceder 999,999,999.99' })
  acquisitionValue: number;

  @IsDateString({}, { message: 'La fecha de adquisición debe tener formato de fecha válido' })
  @IsNotFutureDate({ message: 'La fecha de adquisición no puede ser futura' })
  acquisitionDate: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  responsiblePerson?: string;
}

export class UpdateFixedAssetDto {
  @IsOptional()
  @IsString()
  assetCode?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  groupNumber?: number;

  @IsOptional()
  @IsString()
  subgroup?: string;

  @IsOptional()
  @IsString()
  subgroupDetail?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(999999999.99, { message: 'El valor de adquisición no puede exceder 999,999,999.99' })
  acquisitionValue?: number;

  @IsOptional()
  @IsDateString()
  acquisitionDate?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  responsiblePerson?: string;

  @IsOptional()
  @IsIn(['active', 'disposed', 'fully_depreciated'])
  status?: string;
}

export class DisposeAssetDto {
  @IsString({ message: 'El motivo de baja debe ser texto' })
  @IsNotEmpty({ message: 'El motivo de baja es obligatorio' })
  reason: string;

  @IsIn(
    ['deterioro', 'obsolescencia', 'rotura', 'faltante', 'venta', 'donacion'],
    { message: 'Tipo de baja inválido' },
  )
  disposalType: 'deterioro' | 'obsolescencia' | 'rotura' | 'faltante' | 'venta' | 'donacion';

  @IsOptional()
  @IsDateString()
  disposalDate?: string;
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

export class RevalueAssetDto {
  @IsNumber({}, { message: 'El nuevo valor debe ser un número' })
  @IsPositive({ message: 'El nuevo valor debe ser mayor que 0' })
  @Max(999999999.99, { message: 'El nuevo valor no puede exceder 999,999,999.99' })
  newValue: number;

  @IsString({ message: 'El motivo de revalorización debe ser texto' })
  @IsNotEmpty({ message: 'El motivo de revalorización es obligatorio' })
  reason: string;

  @IsDateString({}, { message: 'La fecha de revalorización debe tener formato de fecha válido' })
  revaluationDate: string;

  @IsOptional()
  @IsString()
  appraisalReference?: string;
}

export class TransferAssetDto {
  @IsInt({ message: 'El ID de la entidad destino debe ser un entero' })
  @IsPositive({ message: 'El ID de la entidad destino debe ser mayor que 0' })
  targetCompanyId: number;

  @IsString({ message: 'El motivo de transferencia debe ser texto' })
  @IsNotEmpty({ message: 'El motivo de transferencia es obligatorio' })
  reason: string;

  @IsDateString({}, { message: 'La fecha de transferencia debe tener formato de fecha válido' })
  transferDate: string;

  @IsOptional()
  @IsString()
  newLocation?: string;

  @IsOptional()
  @IsString()
  newResponsiblePerson?: string;
}

