/* eslint-disable @typescript-eslint/no-unused-vars */
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
  Req,
} from '@nestjs/common';
import { RegistrationRequestsService } from './registration-requests.service';
import { RegistrationRequest } from '../entities/registration-request.entity';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.guard';
import { UserRole } from '../entities/user.entity';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN)
export class AdminController {
  constructor(
    private readonly registrationRequestsService: RegistrationRequestsService,
  ) {}

  // Obtener todas las solicitudes pendientes
  @Get('requests/pending')
  async getPendingRequests() {
    const requests =
      await this.registrationRequestsService.getPendingRequests();

    // Mapear los campos al formato que espera el frontend
    return requests.map((req) => ({
      id: req.id,
      firstName: req.firstName,
      lastName: req.lastName,
      email: req.email,
      phone: req.phone,
      position: req.position,
      companyName: req.companyName,
      industry: req.industry,
      country: req.country,
      website: req.website,
      tenantType: req.requestedTenantType, // Mapear requestedTenantType a tenantType
      useCase: req.useCase,
      message: req.message,
      referralSource: req.referralSource,
      status: req.status,
      requestedAt: req.createdAt, // Mapear createdAt a requestedAt
      reviewedAt: req.approvedAt || req.deniedAt,
      reviewedBy: req.approvedBy || req.deniedBy,
      adminNotes: req.adminNotes, // Obtener las notas de admin de la base de datos
      rejectionReason: req.denialReason,
    }));
  }

  // Obtener todas las solicitudes con filtros
  @Get('requests')
  async getAllRequests(
    @Query('status') status?: 'PENDING' | 'APPROVED' | 'DENIED',
  ) {
    const requests =
      await this.registrationRequestsService.getAllRequests(status);

    // Mapear los campos al formato que espera el frontend
    return requests.map((req) => ({
      id: req.id,
      firstName: req.firstName,
      lastName: req.lastName,
      email: req.email,
      phone: req.phone,
      position: req.position,
      companyName: req.companyName,
      industry: req.industry,
      country: req.country,
      website: req.website,
      tenantType: req.requestedTenantType, // Mapear requestedTenantType a tenantType
      useCase: req.useCase,
      message: req.message,
      referralSource: req.referralSource,
      status: req.status,
      requestedAt: req.createdAt, // Mapear createdAt a requestedAt
      reviewedAt: req.approvedAt || req.deniedAt,
      reviewedBy: req.approvedBy || req.deniedBy,
      adminNotes: req.adminNotes, // Obtener las notas de admin de la base de datos
      rejectionReason: req.denialReason,
    }));
  }

  // Aprobar solicitud
  @Put('requests/:requestId/approve')
  async approveRequest(
    @Param('requestId') requestId: string,
    @Body() body: { approvedBy: string; adminNotes?: string },
  ) {
    console.log('🔍 ADMIN CONTROLLER - Approve request with ID:', requestId);
    console.log('🔍 ADMIN CONTROLLER - Approved by:', body.approvedBy);
    console.log('🔍 ADMIN CONTROLLER - Admin notes:', body.adminNotes);

    const result = await this.registrationRequestsService.approveRequest(
      requestId,
      body.approvedBy,
      body.adminNotes,
    );

    console.log('✅ ADMIN CONTROLLER - Request approved successfully');
    return result;
  }

  // Denegar solicitud
  @Put('requests/:requestId/deny')
  async denyRequest(
    @Param('requestId') requestId: string,
    @Body() body: { reason: string; deniedBy: string; adminNotes?: string },
  ) {
    console.log('🔍 ADMIN CONTROLLER - Deny request with ID:', requestId);
    console.log('🔍 ADMIN CONTROLLER - Reason:', body.reason);
    console.log('🔍 ADMIN CONTROLLER - Denied by:', body.deniedBy);
    console.log('🔍 ADMIN CONTROLLER - Admin notes:', body.adminNotes);

    const result = await this.registrationRequestsService.denyRequest(
      requestId,
      body.reason,
      body.deniedBy,
      body.adminNotes,
    );

    console.log('✅ ADMIN CONTROLLER - Request denied successfully');
    return result;
  }

  // Estadísticas de solicitudes
  @Get('requests/statistics')
  getStatistics() {
    return this.registrationRequestsService.getStatistics();
  }

  // Generar token de aprobación manual (para admin)
  @Post('tokens/generate')
  generateApprovalToken(
    @Body()
    body: {
      email: string;
      tenantType: 'MULTI_COMPANY' | 'SINGLE_COMPANY';
      createdBy: string;
    },
  ) {
    const token =
      'approved-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

    // Aquí podríamos guardar el token en una base de datos o memoria
    return {
      message: 'Token de aprobación generado',
      token,
      email: body.email,
      tenantType: body.tenantType,
      url: `/signup?token=${token}`,
    };
  }
}
