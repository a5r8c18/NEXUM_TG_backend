import { IsNotEmpty, IsString, IsEmail, IsOptional, IsIn } from 'class-validator';

export class CreateTenantRequestDto {
  @IsString({ message: 'El nombre debe ser texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  firstName: string;

  @IsString({ message: 'El apellido debe ser texto' })
  @IsNotEmpty({ message: 'El apellido es obligatorio' })
  lastName: string;

  @IsEmail({}, { message: 'El email debe tener formato válido' })
  @IsNotEmpty({ message: 'El email es obligatorio' })
  email: string;

  @IsString({ message: 'El teléfono debe ser texto' })
  @IsNotEmpty({ message: 'El teléfono es obligatorio' })
  phone: string;

  @IsString({ message: 'El cargo debe ser texto' })
  @IsNotEmpty({ message: 'El cargo es obligatorio' })
  position: string;

  @IsString({ message: 'El nombre de empresa debe ser texto' })
  @IsNotEmpty({ message: 'El nombre de empresa es obligatorio' })
  companyName: string;

  @IsString({ message: 'La industria debe ser texto' })
  @IsNotEmpty({ message: 'La industria es obligatoria' })
  industry: string;

  @IsString({ message: 'El país debe ser texto' })
  @IsNotEmpty({ message: 'El país es obligatorio' })
  country: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsIn(['MULTI_COMPANY', 'SINGLE_COMPANY'], { message: 'Tipo de tenant inválido' })
  tenantType: 'MULTI_COMPANY' | 'SINGLE_COMPANY';

  @IsString({ message: 'El caso de uso debe ser texto' })
  @IsNotEmpty({ message: 'El caso de uso es obligatorio' })
  useCase: string;

  @IsString({ message: 'El mensaje debe ser texto' })
  @IsNotEmpty({ message: 'El mensaje es obligatorio' })
  message: string;

  @IsOptional()
  @IsString()
  referralSource?: string;
}

export class ApproveRequestDto {
  @IsOptional()
  @IsString()
  adminNotes?: string;
}

export class RejectRequestDto {
  @IsString({ message: 'El motivo de rechazo debe ser texto' })
  @IsNotEmpty({ message: 'El motivo de rechazo es obligatorio' })
  rejectionReason: string;

  @IsOptional()
  @IsString()
  adminNotes?: string;
}
