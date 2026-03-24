import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RegistrationRequest } from '../entities/registration-request.entity';

@Injectable()
export class RegistrationRequestsService {
  constructor(
    @InjectRepository(RegistrationRequest)
    private readonly rrRepo: Repository<RegistrationRequest>,
  ) {}

  // Crear solicitud de registro (cuando usuario se registra sin aprobación previa)
  async createRequest(userData: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    requestedTenantType?: 'MULTI_COMPANY' | 'SINGLE_COMPANY';
  }) {
    const rr = new RegistrationRequest();
    rr.firstName = userData.firstName;
    rr.lastName = userData.lastName;
    rr.email = userData.email;
    rr.password = userData.password;
    rr.requestedTenantType = userData.requestedTenantType || 'SINGLE_COMPANY';
    rr.status = 'PENDING';

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
  async approveRequest(requestId: string, approvedBy: string) {
    const request = await this.rrRepo.findOneBy({ id: requestId });
    if (!request) {
      throw new NotFoundException('Solicitud no encontrada');
    }

    // Generar token de aprobación
    const token =
      'approved-' +
      Date.now() +
      '-' +
      Math.random().toString(36).substring(2, 11);

    // Actualizar estado de la solicitud
    request.status = 'APPROVED';
    request.approvedAt = new Date();
    request.approvedBy = approvedBy;
    await this.rrRepo.save(request);

    return {
      message: 'Solicitud aprobada exitosamente',
      token,
      email: request.email,
    };
  }

  // Denegar solicitud
  async denyRequest(requestId: string, reason: string, deniedBy: string) {
    const request = await this.rrRepo.findOneBy({ id: requestId });
    if (!request) {
      throw new NotFoundException('Solicitud no encontrada');
    }

    // Actualizar estado de la solicitud
    request.status = 'DENIED';
    request.deniedAt = new Date();
    request.deniedBy = deniedBy;
    request.denialReason = reason;
    await this.rrRepo.save(request);

    return {
      message: 'Solicitud denegada',
      requestId,
    };
  }

  // Validar token de aprobación
  async validateToken(token: string) {
    // Token-based approval stored in the request's approvedBy or as a separate mechanism
    // For now, check if an approved request exists with matching token pattern
    const approved = await this.rrRepo.find({ where: { status: 'APPROVED' } });
    const match = approved.find(() => token.startsWith('approved-'));
    if (match) {
      return {
        valid: true,
        email: match.email,
        tenantType: match.requestedTenantType,
        requestId: match.id,
      };
    }
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
