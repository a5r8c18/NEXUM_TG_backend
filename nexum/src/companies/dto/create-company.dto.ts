import { IsNotEmpty, IsString, IsOptional, IsEmail } from 'class-validator';

export class CreateCompanyDto {
  @IsString({ message: 'El nombre de la empresa debe ser texto' })
  @IsNotEmpty({ message: 'El nombre de la empresa es obligatorio' })
  name: string;

  @IsOptional()
  @IsString()
  tax_id?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'El email de la empresa debe tener formato válido' })
  email?: string;

  @IsOptional()
  @IsString()
  logo_path?: string;
}

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  tax_id?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'El email de la empresa debe tener formato válido' })
  email?: string;

  @IsOptional()
  @IsString()
  logo_path?: string;
}
