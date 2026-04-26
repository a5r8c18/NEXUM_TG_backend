import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  IsDateString,
  IsNumber,
  Min,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class VoucherLineDto {
  @IsString({ message: 'El código de cuenta es obligatorio' })
  @IsNotEmpty({ message: 'El código de cuenta no puede estar vacío' })
  accountCode: string;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  subaccountCode?: string;

  @IsOptional()
  @IsString()
  element?: string;

  @IsOptional()
  @IsString()
  subelement?: string;

  @IsOptional()
  @IsString()
  costCenterId?: string;

  @IsNumber({}, { message: 'El débito debe ser un número' })
  @Min(0, { message: 'El débito no puede ser negativo' })
  debit: number;

  @IsNumber({}, { message: 'El crédito debe ser un número' })
  @Min(0, { message: 'El crédito no puede ser negativo' })
  credit: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsNumber()
  lineOrder?: number;
}

export class CreateVoucherDto {
  @IsDateString(
    {},
    { message: 'La fecha debe tener formato de fecha válido' },
  )
  date: string;

  @IsString({ message: 'La descripción debe ser texto' })
  @IsNotEmpty({ message: 'La descripción es obligatoria' })
  description: string;

  @IsOptional()
  @IsIn(['ingreso', 'egreso', 'diario', 'apertura', 'cierre', 'ajuste', 'otro'], {
    message: 'Tipo de comprobante inválido',
  })
  type?: string;

  @IsOptional()
  @IsIn(['manual', 'invoices', 'purchases', 'fixed_assets', 'movements', 'payroll'], {
    message: 'Módulo fuente inválido',
  })
  sourceModule?: string;

  @IsOptional()
  @IsString()
  sourceDocumentId?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  createdBy?: string;

  @IsArray({ message: 'Las líneas deben ser un arreglo' })
  @ArrayMinSize(2, {
    message: 'Un comprobante debe tener al menos 2 partidas',
  })
  @ValidateNested({ each: true })
  @Type(() => VoucherLineDto)
  lines: VoucherLineDto[];
}

export class UpdateVoucherDto {
  @IsOptional()
  @IsDateString(
    {},
    { message: 'La fecha debe tener formato de fecha válido' },
  )
  date?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['ingreso', 'egreso', 'diario', 'apertura', 'cierre', 'ajuste', 'otro'])
  type?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2, {
    message: 'Un comprobante debe tener al menos 2 partidas',
  })
  @ValidateNested({ each: true })
  @Type(() => VoucherLineDto)
  lines?: VoucherLineDto[];
}

export class UpdateVoucherStatusDto {
  @IsString({ message: 'El estado debe ser texto' })
  @IsIn(['draft', 'posted', 'cancelled'], {
    message: 'Estado inválido. Valores permitidos: draft, posted, cancelled',
  })
  status: string;
}
