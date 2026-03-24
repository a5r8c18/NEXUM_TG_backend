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
} from '@nestjs/common';
import { Request, Response } from 'express';
import { FixedAssetsService } from './fixed-assets.service';

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
    const companyId = (req.query.companyId as string)
      ? parseInt(req.query.companyId as string)
      : 1;
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

  @Get('statistics')
  getStatistics(@Req() req: Request) {
    const companyId = (req.query.companyId as string)
      ? parseInt(req.query.companyId as string)
      : 1;
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
    const companyId = (req.query.companyId as string)
      ? parseInt(req.query.companyId as string)
      : 1;
    return this.fixedAssetsService.findOne(companyId, parseInt(id));
  }

  @Post()
  create(@Req() req: Request, @Body() body: any) {
    const companyId = (req.body.companyId as string)
      ? parseInt(req.body.companyId as string)
      : 1;
    return this.fixedAssetsService.create(companyId, body);
  }

  @Put(':id')
  update(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const companyId = (req.body.companyId as string)
      ? parseInt(req.body.companyId as string)
      : 1;
    return this.fixedAssetsService.update(companyId, parseInt(id), body);
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) {
    const companyId = (req.query.companyId as string)
      ? parseInt(req.query.companyId as string)
      : 1;
    return this.fixedAssetsService.remove(companyId, parseInt(id));
  }
}
