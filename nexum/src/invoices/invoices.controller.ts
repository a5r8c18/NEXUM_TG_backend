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
import { InvoicesService } from './invoices.service';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  findAll(
    @Req() req: Request,
    @Query('customerName') customerName?: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const companyId = (req.query.companyId as string)
      ? parseInt(req.query.companyId as string)
      : 1;
    return this.invoicesService.findAll(companyId, {
      customerName,
      status,
      startDate,
      endDate,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Get('statistics')
  getStatistics(@Req() req: Request) {
    const companyId = (req.query.companyId as string)
      ? parseInt(req.query.companyId as string)
      : 1;
    return this.invoicesService.getStatistics(companyId);
  }

  @Get(':id')
  findOne(@Req() req: Request, @Param('id') id: string) {
    const companyId = (req.query.companyId as string)
      ? parseInt(req.query.companyId as string)
      : 1;
    return this.invoicesService.findOne(companyId, id);
  }

  @Get(':id/pdf')
  downloadPdf(
    @Req() req: Request,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const companyId = (req.query.companyId as string)
      ? parseInt(req.query.companyId as string)
      : 1;
    const invoice = this.invoicesService.findOne(companyId, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=factura-${id}.pdf`,
    );
    res.send(Buffer.from(`PDF placeholder for invoice ${id}`));
  }

  @Get(':id/excel')
  downloadExcel(
    @Req() req: Request,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const companyId = (req.query.companyId as string)
      ? parseInt(req.query.companyId as string)
      : 1;
    const invoice = this.invoicesService.findOne(companyId, id);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=factura-${id}.xlsx`,
    );
    res.send(Buffer.from(`Excel placeholder for invoice ${id}`));
  }

  @Post()
  create(@Req() req: Request, @Body() body: any) {
    const companyId = (req.body.companyId as string)
      ? parseInt(req.body.companyId as string)
      : 1;
    return this.invoicesService.create(companyId, body);
  }

  @Put(':id')
  update(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const companyId = (req.body.companyId as string)
      ? parseInt(req.body.companyId as string)
      : 1;
    return this.invoicesService.update(companyId, id, body);
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) {
    const companyId = (req.query.companyId as string)
      ? parseInt(req.query.companyId as string)
      : 1;
    return this.invoicesService.remove(companyId, id);
  }

  @Put(':id/status')
  updateStatus(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { status: string },
  ) {
    const companyId = (req.body.companyId as string)
      ? parseInt(req.body.companyId as string)
      : 1;
    return this.invoicesService.updateStatus(companyId, id, body.status);
  }
}
