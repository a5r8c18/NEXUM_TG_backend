import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { User, UserRole } from '../entities/user.entity';
import { Company } from '../entities/company.entity';
import { RegistrationRequestsService } from './registration-requests.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    private registrationRequestsService: RegistrationRequestsService,
    private jwtService: JwtService,
  ) {}

  private generateToken(user: User): string {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      tenantId: user.tenantId,
      tenantType: user.tenantType,
    };
    return this.jwtService.sign(payload);
  }

  private sanitizeUser(user: User) {
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async login(email: string, password: string) {
    const user = await this.userRepo.findOne({
      where: { email },
      relations: ['company'],
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!user.password) {
      throw new UnauthorizedException('Debe establecer su contraseña primero. Acceda a la página de configuración de contraseña.');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Su cuenta está desactivada. Contacte al administrador.');
    }

    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    return {
      user: this.sanitizeUser(user),
      token: this.generateToken(user),
    };
  }

  async register(data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    token?: string;
    tenantType?: 'MULTI_COMPANY' | 'SINGLE_COMPANY';
  }) {
    const exists = await this.userRepo.findOneBy({ email: data.email });
    if (exists) {
      throw new BadRequestException('El correo ya está registrado');
    }

    // Si hay token, validar y obtener tenantType de la solicitud aprobada
    let finalTenantType: 'MULTI_COMPANY' | 'SINGLE_COMPANY' = 'SINGLE_COMPANY';
    let tenantName = 'Mi Empresa';
    let companyName = 'Mi Empresa';

    if (data.token) {
      const tokenValidation =
        await this.registrationRequestsService.validateToken(data.token);

      if (!tokenValidation.valid) {
        throw new BadRequestException('Token de registro inválido o expirado');
      }

      if (tokenValidation.tenantType) {
        finalTenantType =
          tokenValidation.tenantType === 'MULTI_COMPANY' ||
          tokenValidation.tenantType === 'SINGLE_COMPANY'
            ? tokenValidation.tenantType
            : 'SINGLE_COMPANY';
      }

      // Buscar solicitud original para obtener datos
      const rrRepo = this.registrationRequestsService['rrRepo'];
      const request = await rrRepo.findOne({
        where: { email: data.email, approvalToken: data.token },
      });

      if (request?.companyName) {
        companyName = request.companyName;
        tenantName = request.companyName;
      } else {
        tenantName = finalTenantType === 'MULTI_COMPANY' ? 'Grupo Empresarial' : 'Empresa Individual';
      }
    }

    // Hash de la contraseña
    const hashedPassword = await bcrypt.hash(data.password, 10);

    // Crear empresa para el nuevo tenant
    const newCompany = new Company();
    newCompany.name = companyName;
    newCompany.tenantId = `tenant-${finalTenantType.toLowerCase()}-${Date.now()}`;
    newCompany.tenantType = finalTenantType;
    newCompany.isActive = true;
    newCompany.taxId = 'TAX-' + Date.now();
    const savedCompany = await this.companyRepo.save(newCompany);

    // Crear usuario como ADMIN de su tenant (NO superadmin)
    const newUser = new User();
    newUser.email = data.email;
    newUser.password = hashedPassword;
    newUser.firstName = data.firstName;
    newUser.lastName = data.lastName;
    newUser.role = UserRole.ADMIN;
    newUser.tenantId = newCompany.tenantId;
    newUser.tenantName = tenantName;
    newUser.tenantType = finalTenantType;
    newUser.companyId = savedCompany.id;

    const saved = await this.userRepo.save(newUser);

    return {
      user: this.sanitizeUser(saved),
      token: this.generateToken(saved),
    };
  }

  async setupPassword(data: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }) {
    const user = await this.userRepo.findOneBy({ email: data.email });

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado. Debe ser creado por un administrador primero.');
    }

    if (user.password !== null) {
      throw new BadRequestException('Este usuario ya tiene una contraseña establecida. Use la opción de recuperación de contraseña.');
    }

    // Hash de la contraseña
    user.password = await bcrypt.hash(data.password, 10);
    if (data.firstName) user.firstName = data.firstName;
    if (data.lastName) user.lastName = data.lastName;

    const saved = await this.userRepo.save(user);

    return {
      user: this.sanitizeUser(saved),
      token: this.generateToken(saved),
      message: 'Contraseña establecida exitosamente. Ahora puede iniciar sesión.',
    };
  }

  validateToken(token: string) {
    return this.registrationRequestsService.validateToken(token);
  }
}
