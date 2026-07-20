/* eslint-disable @typescript-eslint/no-unsafe-argument */
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
import { HrManagementService } from './hr-management.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';
import { getCompanyId } from '../common/get-company-id';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER)
@Controller('hr/contracts')
export class ContractsController {
  constructor(private readonly service: HrManagementService) {}

  @Get()
  findAll(
    @Req() req: Request,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
  ) {
    return this.service.findAllContracts(getCompanyId(req), { employeeId, status });
  }

  @Post()
  create(@Req() req: Request, @Body() body: any) {
    return this.service.createContract(getCompanyId(req), body);
  }

  @Put(':id')
  update(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    return this.service.updateContract(getCompanyId(req), id, body);
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) {
    return this.service.deleteContract(getCompanyId(req), id);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER)
@Controller('hr/attendance')
export class AttendanceController {
  constructor(private readonly service: HrManagementService) {}

  @Get()
  findAll(
    @Req() req: Request,
    @Query('employeeId') employeeId?: string,
    @Query('date') date?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
  ) {
    return this.service.findAllAttendance(getCompanyId(req), {
      employeeId,
      date,
      from,
      to,
      status,
    });
  }

  @Post()
  create(@Req() req: Request, @Body() body: any) {
    return this.service.createAttendance(getCompanyId(req), body);
  }

  @Put(':id')
  update(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    return this.service.updateAttendance(getCompanyId(req), id, body);
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) {
    return this.service.deleteAttendance(getCompanyId(req), id);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER)
@Controller('hr/leaves')
export class LeavesController {
  constructor(private readonly service: HrManagementService) {}

  @Get()
  findAll(
    @Req() req: Request,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
  ) {
    return this.service.findAllLeaves(getCompanyId(req), {
      employeeId,
      status,
      type,
    });
  }

  @Post()
  create(@Req() req: Request, @Body() body: any) {
    return this.service.createLeave(getCompanyId(req), body);
  }

  @Put(':id')
  update(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    return this.service.updateLeave(getCompanyId(req), id, body);
  }

  @Put(':id/status')
  setStatus(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { status: 'approved' | 'rejected' | 'cancelled'; approvedBy?: string },
  ) {
    return this.service.setLeaveStatus(
      getCompanyId(req),
      id,
      body.status,
      body.approvedBy,
    );
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) {
    return this.service.deleteLeave(getCompanyId(req), id);
  }
}
