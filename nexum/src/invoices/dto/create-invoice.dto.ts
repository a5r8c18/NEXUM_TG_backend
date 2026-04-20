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
  Min,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class InvoiceItemDto {
  @IsString({ message: 'El código de producto debe ser texto' })
  @IsNotEmpty({ message: 'El código de producto es obligatorio' })
  productCode: string;

  @IsString({ message: 'La descripción debe ser texto' })
  @IsNotEmpty({ message: 'La descripción es obligatoria' })
  description: string;

  @IsNumber({}, { message: 'La cantidad debe ser un número' })
  @IsPositive({ message: 'La cantidad debe ser mayor que 0' })
  quantity: number;

  @IsNumber({}, { message: 'El precio unitario debe ser un número' })
  @IsPositive({ message: 'El precio unitario debe ser mayor que 0' })
  unitPrice: number;

  @IsOptional()
  @IsNumber({}, { message: 'El monto debe ser un número' })
  @Min(0, { message: 'El monto no puede ser negativo' })
  amount?: number;
}

export class CreateInvoiceDto {
  @IsString({ message: 'El número de factura debe ser texto' })
  @IsNotEmpty({ message: 'El número de factura es obligatorio' })
  invoiceNumber: string;

  @IsString({ message: 'El nombre del cliente debe ser texto' })
  @IsNotEmpty({ message: 'El nombre del cliente es obligatorio' })
  customerName: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  customerAddress?: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsDateString({}, { message: 'La fecha debe tener formato de fecha válido' })
  date: string;

  @IsOptional()
  @IsNumber({}, { message: 'El subtotal debe ser un número' })
  @Min(0, { message: 'El subtotal no puede ser negativo' })
  subtotal?: number;

  @IsOptional()
  @IsNumber({}, { message: 'La tasa de impuesto debe ser un número' })
  @Min(0, { message: 'La tasa de impuesto no puede ser negativa' })
  taxRate?: number;

  @IsOptional()
  @IsNumber({}, { message: 'El monto de impuesto debe ser un número' })
  @Min(0, { message: 'El monto de impuesto no puede ser negativo' })
  taxAmount?: number;

  @IsOptional()
  @IsNumber({}, { message: 'El descuento debe ser un número' })
  @Min(0, { message: 'El descuento no puede ser negativo' })
  discount?: number;

  @IsOptional()
  @IsNumber({}, { message: 'El total debe ser un número' })
  @Min(0, { message: 'El total no puede ser negativo' })
  total?: number;

  @IsOptional()
  @IsIn(['pending', 'paid', 'cancelled'], { message: 'Estado inválido. Valores permitidos: pending, paid, cancelled' })
  status?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  createdByName?: string;

  @IsArray({ message: 'Los items deben ser un arreglo' })
  @ArrayMinSize(1, { message: 'Debe incluir al menos un item' })
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items: InvoiceItemDto[];
}

export class UpdateInvoiceDto {
  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  customerAddress?: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha debe tener formato de fecha válido' })
  date?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  subtotal?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  taxRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  taxAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  total?: number;

  @IsOptional()
  @IsIn(['pending', 'paid', 'cancelled'])
  status?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items?: InvoiceItemDto[];
}

export class UpdateInvoiceStatusDto {
  @IsString({ message: 'El estado debe ser texto' })
  @IsIn(['pending', 'paid', 'cancelled'], { message: 'Estado inválido. Valores permitidos: pending, paid, cancelled' })
  status: string;
}
