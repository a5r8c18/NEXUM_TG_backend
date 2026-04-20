import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  Min,
} from 'class-validator';

export class CreateStockLimitDto {
  @IsString({ message: 'El ID de producto debe ser texto' })
  @IsNotEmpty({ message: 'El ID de producto es obligatorio' })
  productId: string;

  @IsString({ message: 'El ID de almacén debe ser texto' })
  @IsNotEmpty({ message: 'El almacén es obligatorio' })
  warehouseId: string;

  @IsNumber({}, { message: 'El stock mínimo debe ser un número' })
  @Min(0, { message: 'El stock mínimo no puede ser negativo' })
  minStock: number;

  @IsNumber({}, { message: 'El stock máximo debe ser un número' })
  @Min(0, { message: 'El stock máximo no puede ser negativo' })
  maxStock: number;

  @IsNumber({}, { message: 'El punto de reorden debe ser un número' })
  @Min(0, { message: 'El punto de reorden no puede ser negativo' })
  reorderPoint: number;

  @IsOptional()
  @IsNumber()
  companyId?: number;
}

export class UpdateStockLimitDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  minStock?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxStock?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  reorderPoint?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
