import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { User, UserRole } from '../entities/user.entity';
import { Company } from '../entities/company.entity';
import { UserMFA } from '../entities/user-mfa.entity';
import { RegistrationRequestsService } from './registration-requests.service';
import { RefreshTokenService } from './refresh-token.service';
import { LoginAttemptService } from './login-attempt.service';
import { MfaService } from './mfa.service';
import { LoginResponseDto } from './dto/refresh-token.dto';
import { PasswordPolicyService } from './password-policy.service';
import { LoggerService, LogCategory } from '../common/logger.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectRepository(UserMFA)
    private readonly userMfaRepo: Repository<UserMFA>,
    private registrationRequestsService: RegistrationRequestsService,
    private jwtService: JwtService,
    private refreshTokenService: RefreshTokenService,
    private passwordPolicyService: PasswordPolicyService,
    private loginAttemptService: LoginAttemptService,
    private mfaService: MfaService,
    private logger: LoggerService,
  ) {
    this.logger.setContext('AuthService');
  }

  private generateToken(user: User): string {
    const payload = {
      sub: user.id,
      email: user.email,
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
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

  async login(email: string, password: string, ipAddress?: string, userAgent?: string): Promise<LoginResponseDto> {
    // Check if account is locked out
    const isLocked = await this.loginAttemptService.isLockedOut(email, ipAddress);
    if (isLocked) {
      this.logger.logSecurity(
        LogCategory.SECURITY,
        'Login attempt blocked - account locked out',
        { userId: email, ipAddress, userAgent, action: 'LOGIN_BLOCKED' }
      );
      throw new UnauthorizedException('Cuenta temporalmente bloqueada por múltiples intentos fallidos. Intente nuevamente en 15 minutos.');
    }

    const user = await this.userRepo.findOne({
      where: { email },
      relations: ['company'],
    });

    if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
      // Record failed attempt
      await this.loginAttemptService.recordAttempt({
        email,
        ipAddress,
        userAgent,
        success: false,
        failureReason: 'Credenciales inválidas',
      });

      this.logger.logSecurity(
        LogCategory.SECURITY,
        'Login attempt failed - invalid credentials',
        { userId: email, ipAddress, userAgent, action: 'LOGIN_FAILED', details: { reason: 'invalid_credentials' } }
      );

      const remaining = await this.loginAttemptService.getRemainingAttempts(email, ipAddress);
      throw new UnauthorizedException(`Credenciales inválidas. Intentos restantes: ${remaining}`);
    }

    if (!user.isActive) {
      await this.loginAttemptService.recordAttempt({
        userId: user.id,
        email,
        ipAddress,
        userAgent,
        success: false,
        failureReason: 'Usuario inactivo',
      });

      this.logger.logSecurity(
        LogCategory.SECURITY,
        'Login attempt failed - user inactive',
        { userId: user.id, userEmail: email, ipAddress, userAgent, action: 'LOGIN_FAILED', details: { reason: 'user_inactive' } }
      );

      throw new UnauthorizedException('Usuario inactivo');
    }

    // Record successful attempt
    await this.loginAttemptService.recordAttempt({
      userId: user.id,
      email,
      ipAddress,
      userAgent,
      success: true,
    });

    // Check if MFA is enabled for this user
    const userMFA = await this.userMfaRepo.findOneBy({ userId: user.id });
    const mfaEnabled = userMFA?.isEnabled || false;

    if (mfaEnabled) {
      this.logger.logAudit(
        'LOGIN_MFA_REQUIRED',
        'User',
        { userId: user.id, userEmail: email, ipAddress, userAgent, companyId: user.companyId?.toString() }
      );

      // Return user info without tokens, requiring MFA verification
      return {
        requiresMFA: true,
        userId: user.id,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          companyId: user.companyId,
          tenantId: user.tenantId,
        },
      };
    }

    const accessToken = this.generateToken(user);
    const refreshTokenData = await this.refreshTokenService.createRefreshToken(user, ipAddress, userAgent);

    this.logger.logAudit(
      'LOGIN_SUCCESS',
      'User',
      { userId: user.id, userEmail: email, ipAddress, userAgent, companyId: user.companyId?.toString() }
    );

    return {
      requiresMFA: false,
      accessToken,
      refreshToken: (refreshTokenData as any).token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        companyId: user.companyId,
        tenantId: user.tenantId,
      },
    };
  }

  async completeLoginWithMFA(userId: string, token: string, ipAddress?: string, userAgent?: string): Promise<LoginResponseDto> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['company'],
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    // Verify MFA token
    const verified = await this.mfaService.verifyToken(userId, token);
    if (!verified) {
      throw new UnauthorizedException('Código MFA inválido');
    }

    const accessToken = this.generateToken(user);
    const refreshTokenData = await this.refreshTokenService.createRefreshToken(user, ipAddress, userAgent);

    return {
      accessToken,
      refreshToken: (refreshTokenData as any).token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        companyId: user.companyId,
        tenantId: user.tenantId,
      },
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

    // Validar política de contraseñas
    this.passwordPolicyService.validateOrThrow(data.password);

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

    // Validar política de contraseñas
    this.passwordPolicyService.validateOrThrow(data.password);

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

  async refreshToken(refreshToken: string) {
    const tokenData = await this.refreshTokenService.validateRefreshToken(refreshToken);
    
    if (!tokenData) {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    const user = tokenData.user;
    if (!user.isActive) {
      throw new UnauthorizedException('Usuario inactivo');
    }

    // Revoke the used refresh token
    await this.refreshTokenService.revokeToken(tokenData.id);

    // Generate new tokens
    const accessToken = this.generateToken(user);
    const newRefreshTokenData = await this.refreshTokenService.createRefreshToken(user);

    return {
      accessToken,
      refreshToken: (newRefreshTokenData as any).token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        companyId: user.companyId,
        tenantId: user.tenantId,
      },
    };
  }

  async logout(refreshToken: string) {
    const tokenData = await this.refreshTokenService.validateRefreshToken(refreshToken);
    
    if (tokenData) {
      await this.refreshTokenService.revokeToken(tokenData.id);
    }

    return { message: 'Sesión cerrada exitosamente' };
  }
}
