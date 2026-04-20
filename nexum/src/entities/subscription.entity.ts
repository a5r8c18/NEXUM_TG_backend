import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum SubscriptionPlan {
  TRIAL = 'trial',
  BASIC = 'basic',
  PROFESSIONAL = 'professional',
  ENTERPRISE = 'enterprise',
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  TRIAL = 'trial',
  PAST_DUE = 'past_due',
  SUSPENDED = 'suspended',
  CANCELLED = 'cancelled',
}

@Entity('subscriptions')
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 100 })
  tenantId: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: SubscriptionPlan.TRIAL,
  })
  plan: SubscriptionPlan;

  @Column({
    type: 'varchar',
    length: 50,
    default: SubscriptionStatus.TRIAL,
  })
  status: SubscriptionStatus;

  @Column({ name: 'trial_ends_at', type: 'timestamp', nullable: true })
  trialEndsAt: Date | null;

  @Column({ name: 'current_period_start', type: 'timestamp', nullable: true })
  currentPeriodStart: Date | null;

  @Column({ name: 'current_period_end', type: 'timestamp', nullable: true })
  currentPeriodEnd: Date | null;

  @Column({
    name: 'price_usd',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  priceUsd: number;

  @Column({ name: 'max_users', type: 'int', default: 1 })
  maxUsers: number;

  @Column({ name: 'max_companies', type: 'int', default: 1 })
  maxCompanies: number;

  @Column({ name: 'grace_period_days', type: 'int', default: 7 })
  gracePeriodDays: number;

  @Column({ name: 'last_payment_date', type: 'timestamp', nullable: true })
  lastPaymentDate: Date | null;

  @Column({ name: 'next_payment_date', type: 'timestamp', nullable: true })
  nextPaymentDate: Date | null;

  @Column({
    name: 'payment_method',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  paymentMethod: string | null;

  @Column({ name: 'suspended_at', type: 'timestamp', nullable: true })
  suspendedAt: Date | null;

  @Column({ name: 'suspension_reason', type: 'text', nullable: true })
  suspensionReason: string | null;

  @Column({ name: 'admin_notes', type: 'text', nullable: true })
  adminNotes: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
