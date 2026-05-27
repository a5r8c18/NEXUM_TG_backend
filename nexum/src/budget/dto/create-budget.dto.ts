import { IsString, IsNumber, IsOptional, IsDateString, MaxLength, Min } from 'class-validator';

export class CreateBudgetDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(2000)
  @Max(2100)
  year: number;

  @IsOptional()
  @IsString()
  status?: 'draft' | 'approved' | 'active' | 'closed';

  @IsOptional()
  lines?: CreateBudgetLineDto[];
}

export class CreateBudgetLineDto {
  @IsString()
  accountCode: string;

  @IsString()
  @MaxLength(255)
  accountName: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(12)
  month?: number;

  @IsNumber()
  @Min(0)
  plannedAmount: number;

  @IsOptional()
  @IsNumber()
  actualAmount?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
