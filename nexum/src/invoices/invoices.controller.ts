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

  /**
   * Detalle de la factura con sus comprobantes contables.
   *
   * El PDF se genera en el cliente (HTML + window.print), así que este
   * endpoint solo devuelve datos. Los comprobantes incluidos son:
   *   - Venta: 699 D / 900 H + 440-0001 H  (sourceModule='invoices')
   *   - Costo: 810/814 D / 188/189 H        (sourceModule='inventory')
   */
  @Get(':id')
  findOne(@Req() req: Request, @Param('id') id: string) {
    const companyId = getCompanyId(req);
    return this.invoicesService.findOneWithVouchers(companyId, id);
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