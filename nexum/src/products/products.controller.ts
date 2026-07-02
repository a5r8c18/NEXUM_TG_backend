import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  NotFoundException,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProductCategory } from '../entities/product.entity';

@UseGuards(JwtAuthGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async findAll(
    @Request() req,
    @Query('search') search?: string,
    @Query('category') category?: ProductCategory,
    @Query('isActive') isActive?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const companyId = req.user.companyId;
    const filters: any = {};
    
    if (search) filters.search = search;
    if (category) filters.category = category;
    if (isActive !== undefined) filters.isActive = isActive === 'true';
    if (page) filters.page = parseInt(page);
    if (limit) filters.limit = parseInt(limit);

    return await this.productsService.findAll(companyId, filters);
  }

  @Get('statistics')
  async getStatistics(@Request() req) {
    const companyId = req.user.companyId;
    return await this.productsService.getStatistics(companyId);
  }

  @Get(':id')
  async findOne(@Request() req, @Param('id') id: string) {
    const companyId = req.user.companyId;
    return await this.productsService.findOne(companyId, parseInt(id));
  }

  @Get('code/:productCode')
  async findByCode(@Request() req, @Param('productCode') productCode: string) {
    const companyId = req.user.companyId;
    const product = await this.productsService.findByCode(companyId, productCode);
    if (!product) {
      throw new NotFoundException(`Producto con código ${productCode} no encontrado`);
    }
    return product;
  }

  @Post()
  async create(@Request() req, @Body() data: any) {
    const companyId = req.user.companyId;
    return await this.productsService.create(companyId, data);
  }

  @Put(':id')
  async update(@Request() req, @Param('id') id: string, @Body() data: any) {
    const companyId = req.user.companyId;
    return await this.productsService.update(companyId, parseInt(id), data);
  }

  @Put(':id/deactivate')
  async deactivate(@Request() req, @Param('id') id: string) {
    const companyId = req.user.companyId;
    return await this.productsService.deactivate(companyId, parseInt(id));
  }
}
