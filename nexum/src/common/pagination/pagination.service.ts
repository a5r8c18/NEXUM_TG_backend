/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable } from '@nestjs/common';
import { Repository, SelectQueryBuilder, ObjectLiteral } from 'typeorm';
import {
  PaginationDto,
  PaginationResult,
  PaginationOptions,
} from './pagination.dto';

@Injectable()
export class PaginationService {
  /**
   * Apply pagination to a TypeORM query builder
   */
  async paginate<T extends ObjectLiteral>(
    queryBuilder: SelectQueryBuilder<T>,
    paginationDto: PaginationDto,
  ): Promise<PaginationResult<T>> {
    const { page, limit, calculatedOffset, calculatedLimit } = paginationDto;

    // Default values if undefined
    const currentPage = page || 1;
    const currentLimit = calculatedLimit || limit || 10;

    // Get total count
    const totalQuery = queryBuilder.clone();
    const total = await totalQuery.getCount();

    // Apply pagination
    queryBuilder.skip(calculatedOffset || 0).take(currentLimit);

    // Get paginated data
    const data = await queryBuilder.getMany();

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / currentLimit);
    const hasNext = currentPage < totalPages;
    const hasPrevious = currentPage > 1;

    return {
      data,
      pagination: {
        page: currentPage,
        limit: currentLimit,
        total,
        totalPages,
        hasNext,
        hasPrevious,
      },
    };
  }

  /**
   * Apply pagination to a repository
   */
  async paginateRepository<T extends Record<string, any>>(
    repository: Repository<T>,
    paginationDto: PaginationDto,
    where?: any,
    order?: any,
  ): Promise<PaginationResult<T>> {
    const { page, limit, calculatedOffset, calculatedLimit } = paginationDto;

    // Default values if undefined
    const currentPage = page || 1;
    const currentLimit = calculatedLimit || limit || 10;

    // Get total count
    const total = await repository.count({ where });

    // Get paginated data
    const data = await repository.find({
      where,
      order,
      skip: calculatedOffset || 0,
      take: currentLimit,
    });

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / currentLimit);
    const hasNext = currentPage < totalPages;
    const hasPrevious = currentPage > 1;

    return {
      data,
      pagination: {
        page: currentPage,
        limit: currentLimit,
        total,
        totalPages,
        hasNext,
        hasPrevious,
      },
    };
  }

  /**
   * Create paginated response for custom queries
   */
  createPaginatedResponse<T>(
    data: T[],
    total: number,
    paginationDto: PaginationDto,
  ): PaginationResult<T> {
    const { page, limit, calculatedLimit } = paginationDto;

    // Default values if undefined
    const currentPage = page || 1;
    const currentLimit = calculatedLimit || limit || 10;

    const totalPages = Math.ceil(total / currentLimit);
    const hasNext = currentPage < totalPages;
    const hasPrevious = currentPage > 1;

    return {
      data,
      pagination: {
        page: currentPage,
        limit: currentLimit,
        total,
        totalPages,
        hasNext,
        hasPrevious,
      },
    };
  }

  /**
   * Apply search and sorting to query builder
   */
  applySearchAndSort<T extends ObjectLiteral>(
    queryBuilder: SelectQueryBuilder<T>,
    searchPaginationDto: any,
    searchableFields: string[],
  ): SelectQueryBuilder<T> {
    const { search, sortBy, sortOrder } = searchPaginationDto;

    // Apply search
    if (search && searchableFields.length > 0) {
      const searchConditions = searchableFields
        .map((field) => `${field} ILIKE :search`)
        .join(' OR ');

      queryBuilder.andWhere(`(${searchConditions})`, { search: `%${search}%` });
    }

    // Apply sorting
    if (sortBy) {
      queryBuilder.addOrderBy(`"${sortBy}"`, sortOrder || 'DESC');
    } else {
      // Default sorting
      queryBuilder.orderBy('createdAt', 'DESC');
    }

    return queryBuilder;
  }

  /**
   * Get pagination metadata for frontend
   */
  getPaginationInfo(paginationResult: PaginationResult<any>) {
    const { pagination } = paginationResult;

    return {
      currentPage: pagination.page,
      pageSize: pagination.limit,
      totalItems: pagination.total,
      totalPages: pagination.totalPages,
      hasNextPage: pagination.hasNext,
      hasPreviousPage: pagination.hasPrevious,
      isFirstPage: pagination.page === 1,
      isLastPage: pagination.page === pagination.totalPages,
      startIndex: (pagination.page - 1) * pagination.limit + 1,
      endIndex: Math.min(pagination.page * pagination.limit, pagination.total),
    };
  }
}
