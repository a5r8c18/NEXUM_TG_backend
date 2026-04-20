import { IsNotEmpty, IsString, IsNumber, IsOptional, IsPositive } from 'class-validator';

export class CreateReturnDto {
  @IsString({ message: 'El código de producto debe ser texto' })
  @IsNotEmpty({ message: 'El código de producto es obligatorio' })
  product_code: string;

  @IsNumber({}, { message: 'La cantidad debe ser un número' })
  @IsPositive({ message: 'La cantidad debe ser mayor que 0' })
  quantity: number;

  @IsOptional()
  @IsString()
  purchase_id?: string;

  @IsString({ message: 'El motivo de devolución debe ser texto' })
  @IsNotEmpty({ message: 'El motivo de devolución es obligatorio' })
  reason: string;

  @IsString({ message: 'El ID de almacén debe ser texto' })
  @IsNotEmpty({ message: 'El almacén es obligatorio' })
  warehouseId: string;
}
