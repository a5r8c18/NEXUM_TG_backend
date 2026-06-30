// create-purchase.dto.ts
import { IsNotEmpty, IsString, IsOptional, IsArray, ValidateNested, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class PurchaseProductDto {
  @IsString()
  @IsNotEmpty()
  product_code: string;

  @IsString()
  @IsNotEmpty()
  product_name: string;

  @IsNumber()
  @Min(0.01)
  quantity: number;

  @IsNumber()
  @Min(0)
  unit_price: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  expiration_date?: string;
}

export class CreatePurchaseDto {
  @IsString()
  @IsNotEmpty()
  entity: string;

  @IsString()
  @IsNotEmpty()
  warehouse: string;

  @IsString()
  @IsNotEmpty()
  supplier: string;

  @IsString()
  @IsNotEmpty()
  document: string;

  // 👇 NUEVOS CAMPOS OPCIONALES
  @IsOptional()
  @IsString()
  debitAccountCode?: string;

  @IsOptional()
  @IsString()
  creditAccountCode?: string;

  // Transportista y responsables (para reportes de recepción)
  @IsOptional()
  transportista?: {
    nombre?: string;
    ci?: string;
    chapa?: string;
  };

  @IsOptional()
  responsables?: {
    jefeAlmacen?: string;
    recepcionadoPor?: string;
    anotadoPor?: string;
    contabilizadoPor?: string;
  };

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseProductDto)
  products: PurchaseProductDto[];
}