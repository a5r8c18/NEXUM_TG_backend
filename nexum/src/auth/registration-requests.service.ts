import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RegistrationRequest } from '../entities/registration-request.entity';
import { EmailService } from './email.service';

@Injectable()
export class RegistrationRequestsService {
  constructor(
    @InjectRepository(RegistrationRequest)
    private readonly rrRepo: Repository<RegistrationRequest>,
    private readonly emailService: EmailService,
  ) {}

  // Crear solicitud de registro (cuando usuario se registra sin aprobación previa)
  async createRequest(userData: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    requestedTenantType?: 'MULTI_COMPANY' | 'SINGLE_COMPANY';
    phone?: string;
    position?: string;
    companyName?: string;
    industry?: string;
    country?: string;
    website?: string;
    useCase?: string;
    message?: string;
    referralSource?: string;
  }) {
    const rr = new RegistrationRequest();
    rr.firstName = userData.firstName;
    rr.lastName = userData.lastName;
    rr.email = userData.email;
    rr.password = userData.password;
    rr.requestedTenantType = userData.requestedTenantType || 'SINGLE_COMPANY';
    rr.status = 'PENDING';

    // Additional fields from frontend
    rr.phone = userData.phone || null;
    rr.position = userData.position || null;
    rr.companyName = userData.companyName || null;
    rr.industry = userData.industry || null;
    rr.country = userData.country || null;
    rr.website = userData.website || null;
    rr.useCase = userData.useCase || null;
    rr.message = userData.message || null;
    rr.referralSource = userData.referralSource || null;

    const saved = await this.rrRepo.save(rr);
    return {
      message: 'Solicitud enviada para aprobación',
      requestId: saved.id,
    };
  }

  // Listar todas las solicitudes pendientes (para admin)
  async getPendingRequests() {
    return this.rrRepo.find({ where: { status: 'PENDING' } });
  }

  // Aprobar solicitud
  async approveRequest(
    requestId: string,
    approvedBy: string,
    adminNotes?: string,
  ) {
    const request = await this.rrRepo.findOneBy({ id: requestId });
    if (!request) {
      throw new NotFoundException('Solicitud no encontrada');
    }

    // Generar token de aprobación (más corto y seguro para URLs)
    const token =
      'ap-' +
      Date.now().toString(36) + // Base36 para hacer timestamp más corto
      '-' +
      Math.random().toString(36).substring(2, 8); // 6 chars random

    // Actualizar estado de la solicitud
    request.status = 'APPROVED';
    request.approvedAt = new Date();
    request.approvedBy = approvedBy;
    request.adminNotes = adminNotes || null; // Guardar las notas de admin
    request.approvalToken = token; // Guardar el token específico
    await this.rrRepo.save(request);

    // Enviar email de notificación al usuario
    try {
      await this.emailService.sendApprovalNotification(
        request.email,
        token,
        request.requestedTenantType || 'SINGLE_COMPANY',
      );
      console.log('✅ Email de aprobación enviado a:', request.email);
    } catch (error) {
      console.error('❌ Error enviando email de aprobación:', error);
      // No fallamos la aprobación si el email no se puede enviar
    }

    return {
      message: 'Solicitud aprobada exitosamente',
      token,
      email: request.email,
    };
  }

  // Denegar solicitud
  async denyRequest(
    requestId: string,
    reason: string,
    deniedBy: string,
    adminNotes?: string,
  ) {
    const request = await this.rrRepo.findOneBy({ id: requestId });
    if (!request) {
      throw new NotFoundException('Solicitud no encontrada');
    }

    // Actualizar estado de la solicitud
    request.status = 'DENIED';
    request.deniedAt = new Date();
    request.deniedBy = deniedBy;
    request.denialReason = reason;
    request.adminNotes = adminNotes || null; // Guardar las notas de admin
    await this.rrRepo.save(request);

    return {
      message: 'Solicitud denegada',
      requestId,
    };
  }

  // Validar token de aprobación
  async validateToken(token: string) {
    console.log('🔍 VALIDATE TOKEN - Token recibido:', token);

    // Buscar solicitud aprobada con el token exacto
    const request = await this.rrRepo.findOne({
      where: {
        status: 'APPROVED',
        approvalToken: token,
      },
    });

    if (request) {
      console.log('✅ VALIDATE TOKEN - Token válido para:', request.email);
      return {
        valid: true,
        email: request.email,
        firstName: request.firstName,
        lastName: request.lastName,
        tenantType: request.requestedTenantType,
        requestId: request.id,
      };
    }

    console.log('❌ VALIDATE TOKEN - Token no válido');
    return { valid: false };
  }

  // Obtener todas las solicitudes (con filtros)
  async getAllRequests(status?: 'PENDING' | 'APPROVED' | 'DENIED') {
    if (status) {
      return this.rrRepo.find({ where: { status } });
    }
    return this.rrRepo.find();
  }

  // Estadísticas de solicitudes
  async getStatistics() {
    const total = await this.rrRepo.count();
    const pending = await this.rrRepo.count({ where: { status: 'PENDING' } });
    const approved = await this.rrRepo.count({ where: { status: 'APPROVED' } });
    const denied = await this.rrRepo.count({ where: { status: 'DENIED' } });

    return {
      total,
      pending,
      approved,
      denied,
      approvalRate: total > 0 ? (approved / total) * 100 : 0,
    };
  }
}
