import { IsString, IsNumber, IsOptional, IsDateString, IsUUID, Min, MaxLength } from 'class-validator';

export class CreateReconciliationDto {
  @IsUUID()
  bankAccountId: string;

  @IsDateString()
  reconciliationDate: string;

  @IsNumber()
  @Min(0)
  statementBalance: number;

  @IsNumber()
  @Min(0)
  bookBalance: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  depositsInTransit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  outstandingChecks?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  bankCharges?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  interestEarned?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
