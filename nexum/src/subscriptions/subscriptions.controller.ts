import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  Headers,
} from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionPlan } from '../entities/subscription.entity';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  // GET /subscriptions — List all (superadmin)
  @Get()
  async findAll() {
    return this.subscriptionsService.findAll();
  }

  // GET /subscriptions/plans — Get available plans config
  @Get('plans')
  getPlans() {
    return this.subscriptionsService.getPlanConfig();
  }

  // GET /subscriptions/check — Check current tenant's subscription
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

  // GET /subscriptions/tenant/:tenantId — Get subscription by tenant
  @Get('tenant/:tenantId')
  async findByTenant(@Param('tenantId') tenantId: string) {
    return this.subscriptionsService.findByTenantId(tenantId);
  }

  // GET /subscriptions/expiring — Get subscriptions expiring soon
  @Get('expiring')
  async getExpiring(@Query('days') days?: string) {
    return this.subscriptionsService.getExpiringSoon(
      days ? parseInt(days, 10) : 3,
    );
  }

  // POST /subscriptions/trial — Create trial for tenant
  @Post('trial')
  async createTrial(@Body() body: { tenantId: string }) {
    return this.subscriptionsService.createTrialForTenant(body.tenantId);
  }

  // POST /subscriptions/activate — Activate a paid plan
  @Post('activate')
  async activate(
    @Body() body: { tenantId: string; plan: SubscriptionPlan },
  ) {
    return this.subscriptionsService.activateSubscription(
      body.tenantId,
      body.plan,
    );
  }

  // POST /subscriptions/payment — Register a payment
  @Post('payment')
  async registerPayment(@Body() body: { tenantId: string }) {
    return this.subscriptionsService.registerPayment(body.tenantId);
  }

  // PUT /subscriptions/suspend/:tenantId — Suspend subscription
  @Put('suspend/:tenantId')
  async suspend(
    @Param('tenantId') tenantId: string,
    @Body() body: { reason: string },
  ) {
    return this.subscriptionsService.suspendSubscription(
      tenantId,
      body.reason,
    );
  }

  // PUT /subscriptions/cancel/:tenantId — Cancel subscription
  @Put('cancel/:tenantId')
  async cancel(@Param('tenantId') tenantId: string) {
    return this.subscriptionsService.cancelSubscription(tenantId);
  }

  // PUT /subscriptions/notes/:tenantId — Update admin notes
  @Put('notes/:tenantId')
  async updateNotes(
    @Param('tenantId') tenantId: string,
    @Body() body: { notes: string },
  ) {
    return this.subscriptionsService.updateAdminNotes(tenantId, body.notes);
  }
}
