import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsEmail,
  IsNumber,
  IsBoolean,
  IsIn,
  IsArray,
  MinLength,
  ArrayMinSize,
} from 'class-validator';

export class CreateUserDto {
  @IsString({ message: 'El nombre debe ser texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  firstName: string;

  @IsString({ message: 'El apellido debe ser texto' })
  @IsNotEmpty({ message: 'El apellido es obligatorio' })
  lastName: string;

  @IsEmail({}, { message: 'El email debe tener formato válido' })
  @IsNotEmpty({ message: 'El email es obligatorio' })
  email: string;

  @IsOptional()
  @IsIn(['superadmin', 'admin', 'user', 'facturador'], { message: 'Rol inválido' })
  role?: string;

  @IsNumber({}, { message: 'El ID de empresa debe ser un número' })
  companyId: number;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsEmail({}, { message: 'El email debe tener formato válido' })
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  password?: string;

  @IsOptional()
  @IsIn(['superadmin', 'admin', 'user', 'facturador'], { message: 'Rol inválido' })
  role?: string;

  @IsOptional()
  @IsBoolean({ message: 'isActive debe ser booleano' })
  isActive?: boolean;
}

export class ChangePasswordDto {
  @IsString({ message: 'La nueva contraseña debe ser texto' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  newPassword: string;
}

export class AssignCompaniesDto {
  @IsArray({ message: 'companyIds debe ser un arreglo' })
  @ArrayMinSize(1, { message: 'Debe asignar al menos una empresa' })
  @IsNumber({}, { each: true, message: 'Cada companyId debe ser un número' })
  companyIds: number[];

  @IsOptional()
  @IsIn(['superadmin', 'admin', 'user', 'facturador'], { message: 'Rol inválido' })
  role?: string;
}
