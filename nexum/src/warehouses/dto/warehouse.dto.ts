import { IsNotEmpty, IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateWarehouseDto {
  @IsString({ message: 'El nombre del almacén debe ser texto' })
  @IsNotEmpty({ message: 'El nombre del almacén es obligatorio' })
  name: string;

  @IsString({ message: 'El código del almacén debe ser texto' })
  @IsNotEmpty({ message: 'El código del almacén es obligatorio' })
  code: string;

  @IsOptional()
  @IsString()
  address?: string;
}

export class UpdateWarehouseDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsBoolean({ message: 'isActive debe ser booleano' })
  isActive?: boolean;
}
