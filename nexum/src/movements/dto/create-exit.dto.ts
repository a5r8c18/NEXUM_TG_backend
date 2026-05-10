import { IsNotEmpty, IsString, IsNumber, IsOptional, IsPositive } from 'class-validator';

export class CreateExitDto {
  @IsString({ message: 'El código de movimiento debe ser texto' })
  @IsNotEmpty({ message: 'El código de movimiento es obligatorio' })
  movementCode: string;

  @IsOptional()
  @IsString()
  category?: 'insumo' | 'mercancia' | 'produccion';

  @IsString({ message: 'El código de producto debe ser texto' })
  @IsNotEmpty({ message: 'El código de producto es obligatorio' })
  product_code: string;

  @IsNumber({}, { message: 'La cantidad debe ser un número' })
  @IsPositive({ message: 'La cantidad debe ser mayor que 0' })
  quantity: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  entity?: string;

  @IsString({ message: 'El ID de almacén debe ser texto' })
  @IsNotEmpty({ message: 'El almacén es obligatorio' })
  warehouseId: string;
}
