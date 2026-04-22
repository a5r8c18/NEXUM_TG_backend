import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { SubelementsService } from './subelements.service';
import { Subelement, SubelementCategory } from '../entities/subelement.entity';


@Controller('accounting/subelements')
export class SubelementsController {
  constructor(private readonly subelementsService: SubelementsService) {}

  @Get()
  findAll(
    @Query('category') category?: SubelementCategory,
    @Query('search') search?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.subelementsService.findAll({
      category,
      search,
      activeOnly: activeOnly === 'true',
    });
  }

  @Get('categories')
  getCategories() {
    return this.subelementsService.getCategories();
  }

  @Get('statistics')
  getStatistics() {
    return this.subelementsService.getStatistics();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.subelementsService.findOne(id);
  }

  @Get('code/:code')
  findByCode(@Param('code') code: string) {
    return this.subelementsService.findByCode(code);
  }

  @Post()
  create(@Body() body: Partial<Subelement>) {
    return this.subelementsService.create(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: Partial<Subelement>) {
    return this.subelementsService.update(id, body);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.subelementsService.delete(id);
  }
}
