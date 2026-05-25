import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionPlan } from '../entities/subscription.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../entities/user.entity';

@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  // GET /subscriptions — List all (superadmin only)
  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  async findAll() {
    return this.subscriptionsService.findAll();
  }

  // GET /subscriptions/plans — Get available plans config (public)
  @Get('plans')
  getPlans() {
    return this.subscriptionsService.getPlanConfig();
  }

  // GET /subscriptions/check — Check current tenant's subscription (authenticated)
  @Get('check')
  async checkAccess(@Headers('X-Tenant-ID') tenantId: string) {
    if (!tenantId) {
      return {
        hasAccess: false,
        status: 'no_tenant',
        plan: 'none',
        daysRemaining: 0,
        isGracePeriod: false,
        message: 'No se proporcionó tenant.',
      };
    }
    return this.subscriptionsService.checkSubscriptionAccess(tenantId);
  }

  // GET /subscriptions/tenant/:tenantId — Get subscription by tenant (admin/superadmin)
  @Get('tenant/:tenantId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  async findByTenant(@Param('tenantId') tenantId: string) {
    return this.subscriptionsService.findByTenantId(tenantId);
  }

  // GET /subscriptions/expiring — Get subscriptions expiring soon (admin/superadmin)
  @Get('expiring')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  async getExpiring(@Query('days') days?: string) {
    return this.subscriptionsService.getExpiringSoon(
      days ? parseInt(days, 10) : 3,
    );
  }

  // POST /subscriptions/trial — Create trial for tenant (admin/superadmin)
  @Post('trial')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  async createTrial(@Body() body: { tenantId: string }) {
    return this.subscriptionsService.createTrialForTenant(body.tenantId);
  }

  // POST /subscriptions/activate — Activate a paid plan (admin/superadmin)
  @Post('activate')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  async activate(
    @Body() body: { tenantId: string; plan: SubscriptionPlan },
  ) {
    return this.subscriptionsService.activateSubscription(
      body.tenantId,
      body.plan,
    );
  }

  // POST /subscriptions/payment — Register a payment (admin/superadmin)
  @Post('payment')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  async registerPayment(@Body() body: { tenantId: string }) {
    return this.subscriptionsService.registerPayment(body.tenantId);
  }

  // PUT /subscriptions/suspend/:tenantId — Suspend subscription (admin/superadmin)
  @Put('suspend/:tenantId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  async suspend(
    @Param('tenantId') tenantId: string,
    @Body() body: { reason: string },
  ) {
    return this.subscriptionsService.suspendSubscription(
      tenantId,
      body.reason,
    );
  }

  // PUT /subscriptions/cancel/:tenantId — Cancel subscription (admin/superadmin)
  @Put('cancel/:tenantId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  async cancel(@Param('tenantId') tenantId: string) {
    return this.subscriptionsService.cancelSubscription(tenantId);
  }

  // PUT /subscriptions/notes/:tenantId — Update admin notes (admin/superadmin)
  @Put('notes/:tenantId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  async updateNotes(
    @Param('tenantId') tenantId: string,
    @Body() body: { notes: string },
  ) {
    return this.subscriptionsService.updateAdminNotes(tenantId, body.notes);
  }
}
