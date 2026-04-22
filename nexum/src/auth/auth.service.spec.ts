/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { User, UserRole } from '../entities/user.entity';
import { Company } from '../entities/company.entity';
import { RegistrationRequestsService } from './registration-requests.service';
import { RefreshTokenService } from './refresh-token.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';

// Mock bcryptjs
jest.mock('bcryptjs');
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

describe('AuthService', () => {
  let service: AuthService;
  let userRepo: Repository<User>;
  let companyRepo: Repository<Company>;
  let registrationRequestsService: RegistrationRequestsService;
  let refreshTokenService: RefreshTokenService;
  let jwtService: JwtService;

  const mockUser: User = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    password: 'hashedPassword',
    role: UserRole.ADMIN,
    companyId: 1,
    tenantId: 'tenant-single-company-1234567890',
    tenantName: 'Test Company',
    tenantType: 'SINGLE_COMPANY',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    company: {} as Company,
    userCompanies: [],
  };

  const mockCompany: Company = {
    id: 1,
    name: 'Test Company',
    taxId: '123456789',
    address: 'Test Address',
    phone: '1234567890',
    email: 'company@example.com',
    tenantId: 'tenant-single-company-1234567890',
    tenantType: 'SINGLE_COMPANY',
    logoPath: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    warehouses: [],
    users: [],
    userCompanies: [],
  };

  beforeEach(async () => {
    const mockUserRepo = {
      findOne: jest.fn(),
      findOneBy: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };

    const mockCompanyRepo = {
      save: jest.fn(),
      create: jest.fn(),
    };

    const mockRegistrationRequestsService = {
      validateToken: jest.fn(),
    };

    const mockRefreshTokenService = {
      createRefreshToken: jest.fn(),
      validateRefreshToken: jest.fn(),
      revokeToken: jest.fn(),
    };

    const mockJwtService = {
      sign: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepo,
        },
        {
          provide: getRepositoryToken(Company),
          useValue: mockCompanyRepo,
        },
        {
          provide: RegistrationRequestsService,
          useValue: mockRegistrationRequestsService,
        },
        {
          provide: RefreshTokenService,
          useValue: mockRefreshTokenService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userRepo = module.get<Repository<User>>(getRepositoryToken(User));
    companyRepo = module.get<Repository<Company>>(getRepositoryToken(Company));
    registrationRequestsService = module.get<RegistrationRequestsService>(
      RegistrationRequestsService,
    );
    refreshTokenService = module.get<RefreshTokenService>(RefreshTokenService);
    jwtService = module.get<JwtService>(JwtService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    it('should return login response when credentials are valid', async () => {
      const expectedToken = 'jwt-token';
      const expectedRefreshToken = 'refresh-token';

      jest.spyOn(userRepo, 'findOne').mockResolvedValue(mockUser);
      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(true);
      jest.spyOn(jwtService, 'sign').mockReturnValue(expectedToken);
      jest.spyOn(refreshTokenService, 'createRefreshToken').mockResolvedValue({
        id: 1,
        token: expectedRefreshToken,
      } as any);

      const result = await service.login('test@example.com', 'password123');

      expect(result).toEqual({
        accessToken: expectedToken,
        refreshToken: expectedRefreshToken,
        user: {
          id: mockUser.id,
          email: mockUser.email,
          firstName: mockUser.firstName,
          lastName: mockUser.lastName,
          role: mockUser.role,
          companyId: mockUser.companyId,
          tenantId: mockUser.tenantId,
        },
      });
      expect(userRepo.findOne).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
        relations: ['company'],
      });
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
        companyId: mockUser.companyId,
        tenantId: mockUser.tenantId,
        tenantType: mockUser.tenantType,
      });
    });

    it('should throw UnauthorizedException when user does not exist', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(null);

      await expect(
        service.login('nonexistent@example.com', 'password123'),
      ).rejects.toThrow('Credenciales inválidas');
    });

    it('should throw UnauthorizedException when password is invalid', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(mockUser);
      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login('test@example.com', 'wrongpassword'),
      ).rejects.toThrow('Credenciales inválidas');
    });

    it('should throw UnauthorizedException when user is inactive', async () => {
      const inactiveUser = { ...mockUser, isActive: false };
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(inactiveUser);
      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        service.login('test@example.com', 'password123'),
      ).rejects.toThrow('Usuario inactivo');
    });
  });

  describe('register', () => {
    it('should create new user and return token when registration is successful', async () => {
      const registerData = {
        firstName: 'New',
        lastName: 'User',
        email: 'newuser@example.com',
        password: 'password123',
      };

      const expectedToken = 'jwt-token';
      const newUser = { ...mockUser, email: registerData.email };
      const sanitizedUser = { ...newUser };
      delete (sanitizedUser as any).password;
      const newCompany = { ...mockCompany, id: 2 };

      jest.spyOn(userRepo, 'findOneBy').mockResolvedValue(null);
      (mockedBcrypt.hash as jest.Mock).mockResolvedValue('hashedPassword');
      jest.spyOn(companyRepo, 'save').mockResolvedValue(newCompany);
      jest.spyOn(userRepo, 'save').mockResolvedValue(newUser);
      jest.spyOn(jwtService, 'sign').mockReturnValue(expectedToken);

      const result = await service.register(registerData);

      expect(result).toEqual({
        user: sanitizedUser,
        token: expectedToken,
      });

      expect(userRepo.findOneBy).toHaveBeenCalledWith({
        email: registerData.email,
      });
      expect(companyRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Mi Empresa',
          tenantId: expect.stringContaining('tenant-single_company'),
          tenantType: 'SINGLE_COMPANY',
        }),
      );
      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          email: registerData.email,
          firstName: registerData.firstName,
          lastName: registerData.lastName,
          role: UserRole.ADMIN,
        }),
      );
    });

    it('should throw error when email already exists', async () => {
      const registerData = {
        firstName: 'Test',
        lastName: 'User',
        email: 'existing@example.com',
        password: 'password123',
      };

      jest.spyOn(userRepo, 'findOneBy').mockResolvedValue(mockUser);

      await expect(service.register(registerData)).rejects.toThrow(
        'El correo ya está registrado',
      );
    });
  });

  describe('setupPassword', () => {
    it('should set password for user without password', async () => {
      const setupData = {
        email: 'test@example.com',
        password: 'newpassword123',
        firstName: 'Updated',
        lastName: 'Name',
      };

      const userWithoutPassword = { ...mockUser, password: null };
      const updatedUser = {
        ...mockUser,
        password: 'hashedPassword',
        firstName: 'Updated',
        lastName: 'Name',
      };
      const sanitizedUpdatedUser = { ...updatedUser };
      delete (sanitizedUpdatedUser as any).password;

      jest.spyOn(userRepo, 'findOneBy').mockResolvedValue(userWithoutPassword);
      (mockedBcrypt.hash as jest.Mock).mockResolvedValue('hashedPassword');
      jest.spyOn(userRepo, 'save').mockResolvedValue(updatedUser);
      jest.spyOn(jwtService, 'sign').mockReturnValue('jwt-token');

      const result = await service.setupPassword(setupData);

      expect(result).toEqual({
        user: sanitizedUpdatedUser,
        token: 'jwt-token',
        message:
          'Contraseña establecida exitosamente. Ahora puede iniciar sesión.',
      });

      expect(userRepo.findOneBy).toHaveBeenCalledWith({
        email: setupData.email,
      });
      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          password: 'hashedPassword',
          firstName: 'Updated',
          lastName: 'Name',
        }),
      );
    });

    it('should throw error when user does not exist', async () => {
      const setupData = {
        email: 'nonexistent@example.com',
        password: 'password123',
      };

      jest.spyOn(userRepo, 'findOneBy').mockResolvedValue(null);

      await expect(service.setupPassword(setupData)).rejects.toThrow(
        'Usuario no encontrado. Debe ser creado por un administrador primero.',
      );
    });

    it('should throw error when user already has password', async () => {
      const setupData = {
        email: 'test@example.com',
        password: 'password123',
      };

      jest.spyOn(userRepo, 'findOneBy').mockResolvedValue(mockUser);

      await expect(service.setupPassword(setupData)).rejects.toThrow(
        'Este usuario ya tiene una contraseña establecida. Use la opción de recuperación de contraseña.',
      );
    });
  });

  describe('refreshToken', () => {
    it('should return new tokens when refresh token is valid', async () => {
      const refreshToken = 'valid-refresh-token';
      const expectedAccessToken = 'new-access-token';
      const expectedNewRefreshToken = 'new-refresh-token';

      jest
        .spyOn(refreshTokenService, 'validateRefreshToken')
        .mockResolvedValue({
          id: 1,
          user: mockUser,
        } as any);
      jest
        .spyOn(refreshTokenService, 'revokeToken')
        .mockResolvedValue(undefined);
      jest.spyOn(jwtService, 'sign').mockReturnValue(expectedAccessToken);
      jest.spyOn(refreshTokenService, 'createRefreshToken').mockResolvedValue({
        token: expectedNewRefreshToken,
      } as any);

      const result = await service.refreshToken(refreshToken);

      expect(result).toEqual({
        accessToken: expectedAccessToken,
        refreshToken: expectedNewRefreshToken,
        user: {
          id: mockUser.id,
          email: mockUser.email,
          firstName: mockUser.firstName,
          lastName: mockUser.lastName,
          role: mockUser.role,
          companyId: mockUser.companyId,
          tenantId: mockUser.tenantId,
        },
      });

      expect(refreshTokenService.validateRefreshToken).toHaveBeenCalledWith(
        refreshToken,
      );
      expect(refreshTokenService.revokeToken).toHaveBeenCalledWith(1);
    });

    it('should throw UnauthorizedException when refresh token is invalid', async () => {
      const refreshToken = 'invalid-refresh-token';

      jest
        .spyOn(refreshTokenService, 'validateRefreshToken')
        .mockResolvedValue(null);

      await expect(service.refreshToken(refreshToken)).rejects.toThrow(
        'Refresh token inválido o expirado',
      );
    });

    it('should throw UnauthorizedException when user is inactive', async () => {
      const refreshToken = 'valid-refresh-token';
      const inactiveUser = { ...mockUser, isActive: false };

      jest
        .spyOn(refreshTokenService, 'validateRefreshToken')
        .mockResolvedValue({
          id: 1,
          user: inactiveUser,
        } as any);

      await expect(service.refreshToken(refreshToken)).rejects.toThrow(
        'Usuario inactivo',
      );
    });
  });

  describe('logout', () => {
    it('should revoke refresh token when logging out', async () => {
      const refreshToken = 'valid-refresh-token';

      jest
        .spyOn(refreshTokenService, 'validateRefreshToken')
        .mockResolvedValue({
          id: 1,
          user: mockUser,
        } as any);
      jest
        .spyOn(refreshTokenService, 'revokeToken')
        .mockResolvedValue(undefined);

      const result = await service.logout(refreshToken);

      expect(result).toEqual({ message: 'Sesión cerrada exitosamente' });
      expect(refreshTokenService.validateRefreshToken).toHaveBeenCalledWith(
        refreshToken,
      );
      expect(refreshTokenService.revokeToken).toHaveBeenCalledWith(1);
    });

    it('should return success message even when refresh token is invalid', async () => {
      const refreshToken = 'invalid-refresh-token';

      jest
        .spyOn(refreshTokenService, 'validateRefreshToken')
        .mockResolvedValue(null);

      const result = await service.logout(refreshToken);

      expect(result).toEqual({ message: 'Sesión cerrada exitosamente' });
      expect(refreshTokenService.validateRefreshToken).toHaveBeenCalledWith(
        refreshToken,
      );
      expect(refreshTokenService.revokeToken).not.toHaveBeenCalled();
    });
  });

  describe('validateToken', () => {
    it('should delegate to registration requests service', async () => {
      const token = 'test-token';
      const expectedResult = {
        valid: true,
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        tenantType: 'SINGLE_COMPANY',
        requestId: 'request-id',
      };

      jest
        .spyOn(registrationRequestsService, 'validateToken')
        .mockResolvedValue(expectedResult);

      const result = await service.validateToken(token);

      expect(result).toEqual(expectedResult);
      expect(registrationRequestsService.validateToken).toHaveBeenCalledWith(
        token,
      );
    });
  });
});
