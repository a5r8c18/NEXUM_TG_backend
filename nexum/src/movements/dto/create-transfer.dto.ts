import { IsNotEmpty, IsString, IsNumber, IsOptional, IsPositive, ValidateNested, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class TransferItemDto {
  @IsString({ message: 'El código de producto debe ser texto' })
  @IsNotEmpty({ message: 'El código de producto es obligatorio' })
  productCode: string;

  @IsNumber({}, { message: 'La cantidad debe ser un número' })
  @IsPositive({ message: 'La cantidad debe ser mayor que 0' })
  quantity: number;
}

export class CreateTransferDto {
  @IsString({ message: 'El código de movimiento debe ser texto' })
  @IsNotEmpty({ message: 'El código de movimiento es obligatorio' })
  movementCode: string;

  @IsOptional()
  @IsString()
  category?: 'insumo' | 'mercancia' | 'produccion';

  @IsString({ message: 'El almacén origen debe ser texto' })
  @IsNotEmpty({ message: 'El almacén origen es obligatorio' })
  sourceWarehouseId: string;

  @IsString({ message: 'El almacén destino debe ser texto' })
  @IsNotEmpty({ message: 'El almacén destino es obligatorio' })
  destinationWarehouseId: string;

  @IsOptional()
  @IsString()
  reason?: string;

  // ── Batch: array de productos ──
  @IsOptional()
  @IsArray({ message: 'Los productos deben ser un arreglo' })
  @ValidateNested({ each: true })
  @Type(() => TransferItemDto)
  items?: TransferItemDto[];

  // ── Backward compatibility (single product) ──
  @IsOptional()
  @IsString()
  productCode?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  quantity?: number;
}
