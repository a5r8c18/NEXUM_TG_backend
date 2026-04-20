import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Res,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { FixedAssetsService } from './fixed-assets.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';
import { getCompanyId } from '../common/get-company-id';
import { CreateFixedAssetDto, UpdateFixedAssetDto, ProcessDepreciationDto } from './dto/fixed-asset.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER)
@Controller('fixed-assets')
export class FixedAssetsController {
  constructor(private readonly fixedAssetsService: FixedAssetsService) {}

  @Get()
  findAll(
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('group_number') group_number?: string,
    @Query('search') search?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.fixedAssetsService.findAll(companyId, {
      status,
      group_number,
      search,
    });
  }

  @Get('depreciation-catalog')
  getDepreciationCatalog() {
    return this.fixedAssetsService.getDepreciationCatalog();
  }

  @Post('process-depreciation')
  processDepreciation(
    @Req() req: Request,
    @Body() body: ProcessDepreciationDto,
  ) {
    const companyId = getCompanyId(req);
    return this.fixedAssetsService.processMonthlyDepreciation(
      companyId,
      body.year,
      body.month,
    );
  }

  @Get('statistics')
  getStatistics(@Req() req: Request) {
    const companyId = getCompanyId(req);
    return this.fixedAssetsService.getStatistics(companyId);
  }

  @Get('export/excel')
  exportExcel(@Res() res: Response) {
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=activos-fijos.xlsx',
    );
    res.send(Buffer.from('Excel placeholder for fixed assets'));
  }

  @Get('export/pdf')
  exportPdf(@Res() res: Response) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=activos-fijos.pdf',
    );
    res.send(Buffer.from('PDF placeholder for fixed assets'));
  }

  @Get(':id')
  findOne(@Req() req: Request, @Param('id') id: string) {
    const companyId = getCompanyId(req);
    return this.fixedAssetsService.findOne(companyId, parseInt(id));
  }

  @Post()
  create(@Req() req: Request, @Body() body: CreateFixedAssetDto) {
    const companyId = getCompanyId(req);
    return this.fixedAssetsService.create(companyId, body);
  }

  @Put(':id')
  update(@Req() req: Request, @Param('id') id: string, @Body() body: UpdateFixedAssetDto) {
    const companyId = getCompanyId(req);
    return this.fixedAssetsService.update(companyId, parseInt(id), body);
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) {
    const companyId = getCompanyId(req);
    return this.fixedAssetsService.remove(companyId, parseInt(id));
  }
}
