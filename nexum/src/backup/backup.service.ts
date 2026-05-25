import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { LoggerService, LogCategory } from '../common/logger.service';

const execAsync = promisify(exec);

@Injectable()
export class BackupService {
  private backupDir: string;
  private retentionDays: number;

  constructor(
    private configService: ConfigService,
    private logger: LoggerService,
  ) {
    this.logger.setContext('BackupService');
    this.backupDir = this.configService.get<string>('BACKUP_DIR', './backups');
    this.retentionDays = this.configService.get<number>('BACKUP_RETENTION_DAYS', 30);

    // Ensure backup directory exists
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  async createBackup(userId?: string, userEmail?: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `nexum_backup_${timestamp}.sql`;
    const backupPath = path.join(this.backupDir, backupFileName);

    const dbHost = this.configService.get<string>('DB_HOST', 'localhost');
    const dbPort = this.configService.get<string>('DB_PORT', '5432');
    const dbUsername = this.configService.get<string>('DB_USERNAME', 'postgres');
    const dbPassword = this.configService.get<string>('DB_PASSWORD', '');
    const dbName = this.configService.get<string>('DB_NAME', 'nexum_db');

    try {
      const pgDumpCommand = `PGPASSWORD="${dbPassword}" pg_dump -h ${dbHost} -p ${dbPort} -U ${dbUsername} -d ${dbName} -F c -f "${backupPath}"`;

      this.logger.logAudit(
        'BACKUP_STARTED',
        'Backup',
        {
          backupFileName,
          dbHost,
          dbName,
          userId,
          userEmail,
        }
      );

      await execAsync(pgDumpCommand);

      this.logger.logAudit(
        'BACKUP_COMPLETED',
        'Backup',
        {
          backupFileName,
          backupPath,
          userId,
          userEmail,
        }
      );

      return backupPath;
    } catch (error) {
      this.logger.logSecurity(
        LogCategory.SECURITY,
        'Backup failed',
        {
          action: 'BACKUP_FAILED',
          details: { error: error.message },
          userId,
          userEmail,
        }
      );
      throw new Error(`Backup failed: ${error.message}`);
    }
  }

  async restoreBackup(backupFileName: string, userId?: string, userEmail?: string): Promise<void> {
    const backupPath = path.join(this.backupDir, backupFileName);

    if (!fs.existsSync(backupPath)) {
      throw new Error('Backup file not found');
    }

    const dbHost = this.configService.get<string>('DB_HOST', 'localhost');
    const dbPort = this.configService.get<string>('DB_PORT', '5432');
    const dbUsername = this.configService.get<string>('DB_USERNAME', 'postgres');
    const dbPassword = this.configService.get<string>('DB_PASSWORD', '');
    const dbName = this.configService.get<string>('DB_NAME', 'nexum_db');

    try {
      const pgRestoreCommand = `PGPASSWORD="${dbPassword}" pg_restore -h ${dbHost} -p ${dbPort} -U ${dbUsername} -d ${dbName} -c "${backupPath}"`;

      this.logger.logAudit(
        'RESTORE_STARTED',
        'Backup',
        {
          backupFileName,
          backupPath,
          dbHost,
          dbName,
          userId,
          userEmail,
        }
      );

      await execAsync(pgRestoreCommand);

      this.logger.logAudit(
        'RESTORE_COMPLETED',
        'Backup',
        {
          backupFileName,
          userId,
          userEmail,
        }
      );
    } catch (error) {
      this.logger.logSecurity(
        LogCategory.SECURITY,
        'Restore failed',
        {
          action: 'RESTORE_FAILED',
          details: { error: error.message },
          userId,
          userEmail,
        }
      );
      throw new Error(`Restore failed: ${error.message}`);
    }
  }

  async listBackups(): Promise<string[]> {
    const files = fs.readdirSync(this.backupDir);
    return files
      .filter((file) => file.startsWith('nexum_backup_') && file.endsWith('.sql'))
      .sort((a, b) => b.localeCompare(a)); // Sort by newest first
  }

  async deleteBackup(backupFileName: string, userId?: string, userEmail?: string): Promise<void> {
    const backupPath = path.join(this.backupDir, backupFileName);

    if (!fs.existsSync(backupPath)) {
      throw new Error('Backup file not found');
    }

    fs.unlinkSync(backupPath);

    this.logger.logAudit(
      'BACKUP_DELETED',
      'Backup',
      {
        backupFileName,
        userId,
        userEmail,
      }
    );
  }

  async applyRetentionPolicy(): Promise<{ deleted: number; kept: number }> {
    const files = await this.listBackups();
    const now = new Date();
    let deleted = 0;
    let kept = 0;

    for (const file of files) {
      const filePath = path.join(this.backupDir, file);
      const stats = fs.statSync(filePath);
      const fileAge = now.getTime() - stats.mtime.getTime();
      const fileAgeDays = fileAge / (1000 * 60 * 60 * 24);

      if (fileAgeDays > this.retentionDays) {
        fs.unlinkSync(filePath);
        deleted++;
      } else {
        kept++;
      }
    }

    this.logger.logAudit(
      'RETENTION_POLICY_APPLIED',
      'Backup',
      {
        deleted,
        kept,
        retentionDays: this.retentionDays,
      }
    );

    return { deleted, kept };
  }

  async cleanOldBackups(): Promise<{ deleted: number; kept: number }> {
    return this.applyRetentionPolicy();
  }

  async getBackupStats(): Promise<any> {
    const files = await this.listBackups();
    let totalSize = 0;

    for (const file of files) {
      const filePath = path.join(this.backupDir, file);
      const stats = fs.statSync(filePath);
      totalSize += stats.size;
    }

    return {
      totalBackups: files.length,
      totalSizeBytes: totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
      retentionDays: this.retentionDays,
      backupDir: this.backupDir,
    };
  }
}
