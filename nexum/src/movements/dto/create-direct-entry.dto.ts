import { IsNotEmpty, IsString, IsNumber, IsOptional, IsPositive } from 'class-validator';

export class CreateDirectEntryDto {
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
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  entity?: string;

  @IsString({ message: 'El ID de almacén debe ser texto' })
  @IsNotEmpty({ message: 'El almacén es obligatorio' })
  warehouseId: string;

  @IsOptional()
  @IsNumber({}, { message: 'El precio unitario debe ser un número' })
  @IsPositive({ message: 'El precio unitario debe ser mayor que 0' })
  unitPrice?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  location?: string;
}
