import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { ImmutableAuditLog } from '../entities/immutable-audit-log.entity';
import { LoggerService, LogCategory } from '../common/logger.service';

@Injectable()
export class ImmutableAuditService {
  constructor(
    @InjectRepository(ImmutableAuditLog)
    private readonly immutableAuditRepo: Repository<ImmutableAuditLog>,
    private logger: LoggerService,
  ) {
    this.logger.setContext('ImmutableAuditService');
  }

  async logImmutable(
    category: string,
    action: string,
    resource: string,
    context: any,
    userId?: string,
    userEmail?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<ImmutableAuditLog> {
    // Get the last entry to get its hash for chaining
    const lastEntry = await this.immutableAuditRepo.findOne({
      order: { sequenceNumber: 'DESC' },
    });

    const previousHash = lastEntry?.entryHash || '0000000000000000000000000000000000000000000000000000000000000000';
    const sequenceNumber = (lastEntry?.sequenceNumber || 0) + 1;

    // Create the entry data
    const entryData = {
      timestamp: new Date().toISOString(),
      category,
      action,
      resource,
      context,
      userId,
      userEmail,
      ipAddress,
      userAgent,
      previousHash,
      sequenceNumber,
    };

    // Calculate hash of the entry
    const entryHash = this.calculateHash(JSON.stringify(entryData));

    // Create the immutable log entry
    const immutableLog = this.immutableAuditRepo.create({
      tenantId: context?.tenantId,
      category,
      action,
      resource,
      context,
      userId,
      userEmail,
      ipAddress,
      userAgent,
      entryHash,
      previousHash,
      sequenceNumber,
    });

    const saved = await this.immutableAuditRepo.save(immutableLog);

    this.logger.logAudit(
      'IMMUTABLE_LOG_CREATED',
      'ImmutableAuditLog',
      {
        id: saved.id,
        category,
        action,
        sequenceNumber,
        entryHash: entryHash.substring(0, 16) + '...',
      }
    );

    return saved;
  }

  private calculateHash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  async verifyIntegrity(): Promise<{ valid: boolean; issues: string[] }> {
    const logs = await this.immutableAuditRepo.find({
      order: { sequenceNumber: 'ASC' },
    });

    const issues: string[] = [];

    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];

      // Verify sequence numbers are consecutive
      if (log.sequenceNumber !== i + 1) {
        issues.push(`Sequence number mismatch at index ${i}: expected ${i + 1}, got ${log.sequenceNumber}`);
      }

      // Verify hash chain
      if (i > 0) {
        const previousLog = logs[i - 1];
        if (log.previousHash !== previousLog.entryHash) {
          issues.push(
            `Hash chain broken at sequence ${log.sequenceNumber}: previous hash mismatch`
          );
        }
      }

      // Verify entry hash
      const entryData = {
        timestamp: log.timestamp.toISOString(),
        category: log.category,
        action: log.action,
        resource: log.resource,
        context: log.context,
        userId: log.userId,
        userEmail: log.userEmail,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        previousHash: log.previousHash,
        sequenceNumber: log.sequenceNumber,
      };

      const calculatedHash = this.calculateHash(JSON.stringify(entryData));
      if (calculatedHash !== log.entryHash) {
        issues.push(`Entry hash mismatch at sequence ${log.sequenceNumber}`);
      }
    }

    const valid = issues.length === 0;

    if (!valid) {
      this.logger.logSecurity(
        LogCategory.SECURITY,
        'Immutable audit log integrity check failed',
        { action: 'INTEGRITY_CHECK_FAILED', details: { issues } }
      );
    } else {
      this.logger.logAudit(
        'INTEGRITY_CHECK_PASSED',
        'ImmutableAuditLog',
        { totalLogs: logs.length }
      );
    }

    return { valid, issues };
  }

  async getLogsByTenant(tenantId: string, limit: number = 100): Promise<ImmutableAuditLog[]> {
    return this.immutableAuditRepo.find({
      where: { tenantId },
      order: { sequenceNumber: 'DESC' },
      take: limit,
    });
  }

  async getLogsByCategory(category: string, limit: number = 100): Promise<ImmutableAuditLog[]> {
    return this.immutableAuditRepo.find({
      where: { category },
      order: { sequenceNumber: 'DESC' },
      take: limit,
    });
  }
}
