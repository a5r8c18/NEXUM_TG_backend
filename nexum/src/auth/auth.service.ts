import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  ) {}

  async login(email: string, password: string) {
    const user = await this.userRepo.findOneBy({ email, password });

    if (!user) {
      // For demo: allow any email/password combo
      const isMulti =
        email.includes('multi') ||
        email.includes('admin') ||
        email.includes('dev');
      
      // Buscar una empresa existente para asignar
      let companyId = 1;
      try {
        const companies = await this.companyRepo.find();
        if (companies.length > 0) {
          // Para usuarios multi-empresa, buscar "Teneduria Garcia" o la primera disponible
          if (isMulti) {
            const teneduriaGarcia = companies.find(c => c.name === 'Teneduria Garcia');
            companyId = teneduriaGarcia?.id || companies[0].id;
          } else {
            // Para usuarios single-company, usar la primera empresa
            companyId = companies[0].id;
          }
          console.log('✅ AUTH SERVICE - Empresa asignada para demo:', companyId, companies.find(c => c.id === companyId)?.name);
        }
      } catch (error) {
        console.error('❌ AUTH SERVICE - Error buscando empresas:', error);
      }

      const fakeUser = {
        id: 'user-' + Date.now(),
        email,
        firstName: email.split('@')[0],
        lastName: 'NEXUM',
        role: UserRole.ADMIN,
        tenantId: isMulti ? 'tenant-multi-1' : 'tenant-single-1',
        tenantName: isMulti ? 'Grupo Empresarial Demo' : 'Empresa Demo S.A.',
        tenantType: isMulti ? 'MULTI_COMPANY' : 'SINGLE_COMPANY',
        companyId: companyId, // ✅ Añadir companyId correcto
      };

      // Marcar la empresa como activa cuando el usuario se loguea con ella
      try {
        await this.companyRepo.update(companyId, { isActive: true });
        console.log('✅ AUTH SERVICE - Empresa marcada como activa:', companyId);
      } catch (error) {
        console.error('❌ AUTH SERVICE - Error marcando empresa como activa:', error);
      }

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
    token?: string;
    tenantType?: 'MULTI_COMPANY' | 'SINGLE_COMPANY';
  }) {
    console.log('🔍 AUTH SERVICE - Register llamado con:', {
      ...data,
      password: '***',
    });

    const exists = await this.userRepo.findOneBy({ email: data.email });
    if (exists) {
      throw new UnauthorizedException('El correo ya está registrado');
    }

    // Si hay token, validar y obtener tenantType
    let finalTenantType: 'MULTI_COMPANY' | 'SINGLE_COMPANY' = 'SINGLE_COMPANY';
    let tenantName = 'Mi Empresa';

    if (data.token) {
      console.log('🔍 AUTH SERVICE - Validando token en registro...');
      const tokenValidation =
        await this.registrationRequestsService.validateToken(data.token);

      if (tokenValidation.valid && tokenValidation.tenantType) {
        // Aseguramos que el tenantType del token sea uno de los valores válidos
        finalTenantType =
          tokenValidation.tenantType === 'MULTI_COMPANY' ||
          tokenValidation.tenantType === 'SINGLE_COMPANY'
            ? tokenValidation.tenantType
            : 'SINGLE_COMPANY';
        tenantName =
          finalTenantType === 'MULTI_COMPANY'
            ? 'Grupo Empresarial'
            : 'Empresa Individual';
        console.log(
          '✅ AUTH SERVICE - Token válido, tenantType:',
          finalTenantType,
        );
      } else {
        console.log(
          '❌ AUTH SERVICE - Token inválido, usando tenantType por defecto',
        );
      }
    }

    const newUser = new User();
    newUser.email = data.email;
    newUser.password = data.password;
    newUser.firstName = data.firstName;
    newUser.lastName = data.lastName;
    newUser.role = UserRole.ADMIN;
    newUser.tenantId = `tenant-${finalTenantType.toLowerCase()}-${Date.now()}`;
    newUser.tenantName = tenantName;
    newUser.tenantType = finalTenantType;

    // Crear una empresa para el usuario
    const newCompany = new Company();

    // Si hay token, buscar la solicitud original para obtener el companyName
    if (data.token) {
      const rrRepo = this.registrationRequestsService['rrRepo']; // Access private repo
      const request = await rrRepo.findOne({
        where: {
          email: data.email,
          approvalToken: data.token,
        },
      });

      if (request && request.companyName) {
        newCompany.name = request.companyName;
        console.log(
          '✅ AUTH SERVICE - Usando companyName de solicitud:',
          request.companyName,
        );
      } else {
        newCompany.name = `${data.firstName} ${data.lastName} Company`;
        console.log(
          '✅ AUTH SERVICE - Solicitud no encontrada, usando nombre genérico',
        );
      }
    } else {
      newCompany.name = 'Mi Empresa';
    }

    newCompany.tenantId = newUser.tenantId;
    newCompany.tenantType = finalTenantType;
    newCompany.isActive = true;
    newCompany.taxId = 'TAX-' + Date.now(); // Generar tax_id único

    const savedCompany = await this.companyRepo.save(newCompany);
    newUser.companyId = savedCompany.id;

    console.log(
      '✅ AUTH SERVICE - Empresa creada:',
      savedCompany.id,
      savedCompany.name,
    );

    const saved = await this.userRepo.save(newUser);
    console.log(
      '✅ AUTH SERVICE - Usuario creado con tenantType:',
      saved.tenantType,
      'y companyId:',
      saved.companyId,
    );

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
