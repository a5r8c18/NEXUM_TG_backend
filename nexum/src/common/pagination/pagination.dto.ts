import { IsOptional, IsInt, IsPositive, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Min(1)
  @Max(100)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  offset?: number;

  get calculatedOffset(): number {
    if (this.offset !== undefined) {
      return this.offset;
    }
    return ((this.page || 1) - 1) * (this.limit || 10);
  }

  get calculatedLimit(): number {
    return Math.min(this.limit || 10, 100);
  }
}

export interface PaginationResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
  offset?: number;
}

export class SearchPaginationDto extends PaginationDto {
  @IsOptional()
  search?: string;

  @IsOptional()
  sortBy?: string;

  @IsOptional()
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}
