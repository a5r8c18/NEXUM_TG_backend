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
import { StockLimitsService } from './stock-limits.service';

@Controller('stock-limits')
export class StockLimitsController {
  constructor(private readonly stockLimitsService: StockLimitsService) {}

  @Get()
  findAll(
    @Query('companyId') companyId?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.stockLimitsService.findAll(companyId, warehouseId);
  }

  @Get('warnings')
  getWarnings(
    @Query('companyId') companyId?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.stockLimitsService.getWarnings(companyId, warehouseId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.stockLimitsService.findOne(id);
  }

  @Post()
  create(@Body() body: any) {
    return this.stockLimitsService.create(body);
  }

  @Post('bulk')
  bulkCreate(@Body() body: any[]) {
    return this.stockLimitsService.bulkCreate(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.stockLimitsService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.stockLimitsService.remove(id);
  }
}
