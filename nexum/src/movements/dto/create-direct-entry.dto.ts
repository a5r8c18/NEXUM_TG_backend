import { IsNotEmpty, IsString, IsNumber, IsOptional, IsPositive, ValidateNested, IsArray, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

export class EntryItemDto {
  @IsString({ message: 'El código de producto debe ser texto' })
  @IsNotEmpty({ message: 'El código de producto es obligatorio' })
  productCode: string;

  @IsString({ message: 'El nombre de producto debe ser texto' })
  @IsNotEmpty({ message: 'El nombre de producto es obligatorio' })
  productName: string;

  @IsOptional()
  @IsString()
  productDescription?: string;

  @IsNumber({}, { message: 'La cantidad debe ser un número' })
  @IsPositive({ message: 'La cantidad debe ser mayor que 0' })
  quantity: number;

  @IsOptional()
  @IsNumber({}, { message: 'El precio unitario debe ser un número' })
  unitPrice?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  expenseElement?: string;
}

export class CreateDirectEntryDto {
  @IsString({ message: 'El código de movimiento debe ser texto' })
  @IsNotEmpty({ message: 'El código de movimiento es obligatorio' })
  movementCode: string;

  @IsOptional()
  @IsString()
  category?: 'insumo' | 'mercancia' | 'produccion';

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  entity?: string;

  @IsString({ message: 'El ID de almacén debe ser texto' })
  @IsNotEmpty({ message: 'El almacén es obligatorio' })
  warehouseId: string;

  @IsArray({ message: 'Los productos deben ser un arreglo' })
  @ArrayMinSize(1, { message: 'Debe incluir al menos un producto' })
  @ValidateNested({ each: true })
  @Type(() => EntryItemDto)
  items: EntryItemDto[];

  // ── Cuentas contables seleccionadas por el usuario (del clasificador) ──
  // Si se proveen, sobrescriben las cuentas por defecto del catálogo de movimientos.
  @IsOptional()
  @IsString()
  debitAccountCode?: string;

  @IsOptional()
  @IsString()
  creditAccountCode?: string;

  // ── Backward compatibility (single product) ──
  @IsOptional()
  @IsString()
  productCode?: string;

  @IsOptional()
  @IsString()
  productName?: string;

  @IsOptional()
  @IsString()
  productDescription?: string;

  @IsOptional()
  @IsNumber()
  quantity?: number;

  @IsOptional()
  @IsNumber()
  unitPrice?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  expenseElement?: string;
}
