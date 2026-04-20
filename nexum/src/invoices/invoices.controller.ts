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
import { InvoicesService } from './invoices.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { getCompanyId } from '../common/get-company-id';
import { CreateInvoiceDto, UpdateInvoiceDto, UpdateInvoiceStatusDto } from './dto/create-invoice.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER, UserRole.FACTURADOR)
@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

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
    const companyId = getCompanyId(req);
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
    const companyId = getCompanyId(req);
    return this.invoicesService.getStatistics(companyId);
  }

  @Get(':id')
  findOne(@Req() req: Request, @Param('id') id: string) {
    const companyId = getCompanyId(req);
    return this.invoicesService.findOne(companyId, id);
  }

  @Get(':id/pdf')
  downloadPdf(
    @Req() req: Request,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const companyId = getCompanyId(req);
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
    const companyId = getCompanyId(req);
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
  create(@Req() req: Request, @Body() body: CreateInvoiceDto) {
    const companyId = getCompanyId(req);
    return this.invoicesService.create(companyId, body);
  }

  @Put(':id')
  update(@Req() req: Request, @Param('id') id: string, @Body() body: UpdateInvoiceDto) {
    const companyId = getCompanyId(req);
    return this.invoicesService.update(companyId, id, body);
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) {
    const companyId = getCompanyId(req);
    return this.invoicesService.remove(companyId, id);
  }

  @Put(':id/status')
  async updateStatus(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpdateInvoiceStatusDto,
  ) {
    const companyId = getCompanyId(req);
    const result = await this.invoicesService.updateStatus(companyId, id, body.status);

    const user = (req as any).user;
    this.notificationsGateway.emitInvoiceUpdate({
      invoiceId: id,
      status: body.status,
      companyId,
      tenantId: user?.tenantId || '',
    });

    return result;
  }
}
