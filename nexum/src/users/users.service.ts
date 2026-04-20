import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { User, UserRole } from '../entities/user.entity';
import { Company } from '../entities/company.entity';
import { LoggerService } from '../logger/logger.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    private readonly jwtService: JwtService,
    private readonly logger: LoggerService,
  ) {}

  // Obtener usuarios de una empresa específica
  async findByCompany(companyId: number) {
    return this.userRepo.find({
      where: { companyId },
      relations: ['company'],
      order: { createdAt: 'DESC' },
    });
  }

  // Obtener usuario por ID
  async findById(id: string) {
    return this.userRepo.findOne({
      where: { id },
      relations: ['company'],
    });
  }

  // Crear nuevo usuario para una empresa
  async create(data: {
    firstName: string;
    lastName: string;
    email: string;
    role?: string;
    companyId: number;
  }) {
    // Verificar si el email ya existe
    const existingUser = await this.userRepo.findOneBy({ email: data.email });
    if (existingUser) {
      throw new Error('El correo ya está registrado');
    }

    // Verificar que la empresa existe
    const company = await this.companyRepo.findOneBy({ id: data.companyId });
    if (!company) {
      throw new Error('Empresa no encontrada');
    }

    const newUser = new User();
    newUser.firstName = data.firstName;
    newUser.lastName = data.lastName;
    newUser.email = data.email;
    newUser.password = null; // Usuario sin contraseña, debe registrarse
    newUser.role = (data.role as UserRole) || UserRole.USER;
    newUser.companyId = data.companyId;
    newUser.tenantId = company.tenantId || `tenant-${Date.now()}`;
    newUser.tenantName = company.name;
    newUser.tenantType = company.tenantType || 'SINGLE_COMPANY';
    newUser.isActive = true;

    const savedUser = await this.userRepo.save(newUser);

    // Generar token de configuración de contraseña
    const setupToken = this.jwtService.sign({
      sub: savedUser.id,
      email: savedUser.email,
      type: 'setup-password',
      companyId: savedUser.companyId,
      tenantId: savedUser.tenantId,
    });

    // TODO: Enviar email con el token
    this.logger.log(`=== TOKEN DE CONFIGURACIÓN PARA USUARIO CREADO ===`, 'UsersService');
    this.logger.log(`Usuario: ${savedUser.email}`, 'UsersService');
    this.logger.log(`Empresa: ${company.name}`, 'UsersService');
    this.logger.log(`Token: ${setupToken}`, 'UsersService');
    this.logger.log(
      `URL: http://localhost:4200/setup-password?token=${setupToken}`,
      'UsersService',
    );
    this.logger.log(`================================================`, 'UsersService');

    return {
      user: savedUser,
      setupToken,
      setupUrl: `http://localhost:4200/setup-password?token=${setupToken}`,
    };
  }

  // Actualizar usuario
  async update(
    id: string,
    data: {
      firstName?: string;
      lastName?: string;
      email?: string;
      password?: string;
      role?: string;
      isActive?: boolean;
    },
  ) {
    const user = await this.userRepo.findOneBy({ id });
    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    // Si se cambia el email, verificar que no exista
    if (data.email && data.email !== user.email) {
      const existingUser = await this.userRepo.findOneBy({ email: data.email });
      if (existingUser) {
        throw new Error('El correo ya está registrado');
      }
    }

    Object.assign(user, data);
    return this.userRepo.save(user);
  }

  // Eliminar usuario (desactivar)
  async remove(id: string) {
    const user = await this.userRepo.findOneBy({ id });
    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    user.isActive = false;
    return this.userRepo.save(user);
  }

  // Reactivar usuario
  async reactivate(id: string) {
    const user = await this.userRepo.findOneBy({ id });
    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    user.isActive = true;
    return this.userRepo.save(user);
  }

  // Cambiar contraseña
  async changePassword(id: string, newPassword: string) {
    const user = await this.userRepo.findOneBy({ id });
    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    user.password = await bcrypt.hash(newPassword, 10);
    return this.userRepo.save(user);
  }
}
