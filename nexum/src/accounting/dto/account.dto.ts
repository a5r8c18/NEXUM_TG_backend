import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsIn,
} from 'class-validator';
import { AccountType, AccountNature } from '../../entities/account.entity';

export class CreateAccountDto {
  @IsString({ message: 'El código debe ser texto' })
  @IsNotEmpty({ message: 'El código es obligatorio' })
  code: string;

  @IsString({ message: 'El nombre debe ser texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(['asset', 'liability', 'equity', 'income', 'expense'], {
    message: 'Tipo de cuenta inválido',
  })
  type: AccountType;

  @IsIn(['deudora', 'acreedora'], {
    message: 'Naturaleza inválida. Valores: deudora, acreedora',
  })
  nature: AccountNature;

  @IsNumber({}, { message: 'El nivel debe ser un número' })
  level: number;

  @IsOptional()
  @IsString()
  groupNumber?: string;

  @IsOptional()
  @IsString()
  parentCode?: string;

  @IsOptional()
  @IsString()
  parentAccountId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  allowsMovements?: boolean;
}

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['asset', 'liability', 'equity', 'income', 'expense'])
  type?: AccountType;

  @IsOptional()
  @IsIn(['deudora', 'acreedora'])
  nature?: AccountNature;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  allowsMovements?: boolean;
}

export class CreateSubaccountDto {
  @IsString({ message: 'El código de subcuenta es obligatorio' })
  @IsNotEmpty()
  subaccountCode: string;

  @IsString({ message: 'El nombre de subcuenta es obligatorio' })
  @IsNotEmpty()
  subaccountName: string;

  @IsString({ message: 'El ID de cuenta padre es obligatorio' })
  @IsNotEmpty()
  accountId: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
