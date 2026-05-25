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
import { CreateFixedAssetDto, UpdateFixedAssetDto, ProcessDepreciationDto, DisposeAssetDto, RevalueAssetDto, TransferAssetDto } from './dto/fixed-asset.dto';
import * as ExcelJS from 'exceljs';
import { PDFDocument, rgb } from 'pdf-lib';

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
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const companyId = getCompanyId(req);
    const pagination: { page?: number; limit?: number } = {};
    if (page) pagination.page = parseInt(page);
    if (limit) pagination.limit = parseInt(limit);
    return this.fixedAssetsService.findAll(companyId, {
      status,
      group_number,
      search,
    }, pagination);
  }

  @Get('depreciation-catalog')
  getDepreciationCatalog(@Req() req: Request) {
    const companyId = getCompanyId(req);
    return this.fixedAssetsService.getDepreciationCatalog(companyId);
  }

  @Get('statistics')
  getStatistics(@Req() req: Request) {
    const companyId = getCompanyId(req);
    return this.fixedAssetsService.getStatistics(companyId);
  }

  @Get('accumulated-depreciation')
  getAccumulatedDepreciationReport(
    @Req() req: Request,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const companyId = getCompanyId(req);
    const yearNum = year ? parseInt(year) : new Date().getFullYear();
    const monthNum = month ? parseInt(month) : new Date().getMonth() + 1;
    return this.fixedAssetsService.getAccumulatedDepreciationReport(companyId, yearNum, monthNum);
  }

  @Get('export/excel')
  async exportExcel(@Req() req: Request, @Res() res: Response) {
    const companyId = getCompanyId(req);
    const { assets } = await this.fixedAssetsService.findAll(companyId);
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Activos Fijos');
    
    // Headers
    worksheet.columns = [
      { header: 'Código', key: 'assetCode', width: 20 },
      { header: 'Nombre', key: 'name', width: 30 },
      { header: 'Grupo', key: 'groupNumber', width: 10 },
      { header: 'Subgrupo', key: 'subgroup', width: 20 },
      { header: 'Valor Adquisición', key: 'acquisitionValue', width: 15 },
      { header: 'Valor Actual', key: 'currentValue', width: 15 },
      { header: 'Tasa Depreciación', key: 'depreciationRate', width: 15 },
      { header: 'Fecha Adquisición', key: 'acquisitionDate', width: 15 },
      { header: 'Ubicación', key: 'location', width: 20 },
      { header: 'Responsable', key: 'responsiblePerson', width: 20 },
      { header: 'Estado', key: 'status', width: 15 },
    ];
    
    // Data
    assets.forEach((asset: any) => {
      worksheet.addRow({
        assetCode: asset.assetCode,
        name: asset.name,
        groupNumber: asset.groupNumber,
        subgroup: asset.subgroup,
        acquisitionValue: Number(asset.acquisitionValue).toFixed(2),
        currentValue: Number(asset.currentValue).toFixed(2),
        depreciationRate: `${asset.depreciationRate}%`,
        acquisitionDate: asset.acquisitionDate,
        location: asset.location || '',
        responsiblePerson: asset.responsiblePerson || '',
        status: asset.status,
      });
    });
    
    // Style headers
    worksheet.getRow(1).font = { bold: true, size: 12 };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };
    
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=activos-fijos-${new Date().toISOString().split('T')[0]}.xlsx`,
    );
    
    const buffer = await workbook.xlsx.writeBuffer();
    res.send(buffer);
  }

  @Get('export/pdf')
  async exportPdf(@Req() req: Request, @Res() res: Response) {
    const companyId = getCompanyId(req);
    const { assets } = await this.fixedAssetsService.findAll(companyId);
    
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4 size
    const { width, height } = page.getSize();
    
    // Title
    page.drawText('Reporte de Activos Fijos', {
      x: 50,
      y: height - 50,
      size: 18,
      font: await pdfDoc.embedFont('Helvetica-Bold'),
    });
    
    page.drawText(`Fecha: ${new Date().toLocaleDateString('es-CU')}`, {
      x: 50,
      y: height - 80,
      size: 10,
    });
    
    // Table headers
    const headers = ['Código', 'Nombre', 'Grupo', 'Valor Adq.', 'Valor Act.', 'Estado'];
    const headerY = height - 120;
    const colWidths = [80, 150, 50, 80, 80, 60];
    let currentX = 50;

    const boldFont = await pdfDoc.embedFont('Helvetica-Bold');

    headers.forEach((header, i) => {
      page.drawText(header, {
        x: currentX,
        y: headerY,
        size: 10,
        font: boldFont,
      });
      currentX += colWidths[i];
    });
    
    // Data rows
    let currentY = headerY - 20;
    assets.forEach((asset: any) => {
      if (currentY < 50) {
        // New page
        const newPage = pdfDoc.addPage([595.28, 841.89]);
        currentY = newPage.getSize().height - 50;
      }
      
      currentX = 50;
      page.drawText(asset.assetCode || '', { x: currentX, y: currentY, size: 9 });
      currentX += colWidths[0];
      
      page.drawText((asset.name || '').substring(0, 20), { x: currentX, y: currentY, size: 9 });
      currentX += colWidths[1];
      
      page.drawText(String(asset.groupNumber || ''), { x: currentX, y: currentY, size: 9 });
      currentX += colWidths[2];
      
      page.drawText(Number(asset.acquisitionValue || 0).toFixed(2), { x: currentX, y: currentY, size: 9 });
      currentX += colWidths[3];
      
      page.drawText(Number(asset.currentValue || 0).toFixed(2), { x: currentX, y: currentY, size: 9 });
      currentX += colWidths[4];
      
      page.drawText(asset.status || '', { x: currentX, y: currentY, size: 9 });
      currentX += colWidths[5];
      
      currentY -= 15;
    });
    
    const pdfBytes = await pdfDoc.save();
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=activos-fijos-${new Date().toISOString().split('T')[0]}.pdf`,
    );
    res.send(Buffer.from(pdfBytes));
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

  @Post(':id/dispose')
  dispose(@Req() req: Request, @Param('id') id: string, @Body() body: DisposeAssetDto) {
    const companyId = getCompanyId(req);
    const userName = (req as any).user?.name || 'System';
    return this.fixedAssetsService.disposeAsset(companyId, parseInt(id), body, userName);
  }

  @Post(':id/revalue')
  revalue(@Req() req: Request, @Param('id') id: string, @Body() body: RevalueAssetDto) {
    const companyId = getCompanyId(req);
    const userName = (req as any).user?.name || 'System';
    return this.fixedAssetsService.revalueAsset(companyId, parseInt(id), body, userName);
  }

  @Post(':id/transfer')
  transfer(@Req() req: Request, @Param('id') id: string, @Body() body: TransferAssetDto) {
    const companyId = getCompanyId(req);
    const userName = (req as any).user?.name || 'System';
    return this.fixedAssetsService.transferAsset(companyId, parseInt(id), body, userName);
  }

  @Post('depreciation/process')
  processDepreciation(@Req() req: Request, @Body() body: ProcessDepreciationDto) {
    const companyId = getCompanyId(req);
    return this.fixedAssetsService.processMonthlyDepreciation(companyId, body.year, body.month);
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
