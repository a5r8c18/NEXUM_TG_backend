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
import { RegistrationRequestsService } from './registration-requests.service';
import { RegistrationRequest } from '../entities/registration-request.entity';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly registrationRequestsService: RegistrationRequestsService,
  ) {}

  // Obtener todas las solicitudes pendientes
  @Get('requests/pending')
  getPendingRequests(): Promise<RegistrationRequest[]> {
    return this.registrationRequestsService.getPendingRequests();
  }

  // Obtener todas las solicitudes con filtros
  @Get('requests')
  getAllRequests(
    @Query('status') status?: 'PENDING' | 'APPROVED' | 'DENIED',
  ): Promise<RegistrationRequest[]> {
    return this.registrationRequestsService.getAllRequests(status);
  }

  // Aprobar solicitud
  @Put('requests/:requestId/approve')
  approveRequest(
    @Param('requestId') requestId: string,
    @Body() body: { approvedBy: string },
  ) {
    return this.registrationRequestsService.approveRequest(
      requestId,
      body.approvedBy,
    );
  }

  // Denegar solicitud
  @Put('requests/:requestId/deny')
  denyRequest(
    @Param('requestId') requestId: string,
    @Body() body: { reason: string; deniedBy: string },
  ) {
    return this.registrationRequestsService.denyRequest(
      requestId,
      body.reason,
      body.deniedBy,
    );
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
