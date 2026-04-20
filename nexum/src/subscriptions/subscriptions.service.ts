import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import {
  Subscription,
  SubscriptionPlan,
  SubscriptionStatus,
} from '../entities/subscription.entity';

export interface PlanLimits {
  maxUsers: number;
  maxCompanies: number;
  priceUsd: number;
  trialDays: number;
}

const PLAN_CONFIG: Record<SubscriptionPlan, PlanLimits> = {
  [SubscriptionPlan.TRIAL]: {
    maxUsers: 2,
    maxCompanies: 1,
    priceUsd: 0,
    trialDays: 7,
  },
  [SubscriptionPlan.BASIC]: {
    maxUsers: 3,
    maxCompanies: 1,
    priceUsd: 14.99,
    trialDays: 0,
  },
  [SubscriptionPlan.PROFESSIONAL]: {
    maxUsers: 10,
    maxCompanies: 3,
    priceUsd: 29.99,
    trialDays: 0,
  },
  [SubscriptionPlan.ENTERPRISE]: {
    maxUsers: 50,
    maxCompanies: 10,
    priceUsd: 59.99,
    trialDays: 0,
  },
};

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(Subscription)
    private subscriptionRepo: Repository<Subscription>,
  ) {}

  async findByTenantId(tenantId: string): Promise<Subscription | null> {
    return this.subscriptionRepo.findOne({ where: { tenantId } });
  }

  async findAll(): Promise<Subscription[]> {
    return this.subscriptionRepo.find({ order: { createdAt: 'DESC' } });
  }

  async createTrialForTenant(tenantId: string): Promise<Subscription> {
    const config = PLAN_CONFIG[SubscriptionPlan.TRIAL];
    const now = new Date();
    const trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + config.trialDays);

    const subscription = new Subscription();
    subscription.tenantId = tenantId;
    subscription.plan = SubscriptionPlan.TRIAL;
    subscription.status = SubscriptionStatus.TRIAL;
    subscription.trialEndsAt = trialEnd;
    subscription.currentPeriodStart = now;
    subscription.currentPeriodEnd = trialEnd;
    subscription.priceUsd = 0;
    subscription.maxUsers = config.maxUsers;
    subscription.maxCompanies = config.maxCompanies;
    subscription.gracePeriodDays = 3;

    return this.subscriptionRepo.save(subscription);
  }

  async activateSubscription(
    tenantId: string,
    plan: SubscriptionPlan,
  ): Promise<Subscription> {
    let subscription = await this.findByTenantId(tenantId);
    if (!subscription) {
      subscription = new Subscription();
      subscription.tenantId = tenantId;
    }

    const config = PLAN_CONFIG[plan];
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    subscription.plan = plan;
    subscription.status = SubscriptionStatus.ACTIVE;
    subscription.currentPeriodStart = now;
    subscription.currentPeriodEnd = periodEnd;
    subscription.nextPaymentDate = periodEnd;
    subscription.lastPaymentDate = now;
    subscription.priceUsd = config.priceUsd;
    subscription.maxUsers = config.maxUsers;
    subscription.maxCompanies = config.maxCompanies;
    subscription.gracePeriodDays = 7;
    subscription.suspendedAt = null;
    subscription.suspensionReason = null;

    return this.subscriptionRepo.save(subscription);
  }

  async registerPayment(tenantId: string): Promise<Subscription | null> {
    const subscription = await this.findByTenantId(tenantId);
    if (!subscription) return null;

    const now = new Date();
    const newPeriodEnd = new Date(now);
    newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);

    subscription.lastPaymentDate = now;
    subscription.currentPeriodStart = now;
    subscription.currentPeriodEnd = newPeriodEnd;
    subscription.nextPaymentDate = newPeriodEnd;
    subscription.status = SubscriptionStatus.ACTIVE;
    subscription.suspendedAt = null;
    subscription.suspensionReason = null;

    return this.subscriptionRepo.save(subscription);
  }

  async suspendSubscription(
    tenantId: string,
    reason: string,
  ): Promise<Subscription | null> {
    const subscription = await this.findByTenantId(tenantId);
    if (!subscription) return null;

    subscription.status = SubscriptionStatus.SUSPENDED;
    subscription.suspendedAt = new Date();
    subscription.suspensionReason = reason;

    return this.subscriptionRepo.save(subscription);
  }

  async cancelSubscription(tenantId: string): Promise<Subscription | null> {
    const subscription = await this.findByTenantId(tenantId);
    if (!subscription) return null;

    subscription.status = SubscriptionStatus.CANCELLED;
    return this.subscriptionRepo.save(subscription);
  }

  async checkSubscriptionAccess(tenantId: string): Promise<{
    hasAccess: boolean;
    status: SubscriptionStatus;
    plan: SubscriptionPlan;
    daysRemaining: number;
    isGracePeriod: boolean;
    message: string;
  }> {
    const subscription = await this.findByTenantId(tenantId);

    if (!subscription) {
      return {
        hasAccess: false,
        status: SubscriptionStatus.CANCELLED,
        plan: SubscriptionPlan.TRIAL,
        daysRemaining: 0,
        isGracePeriod: false,
        message: 'No existe suscripción para este tenant.',
      };
    }

    const now = new Date();

    // Suspended or cancelled — no access
    if (
      subscription.status === SubscriptionStatus.SUSPENDED ||
      subscription.status === SubscriptionStatus.CANCELLED
    ) {
      return {
        hasAccess: false,
        status: subscription.status,
        plan: subscription.plan,
        daysRemaining: 0,
        isGracePeriod: false,
        message:
          subscription.status === SubscriptionStatus.SUSPENDED
            ? `Suscripción suspendida: ${subscription.suspensionReason || 'Contacte al administrador.'}`
            : 'Suscripción cancelada.',
      };
    }

    // Trial check
    if (subscription.status === SubscriptionStatus.TRIAL) {
      if (subscription.trialEndsAt && now > subscription.trialEndsAt) {
        // Trial expired — auto-suspend
        subscription.status = SubscriptionStatus.SUSPENDED;
        subscription.suspendedAt = now;
        subscription.suspensionReason = 'Período de prueba expirado.';
        await this.subscriptionRepo.save(subscription);

        return {
          hasAccess: false,
          status: SubscriptionStatus.SUSPENDED,
          plan: subscription.plan,
          daysRemaining: 0,
          isGracePeriod: false,
          message:
            'Su período de prueba ha expirado. Seleccione un plan para continuar.',
        };
      }

      const daysRemaining = Math.ceil(
        (subscription.trialEndsAt!.getTime() - now.getTime()) /
          (1000 * 60 * 60 * 24),
      );
      return {
        hasAccess: true,
        status: subscription.status,
        plan: subscription.plan,
        daysRemaining,
        isGracePeriod: false,
        message: `Período de prueba: ${daysRemaining} día(s) restantes.`,
      };
    }

    // Active subscription — check period
    if (
      subscription.currentPeriodEnd &&
      now > subscription.currentPeriodEnd
    ) {
      // Period expired — check grace period
      const graceEnd = new Date(subscription.currentPeriodEnd);
      graceEnd.setDate(
        graceEnd.getDate() + subscription.gracePeriodDays,
      );

      if (now > graceEnd) {
        // Grace period also expired — suspend
        subscription.status = SubscriptionStatus.SUSPENDED;
        subscription.suspendedAt = now;
        subscription.suspensionReason = 'Pago vencido. Período de gracia expirado.';
        await this.subscriptionRepo.save(subscription);

        return {
          hasAccess: false,
          status: SubscriptionStatus.SUSPENDED,
          plan: subscription.plan,
          daysRemaining: 0,
          isGracePeriod: false,
          message:
            'Su suscripción ha sido suspendida por falta de pago.',
        };
      }

      // Within grace period
      subscription.status = SubscriptionStatus.PAST_DUE;
      await this.subscriptionRepo.save(subscription);

      const graceDaysRemaining = Math.ceil(
        (graceEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );
      return {
        hasAccess: true,
        status: SubscriptionStatus.PAST_DUE,
        plan: subscription.plan,
        daysRemaining: graceDaysRemaining,
        isGracePeriod: true,
        message: `Pago pendiente. ${graceDaysRemaining} día(s) de gracia restantes.`,
      };
    }

    // All good — active
    const daysRemaining = subscription.currentPeriodEnd
      ? Math.ceil(
          (subscription.currentPeriodEnd.getTime() - now.getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : 30;

    return {
      hasAccess: true,
      status: subscription.status,
      plan: subscription.plan,
      daysRemaining,
      isGracePeriod: false,
      message: `Plan ${subscription.plan}: ${daysRemaining} día(s) restantes.`,
    };
  }

  async updateAdminNotes(
    tenantId: string,
    notes: string,
  ): Promise<Subscription | null> {
    const subscription = await this.findByTenantId(tenantId);
    if (!subscription) return null;

    subscription.adminNotes = notes;
    return this.subscriptionRepo.save(subscription);
  }

  getPlanConfig(): Record<SubscriptionPlan, PlanLimits> {
    return PLAN_CONFIG;
  }

  async getExpiringSoon(days: number = 3): Promise<Subscription[]> {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    return this.subscriptionRepo.find({
      where: {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: LessThan(futureDate),
      },
    });
  }
}
