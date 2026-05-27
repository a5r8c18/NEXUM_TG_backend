import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { BudgetService } from './budget.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';
import { getCompanyId } from '../common/get-company-id';
import { CreateBudgetDto } from './dto/create-budget.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER)
@Controller('budgets')
export class BudgetController {
  constructor(private readonly budgetService: BudgetService) {}

  @Get()
  findAll(@Req() req: Request, @Query('year') year?: string) {
    const companyId = getCompanyId(req);
    return this.budgetService.findAll(companyId, year ? parseInt(year) : undefined);
  }

  @Get(':id')
  findOne(@Req() req: Request, @Param('id') id: string) {
    return this.budgetService.findOne(getCompanyId(req), id);
  }

  @Get(':id/execution')
  getExecution(@Req() req: Request, @Param('id') id: string) {
    return this.budgetService.getExecution(getCompanyId(req), id);
  }

  @Post()
  create(@Req() req: Request, @Body() body: CreateBudgetDto) {
    return this.budgetService.create(getCompanyId(req), body);
  }

  @Post(':id/lines')
  addLine(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: CreateBudgetDto,
  ) {
    return this.budgetService.addLine(getCompanyId(req), id, body);
  }

  @Patch(':id/approve')
  approve(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    return this.budgetService.approve(getCompanyId(req), id, user?.email || 'admin');
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) {
    return this.budgetService.deleteBudget(getCompanyId(req), id);
  }
}
