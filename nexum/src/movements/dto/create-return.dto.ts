import { IsNotEmpty, IsString, IsNumber, IsOptional, IsPositive, ValidateNested, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class ReturnItemDto {
  @IsString({ message: 'El código de producto debe ser texto' })
  @IsNotEmpty({ message: 'El código de producto es obligatorio' })
  productCode: string;

  @IsNumber({}, { message: 'La cantidad debe ser un número' })
  @IsPositive({ message: 'La cantidad debe ser mayor que 0' })
  quantity: number;
}

export class CreateReturnDto {
  @IsString({ message: 'El código de movimiento debe ser texto' })
  @IsNotEmpty({ message: 'El código de movimiento es obligatorio' })
  movementCode: string;

  @IsOptional()
  @IsString()
  category?: 'insumo' | 'mercancia' | 'produccion';

  @IsString({ message: 'El ID de almacén debe ser texto' })
  @IsNotEmpty({ message: 'El almacén es obligatorio' })
  warehouseId: string;

  @IsString({ message: 'El motivo de devolución debe ser texto' })
  @IsNotEmpty({ message: 'El motivo de devolución es obligatorio' })
  reason: string;

  @IsOptional()
  @IsString()
  purchase_id?: string;

  @IsOptional()
  @IsString()
  entity?: string;

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
  @Type(() => ReturnItemDto)
  items?: ReturnItemDto[];

  // ── Backward compatibility (single product) ──
  @IsOptional()
  @IsString()
  product_code?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  quantity?: number;
}
