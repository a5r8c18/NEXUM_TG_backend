import { IsNotEmpty, IsString, IsNumber, IsOptional, IsPositive, ValidateNested, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class ExitItemDto {
  @IsString({ message: 'El código de producto debe ser texto' })
  @IsNotEmpty({ message: 'El código de producto es obligatorio' })
  productCode: string;

  @IsNumber({}, { message: 'La cantidad debe ser un número' })
  @IsPositive({ message: 'La cantidad debe ser mayor que 0' })
  quantity: number;

  @IsOptional()
  @IsString()
  expenseElement?: string;
}

export class CreateExitDto {
  @IsString({ message: 'El código de movimiento debe ser texto' })
  @IsNotEmpty({ message: 'El código de movimiento es obligatorio' })
  movementCode: string;

  @IsOptional()
  @IsString()
  category?: 'insumo' | 'mercancia' | 'produccion';

  @IsString({ message: 'El ID de almacén debe ser texto' })
  @IsNotEmpty({ message: 'El almacén es obligatorio' })
  warehouseId: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  entity?: string;

  @IsOptional()
  @IsString({ message: 'El elemento de gasto debe ser texto' })
  expenseElement?: string;

  // ── Cuentas contables seleccionadas por el usuario (del clasificador) ──
  @IsOptional()
  @IsString()
  debitAccountCode?: string;

  @IsOptional()
  @IsString()
  creditAccountCode?: string;

  // ── Batch: array de productos ──
  @IsOptional()
  @IsArray({ message: 'Los productos deben ser un arreglo' })
  @ValidateNested({ each: true })
  @Type(() => ExitItemDto)
  items?: ExitItemDto[];

  // ── Backward compatibility (single product) ──
  @IsOptional()
  @IsString()
  product_code?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  quantity?: number;
}
