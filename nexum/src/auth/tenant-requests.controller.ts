/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Param,
  HttpException,
  HttpStatus,
  UseGuards,
  Req,
} from '@nestjs/common';
import { RegistrationRequestsService } from './registration-requests.service';
import { RegistrationRequest } from '../entities/registration-request.entity';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.guard';
import { UserRole } from '../entities/user.entity';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { v4 as uuidv4 } from 'uuid';
import { CreateTenantRequestDto, ApproveRequestDto, RejectRequestDto } from './dto';

@Controller('api/tenant-requests')
export class TenantRequestsController {
  constructor(
    private readonly registrationRequestsService: RegistrationRequestsService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  // Crear nueva solicitud de tenant (equivalente a tenant request del frontend)
  @Post()
  async createRequest(@Body() requestData: CreateTenantRequestDto) {
    try {
      // Mapear los datos del frontend al formato del backend
      const mappedData = {
        firstName: requestData.firstName,
        lastName: requestData.lastName,
        email: requestData.email,
        password: 'temp-password', // Se generará después de aprobación
        requestedTenantType: requestData.tenantType,
        phone: requestData.phone,
        position: requestData.position,
        companyName: requestData.companyName,
        industry: requestData.industry,
        country: requestData.country,
        website: requestData.website,
        useCase: requestData.useCase,
        message: requestData.message,
        referralSource: requestData.referralSource,
      };

      const result =
        await this.registrationRequestsService.createRequest(mappedData);

      // Retornar la solicitud creada con los datos adicionales del frontend
      const response: RegistrationRequest = {
        id: result.requestId,
        firstName: requestData.firstName,
        lastName: requestData.lastName,
        email: requestData.email,
        password: 'temp-password',
        requestedTenantType: requestData.tenantType,
        status: 'PENDING',
        requestedAt: new Date(),
        // Campos adicionales del frontend (no están en la entidad pero los incluimos para respuesta)
        phone: requestData.phone,
        position: requestData.position,
        companyName: requestData.companyName,
        industry: requestData.industry,
        country: requestData.country,
        website: requestData.website,
        useCase: requestData.useCase,
        message: requestData.message,
        referralSource: requestData.referralSource,
      } as any;

      // Notificar a superadmins via WebSocket
      this.notificationsGateway.notifySuperadmins({
        id: uuidv4(),
        title: 'Nueva solicitud de acceso',
        message: `${requestData.firstName} ${requestData.lastName} (${requestData.companyName}) solicita acceso al sistema`,
        type: 'info',
        timestamp: new Date().toISOString(),
      });

      return response;
    } catch (error) {
      console.error('Error creating tenant request:', error);
      throw new HttpException(
        'Error al crear la solicitud de tenant',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Obtener todas las solicitudes (solo superadmin)
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  async getAllRequests() {
    try {
      return await this.registrationRequestsService.getAllRequests();
    } catch (error) {
      console.error('Error getting tenant requests:', error);
      throw new HttpException(
        'Error al obtener las solicitudes',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Aprobar solicitud (solo superadmin)
  @Put(':email/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  async approveRequest(
    @Param('email') email: string,
    @Body() body: ApproveRequestDto,
  ) {
    try {
      const result = await this.registrationRequestsService.approveRequest(
        email,
        body.adminNotes || 'admin@nexum.com',
      );

      this.notificationsGateway.broadcastNotification({
        id: uuidv4(),
        title: 'Solicitud aprobada',
        message: `La solicitud de ${email} ha sido aprobada`,
        type: 'success',
        timestamp: new Date().toISOString(),
      });
      this.notificationsGateway.emitTenantRequestUpdate({
        action: 'approved',
        email,
        status: 'APPROVED',
      });

      return result;
    } catch (error) {
      console.error('Error approving request:', error);
      throw new HttpException(
        'Error al aprobar la solicitud',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Denegar solicitud (solo superadmin)
  @Put(':email/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  async rejectRequest(
    @Param('email') email: string,
    @Body() body: RejectRequestDto,
  ) {
    try {
      const result = await this.registrationRequestsService.denyRequest(
        email,
        body.rejectionReason,
        body.adminNotes || 'admin@nexum.com',
      );

      this.notificationsGateway.broadcastNotification({
        id: uuidv4(),
        title: 'Solicitud rechazada',
        message: `La solicitud de ${email} ha sido rechazada`,
        type: 'warning',
        timestamp: new Date().toISOString(),
      });
      this.notificationsGateway.emitTenantRequestUpdate({
        action: 'rejected',
        email,
        status: 'DENIED',
      });

      return result;
    } catch (error) {
      console.error('Error rejecting request:', error);
      throw new HttpException(
        'Error al rechazar la solicitud',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
