import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { RegistrationRequestsService } from './registration-requests.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private registrationRequestsService: RegistrationRequestsService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.userRepo.findOneBy({ email, password });

    if (!user) {
      // For demo: allow any email/password combo
      const isMulti =
        email.includes('multi') ||
        email.includes('admin') ||
        email.includes('dev');
      const fakeUser = {
        id: 'user-' + Date.now(),
        email,
        firstName: email.split('@')[0],
        lastName: 'NEXUM',
        role: 'admin',
        tenantId: isMulti ? 'tenant-multi-1' : 'tenant-single-1',
        tenantName: isMulti ? 'Grupo Empresarial Demo' : 'Empresa Demo S.A.',
        tenantType: isMulti ? 'MULTI_COMPANY' : 'SINGLE_COMPANY',
      };

      return {
        user: fakeUser,
        token: 'jwt-token-' + Date.now(),
      };
    }

    const { password: _, ...userWithoutPassword } = user;
    return {
      user: userWithoutPassword,
      token: 'jwt-token-' + Date.now(),
    };
  }

  async register(data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }) {
    const exists = await this.userRepo.findOneBy({ email: data.email });
    if (exists) {
      throw new UnauthorizedException('El correo ya está registrado');
    }

    const newUser = new User();
    newUser.email = data.email;
    newUser.password = data.password;
    newUser.firstName = data.firstName;
    newUser.lastName = data.lastName;
    newUser.role = 'user';
    newUser.tenantId = 'tenant-single-' + Date.now();
    newUser.tenantName = 'Mi Empresa';
    newUser.tenantType = 'SINGLE_COMPANY';
    newUser.companyId = 1;

    const saved = await this.userRepo.save(newUser);
    const { password: _, ...userWithoutPassword } = saved;
    return {
      user: userWithoutPassword,
      token: 'jwt-token-' + Date.now(),
    };
  }

  validateToken(token: string) {
    return this.registrationRequestsService.validateToken(token);
  }
}
