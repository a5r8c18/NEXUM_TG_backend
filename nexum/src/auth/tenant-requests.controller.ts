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
} from '@nestjs/common';
import { RegistrationRequestsService } from './registration-requests.service';
import { RegistrationRequest } from '../entities/registration-request.entity';

@Controller('api/tenant-requests')
export class TenantRequestsController {
  constructor(
    private readonly registrationRequestsService: RegistrationRequestsService,
  ) {}

  // Crear nueva solicitud de tenant (equivalente a tenant request del frontend)
  @Post()
  async createRequest(
    @Body()
    requestData: {
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
      position: string;
      companyName: string;
      industry: string;
      country: string;
      website?: string;
      tenantType: 'MULTI_COMPANY' | 'SINGLE_COMPANY';
      useCase: string;
      message: string;
      referralSource?: string;
    },
  ) {
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

      return response;
    } catch (error) {
      console.error('Error creating tenant request:', error);
      throw new HttpException(
        'Error al crear la solicitud de tenant',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Obtener todas las solicitudes (para compatibilidad)
  @Get()
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

  // Aprobar solicitud
  @Put(':email/approve')
  async approveRequest(
    @Param('email') email: string,
    @Body() body: { adminNotes?: string },
  ) {
    try {
      return await this.registrationRequestsService.approveRequest(
        email,
        body.adminNotes || 'admin@nexum.com',
      );
    } catch (error) {
      console.error('Error approving request:', error);
      throw new HttpException(
        'Error al aprobar la solicitud',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Denegar solicitud
  @Put(':email/reject')
  async rejectRequest(
    @Param('email') email: string,
    @Body() body: { rejectionReason: string; adminNotes?: string },
  ) {
    try {
      return await this.registrationRequestsService.denyRequest(
        email,
        body.rejectionReason,
        body.adminNotes || 'admin@nexum.com',
      );
    } catch (error) {
      console.error('Error rejecting request:', error);
      throw new HttpException(
        'Error al rechazar la solicitud',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
