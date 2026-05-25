import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BackupService } from './backup.service';

@Injectable()
export class BackupSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(BackupSchedulerService.name);
  private isEnabled: boolean;

  constructor(
    private readonly backupService: BackupService,
    private readonly configService: ConfigService,
  ) {
    this.isEnabled = this.configService.get<string>('BACKUP_AUTO_ENABLED', 'true') === 'true';
  }

  onModuleInit() {
    if (this.isEnabled) {
      this.logger.log('Backup automático habilitado — programado diariamente a las 02:00');
    } else {
      this.logger.log('Backup automático deshabilitado por configuración');
    }
  }

  // Backup diario a las 2:00 AM
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleDailyBackup() {
    if (!this.isEnabled) return;

    this.logger.log('Iniciando backup automático diario...');
    try {
      const backupPath = await this.backupService.createBackup('system', 'backup-scheduler@nexum');
      this.logger.log(`Backup automático completado: ${backupPath}`);

      // Limpiar backups antiguos
      await this.backupService.cleanOldBackups();
    } catch (error) {
      this.logger.error(`Error en backup automático: ${error.message}`, error.stack);
    }
  }

  // Backup semanal completo los domingos a las 3:00 AM
  @Cron('0 3 * * 0')
  async handleWeeklyBackup() {
    if (!this.isEnabled) return;

    this.logger.log('Iniciando backup semanal completo...');
    try {
      const backupPath = await this.backupService.createBackup('system', 'weekly-backup@nexum');
      this.logger.log(`Backup semanal completado: ${backupPath}`);
    } catch (error) {
      this.logger.error(`Error en backup semanal: ${error.message}`, error.stack);
    }
  }
}
