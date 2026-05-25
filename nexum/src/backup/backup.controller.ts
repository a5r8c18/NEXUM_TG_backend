import { Controller, Get, Post, Delete, Param, UseGuards, Request } from '@nestjs/common';
import { BackupService } from './backup.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';
import { LoggerService } from '../common/logger.service';

@Controller('backup')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
export class BackupController {
  constructor(
    private readonly backupService: BackupService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext('BackupController');
  }

  @Post('create')
  async createBackup(@Request() req) {
    const user = req.user;
    const backupPath = await this.backupService.createBackup(user.sub, user.email);
    return {
      success: true,
      message: 'Backup created successfully',
      backupPath,
    };
  }

  @Post('restore/:filename')
  async restoreBackup(@Param('filename') filename: string, @Request() req) {
    const user = req.user;
    await this.backupService.restoreBackup(filename, user.sub, user.email);
    return {
      success: true,
      message: 'Backup restored successfully',
    };
  }

  @Get('list')
  async listBackups() {
    const backups = await this.backupService.listBackups();
    return {
      success: true,
      backups,
    };
  }

  @Delete('delete/:filename')
  async deleteBackup(@Param('filename') filename: string, @Request() req) {
    const user = req.user;
    await this.backupService.deleteBackup(filename, user.sub, user.email);
    return {
      success: true,
      message: 'Backup deleted successfully',
    };
  }

  @Post('apply-retention')
  async applyRetentionPolicy() {
    const result = await this.backupService.applyRetentionPolicy();
    return {
      success: true,
      message: 'Retention policy applied successfully',
      ...result,
    };
  }

  @Get('stats')
  async getBackupStats() {
    const stats = await this.backupService.getBackupStats();
    return {
      success: true,
      ...stats,
    };
  }
}
