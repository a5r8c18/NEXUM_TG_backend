import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  UseGuards,
  Req,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CompaniesService } from '../companies/companies.service';
import { UserCompaniesService } from './user-companies.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly companiesService: CompaniesService,
    private readonly userCompaniesService: UserCompaniesService,
  ) {}

  @Get()
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  async findByCompany(
    @Query('companyId') companyId: string,
    @Req() req: any,
  ) {
    if (!companyId) {
      throw new BadRequestException('CompanyId es requerido');
    }

    const user = req.user;

    // Superadmin puede ver usuarios de cualquier empresa
    // Admin solo puede ver usuarios de su propia empresa
    if (user.role !== UserRole.SUPERADMIN && user.companyId !== parseInt(companyId)) {
      // Verificar si tiene acceso via user_companies
      const hasAccess = await this.userCompaniesService.hasCompanyAccess(user.id, parseInt(companyId));
      if (!hasAccess) {
        throw new ForbiddenException('No tiene acceso a esta empresa');
      }
    }

    return this.usersService.findByCompany(parseInt(companyId));
  }

  @Get(':id')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  async findById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Post()
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  async create(
    @Req() req: any,
    @Body()
    data: {
      firstName: string;
      lastName: string;
      email: string;
      role?: string;
      companyId: number;
    },
  ) {
    const user = req.user;

    // Superadmin puede crear usuarios para cualquier empresa
    // Admin solo para su empresa o empresas asignadas
    if (user.role !== UserRole.SUPERADMIN) {
      if (user.companyId !== data.companyId) {
        const hasAccess = await this.userCompaniesService.hasCompanyAccess(user.id, data.companyId);
        if (!hasAccess) {
          throw new ForbiddenException('Solo puede crear usuarios para sus empresas asignadas');
        }
      }
      // Admin no puede crear superadmins
      if (data.role === UserRole.SUPERADMIN) {
        throw new ForbiddenException('No tiene permisos para asignar el rol superadmin');
      }
    }

    return this.usersService.create(data);
  }

  @Put(':id')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  async update(
    @Param('id') id: string,
    @Req() req: any,
    @Body() data: {
      firstName?: string;
      lastName?: string;
      email?: string;
      password?: string;
      role?: string;
      isActive?: boolean;
    },
  ) {
    const user = req.user;

    // Admin no puede asignar rol superadmin
    if (user.role !== UserRole.SUPERADMIN && data.role === UserRole.SUPERADMIN) {
      throw new ForbiddenException('No tiene permisos para asignar el rol superadmin');
    }

    return this.usersService.update(id, data);
  }

  @Delete(':id')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  async remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  @Post(':id/reactivate')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  async reactivate(@Param('id') id: string) {
    return this.usersService.reactivate(id);
  }

  @Post(':id/change-password')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  async changePassword(
    @Param('id') id: string,
    @Body() data: { newPassword: string },
  ) {
    return this.usersService.changePassword(id, data.newPassword);
  }

  @Post(':id/companies')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  async assignCompanies(
    @Param('id') userId: string,
    @Body() body: { companyIds: number[]; role?: string },
    @Req() req: any,
  ) {
    return this.userCompaniesService.assignCompaniesToUser(
      userId,
      body.companyIds,
      body.role || 'user',
    );
  }

  @Get(':id/companies')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER)
  async getUserCompanies(@Param('id') userId: string) {
    return this.userCompaniesService.getUserCompanies(userId);
  }

  @Delete(':id/companies/:companyId')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  async revokeCompanyAccess(
    @Param('id') userId: string,
    @Param('companyId') companyId: string,
  ) {
    await this.userCompaniesService.revokeCompanyAccess(
      userId,
      parseInt(companyId),
    );

    return { message: 'Acceso a empresa revocado exitosamente' };
  }
}
