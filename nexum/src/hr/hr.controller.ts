import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { HrService } from './hr.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';
import { getCompanyId } from '../common/get-company-id';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER)
@Controller('hr')
export class HrController {
  constructor(private readonly hrService: HrService) {}

  // ── Employees ──

  @Get('employees')
  findAllEmployees(
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('departmentId') departmentId?: string,
    @Query('search') search?: string,
    @Query('contractType') contractType?: string,
  ) {
    const companyId = getCompanyId(req);
    return this.hrService.findAllEmployees(companyId, {
      status,
      departmentId,
      search,
      contractType,
    });
  }

  @Get('employees/statistics')
  getEmployeeStatistics(@Req() req: Request) {
    const companyId = getCompanyId(req);
    return this.hrService.getEmployeeStatistics(companyId);
  }

  @Get('employees/:id')
  findOneEmployee(@Req() req: Request, @Param('id') id: string) {
    const companyId = getCompanyId(req);
    return this.hrService.findOneEmployee(companyId, id);
  }

  @Post('employees')
  createEmployee(@Req() req: Request, @Body() body: any) {
    const companyId = getCompanyId(req);
    return this.hrService.createEmployee(companyId, body);
  }

  @Put('employees/:id')
  updateEmployee(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const companyId = getCompanyId(req);
    return this.hrService.updateEmployee(companyId, id, body);
  }

  @Delete('employees/:id')
  deleteEmployee(@Req() req: Request, @Param('id') id: string) {
    const companyId = getCompanyId(req);
    return this.hrService.deleteEmployee(companyId, id);
  }

  // ── Departments ──

  @Get('departments')
  findAllDepartments(@Req() req: Request) {
    const companyId = getCompanyId(req);
    return this.hrService.findAllDepartments(companyId);
  }

  @Post('departments')
  createDepartment(@Req() req: Request, @Body() body: any) {
    const companyId = getCompanyId(req);
    return this.hrService.createDepartment(companyId, body);
  }

  @Put('departments/:id')
  updateDepartment(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const companyId = getCompanyId(req);
    return this.hrService.updateDepartment(companyId, id, body);
  }

  @Delete('departments/:id')
  deleteDepartment(@Req() req: Request, @Param('id') id: string) {
    const companyId = getCompanyId(req);
    return this.hrService.deleteDepartment(companyId, id);
  }
}
