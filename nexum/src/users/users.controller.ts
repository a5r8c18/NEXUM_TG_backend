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
  Headers,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CompaniesService } from '../companies/companies.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly companiesService: CompaniesService,
  ) {}

  @Get()
  async findByCompany(@Query('companyId') companyId: string) {
    if (!companyId) {
      throw new BadRequestException('CompanyId es requerido');
    }
    return this.usersService.findByCompany(parseInt(companyId));
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Post()
  async create(
    @Headers('x-user-id') userId: string,
    @Headers('x-user-role') userRole: string,
    @Headers('x-company-id') userCompanyId: string,
    @Body()
    data: {
      firstName: string;
      lastName: string;
      email: string;
      password: string;
      role?: string;
      companyId: number;
    },
  ) {
    // Validar que el usuario sea administrador
    if (userRole !== 'admin') {
      throw new UnauthorizedException('Solo los administradores pueden crear usuarios');
    }

    // Validar que el usuario esté creando para su propia empresa
    if (parseInt(userCompanyId) !== data.companyId) {
      throw new UnauthorizedException('Solo puede crear usuarios para su propia empresa');
    }

    return this.usersService.create(data);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() data: {
      firstName?: string;
      lastName?: string;
      email?: string;
      password?: string;
      role?: string;
      isActive?: boolean;
    },
  ) {
    return this.usersService.update(id, data);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  @Post(':id/reactivate')
  async reactivate(@Param('id') id: string) {
    return this.usersService.reactivate(id);
  }

  @Post(':id/change-password')
  async changePassword(
    @Param('id') id: string,
    @Body() data: { newPassword: string },
  ) {
    return this.usersService.changePassword(id, data.newPassword);
  }
}
