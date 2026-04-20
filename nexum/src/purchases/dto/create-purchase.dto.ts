import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PurchaseProductDto {
  @IsString({ message: 'El código de producto debe ser texto' })
  @IsNotEmpty({ message: 'El código de producto es obligatorio' })
  product_code: string;

  @IsString({ message: 'El nombre de producto debe ser texto' })
  @IsNotEmpty({ message: 'El nombre de producto es obligatorio' })
  product_name: string;

  @IsNumber({}, { message: 'La cantidad debe ser un número' })
  @IsPositive({ message: 'La cantidad debe ser mayor que 0' })
  quantity: number;

  @IsNumber({}, { message: 'El precio unitario debe ser un número' })
  @IsPositive({ message: 'El precio unitario debe ser mayor que 0' })
  unit_price: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha de expiración debe tener formato de fecha válido' })
  expiration_date?: string;
}

export class CreatePurchaseDto {
  @IsString({ message: 'La entidad debe ser texto' })
  @IsNotEmpty({ message: 'La entidad es obligatoria' })
  entity: string;

  @IsString({ message: 'El almacén debe ser texto' })
  @IsNotEmpty({ message: 'El almacén es obligatorio' })
  warehouse: string;

  @IsString({ message: 'El proveedor debe ser texto' })
  @IsNotEmpty({ message: 'El proveedor es obligatorio' })
  supplier: string;

  @IsString({ message: 'El documento debe ser texto' })
  @IsNotEmpty({ message: 'El documento es obligatorio' })
  document: string;

  @IsArray({ message: 'Los productos deben ser un arreglo' })
  @ArrayMinSize(1, { message: 'Debe incluir al menos un producto' })
  @ValidateNested({ each: true })
  @Type(() => PurchaseProductDto)
  products: PurchaseProductDto[];
}
