import {
  IsNotEmpty,
  IsString,
  IsDateString,
  IsOptional,
  IsNumber,
} from 'class-validator';

export class CreateFiscalYearDto {
  @IsString({ message: 'El nombre debe ser texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  name: string;

  @IsDateString({}, { message: 'La fecha de inicio debe ser válida' })
  startDate: string;

  @IsDateString({}, { message: 'La fecha de fin debe ser válida' })
  endDate: string;

  @IsOptional()
  @IsNumber()
  periodsCount?: number;
}
