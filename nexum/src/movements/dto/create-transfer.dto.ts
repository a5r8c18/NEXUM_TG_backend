import { IsNotEmpty, IsString, IsNumber, IsOptional, IsPositive } from 'class-validator';

export class CreateTransferDto {
  @IsString({ message: 'El código de producto debe ser texto' })
  @IsNotEmpty({ message: 'El código de producto es obligatorio' })
  productCode: string;

  @IsNumber({}, { message: 'La cantidad debe ser un número' })
  @IsPositive({ message: 'La cantidad debe ser mayor que 0' })
  quantity: number;

  @IsString({ message: 'El almacén origen debe ser texto' })
  @IsNotEmpty({ message: 'El almacén origen es obligatorio' })
  sourceWarehouseId: string;

  @IsString({ message: 'El almacén destino debe ser texto' })
  @IsNotEmpty({ message: 'El almacén destino es obligatorio' })
  destinationWarehouseId: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
