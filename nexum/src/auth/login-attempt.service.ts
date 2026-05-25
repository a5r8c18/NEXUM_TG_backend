import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoginAttempt } from '../entities/login-attempt.entity';

@Injectable()
export class LoginAttemptService {
  private readonly MAX_ATTEMPTS = 5;
  private readonly LOCKOUT_MINUTES = 15;

  constructor(
    @InjectRepository(LoginAttempt)
    private readonly loginAttemptRepo: Repository<LoginAttempt>,
  ) {}

  async recordAttempt(data: {
    userId?: string;
    email?: string;
    ipAddress?: string;
    userAgent?: string;
    success: boolean;
    failureReason?: string;
  }): Promise<void> {
    const attempt = this.loginAttemptRepo.create({
      ...data,
      attemptAt: new Date(),
    });
    await this.loginAttemptRepo.save(attempt);
  }

  async isLockedOut(email: string, ipAddress?: string): Promise<boolean> {
    const cutoffDate = new Date();
    cutoffDate.setMinutes(cutoffDate.getMinutes() - this.LOCKOUT_MINUTES);

    const failedAttempts = await this.loginAttemptRepo
      .createQueryBuilder('attempt')
      .where('attempt.email = :email', { email })
      .andWhere('attempt.success = :success', { success: false })
      .andWhere('attempt.attemptAt >= :cutoffDate', { cutoffDate })
      .getCount();

    if (ipAddress) {
      const ipFailedAttempts = await this.loginAttemptRepo
        .createQueryBuilder('attempt')
        .where('attempt.ipAddress = :ipAddress', { ipAddress })
        .andWhere('attempt.success = :success', { success: false })
        .andWhere('attempt.attemptAt >= :cutoffDate', { cutoffDate })
        .getCount();

      if (ipFailedAttempts >= this.MAX_ATTEMPTS) {
        return true;
      }
    }

    return failedAttempts >= this.MAX_ATTEMPTS;
  }

  async getRemainingAttempts(email: string, ipAddress?: string): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setMinutes(cutoffDate.getMinutes() - this.LOCKOUT_MINUTES);

    const failedAttempts = await this.loginAttemptRepo
      .createQueryBuilder('attempt')
      .where('attempt.email = :email', { email })
      .andWhere('attempt.success = :success', { success: false })
      .andWhere('attempt.attemptAt >= :cutoffDate', { cutoffDate })
      .getCount();

    return Math.max(0, this.MAX_ATTEMPTS - failedAttempts);
  }

  async cleanupOldAttempts(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30); // Keep 30 days

    const result = await this.loginAttemptRepo
      .createQueryBuilder('attempt')
      .delete()
      .where('attempt.attemptAt < :cutoffDate', { cutoffDate })
      .execute();

    return result.affected || 0;
  }
}
