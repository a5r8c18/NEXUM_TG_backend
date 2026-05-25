import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @IsString({ message: 'El refresh token debe ser texto' })
  @IsNotEmpty({ message: 'El refresh token es obligatorio' })
  refreshToken: string;
}

export class LoginResponseDto {
  requiresMFA?: boolean;
  accessToken?: string;
  refreshToken?: string;
  userId?: string;
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    companyId?: number;
    tenantId?: string;
  };
}
