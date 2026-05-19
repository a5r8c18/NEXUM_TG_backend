import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { PhysicalCountService } from './physical-count.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PhysicalCountStatus } from '../entities/physical-count.entity';

@UseGuards(JwtAuthGuard)
@Controller('physical-count')
export class PhysicalCountController {
  constructor(private readonly physicalCountService: PhysicalCountService) {}

  @Get()
  async findAll(
    @Request() req,
    @Query('status') status?: PhysicalCountStatus,
    @Query('warehouseId') warehouseId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const companyId = req.user.companyId;
    const filters: any = {};
    
    if (status) filters.status = status;
    if (warehouseId) filters.warehouseId = warehouseId;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (page) filters.page = parseInt(page);
    if (limit) filters.limit = parseInt(limit);

    return await this.physicalCountService.findAll(companyId, filters);
  }

  @Get('statistics')
  async getStatistics(@Request() req) {
    const companyId = req.user.companyId;
    return await this.physicalCountService.getStatistics(companyId);
  }

  @Get(':id')
  async findOne(@Request() req, @Param('id') id: string) {
    const companyId = req.user.companyId;
    return await this.physicalCountService.findOne(companyId, id);
  }

  @Post()
  async create(@Request() req, @Body() data: any) {
    const companyId = req.user.companyId;
    data.createdBy = req.user.email;
    return await this.physicalCountService.create(companyId, data);
  }

  @Put(':id/start')
  async startCount(@Request() req, @Param('id') id: string) {
    const companyId = req.user.companyId;
    return await this.physicalCountService.startCount(companyId, id);
  }

  @Put(':id/items/:itemId')
  async updateItem(
    @Request() req,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() data: any,
  ) {
    const companyId = req.user.companyId;
    return await this.physicalCountService.updateItem(companyId, id, itemId, data);
  }

  @Put(':id/complete')
  async completeCount(@Request() req, @Param('id') id: string) {
    const companyId = req.user.companyId;
    return await this.physicalCountService.completeCount(companyId, id, req.user.email);
  }

  @Put(':id/approve')
  async approveCount(@Request() req, @Param('id') id: string) {
    const companyId = req.user.companyId;
    return await this.physicalCountService.approveCount(companyId, id, req.user.email);
  }

  @Put(':id/cancel')
  async cancelCount(@Request() req, @Param('id') id: string) {
    const companyId = req.user.companyId;
    return await this.physicalCountService.cancelCount(companyId, id, req.user.email);
  }
}
