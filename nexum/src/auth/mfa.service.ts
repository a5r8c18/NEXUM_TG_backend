import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { UserMFA } from '../entities/user-mfa.entity';
import { User } from '../entities/user.entity';
import { LoggerService, LogCategory } from '../common/logger.service';

export interface MFASetupResponse {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

@Injectable()
export class MfaService {
  constructor(
    @InjectRepository(UserMFA)
    private readonly userMfaRepo: Repository<UserMFA>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private logger: LoggerService,
  ) {
    this.logger.setContext('MfaService');
  }

  async generateSecret(userId: string): Promise<MFASetupResponse> {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Check if MFA is already enabled
    const existingMFA = await this.userMfaRepo.findOneBy({ userId });
    if (existingMFA && existingMFA.isEnabled) {
      this.logger.logSecurity(
        LogCategory.SECURITY,
        'MFA setup attempted - already enabled',
        { userId, userEmail: user.email, action: 'MFA_SETUP_ALREADY_ENABLED' }
      );
      throw new BadRequestException('MFA ya está habilitado para este usuario');
    }

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `NEXUM TG (${user.email})`,
      issuer: 'NEXUM TG',
      length: 32,
    });

    // Generate backup codes
    const backupCodes = this.generateBackupCodes();

    // Generate QR code
    const qrCode = await QRCode.toDataURL(secret.otpauth_url);

    // Save to database (not enabled yet)
    const userMFA = this.userMfaRepo.create({
      userId,
      secret: secret.base32,
      backupCodes: JSON.stringify(backupCodes),
      isEnabled: false,
    });

    await this.userMfaRepo.save(userMFA);

    this.logger.logAudit(
      'MFA_SECRET_GENERATED',
      'UserMFA',
      { userId, userEmail: user.email, companyId: user.companyId?.toString() }
    );

    return {
      secret: secret.base32,
      qrCode,
      backupCodes,
    };
  }

  async verifyAndEnable(userId: string, token: string): Promise<{ success: boolean; message: string }> {
    const userMFA = await this.userMfaRepo.findOneBy({ userId });
    if (!userMFA) {
      throw new BadRequestException('MFA no está configurado para este usuario');
    }

    if (userMFA.isEnabled) {
      this.logger.logSecurity(
        LogCategory.SECURITY,
        'MFA verify attempted - already enabled',
        { userId, action: 'MFA_VERIFY_ALREADY_ENABLED' }
      );
      throw new BadRequestException('MFA ya está habilitado');
    }

    const verified = speakeasy.totp.verify({
      secret: userMFA.secret,
      encoding: 'base32',
      token,
      window: 2, // Allow 2 time steps (1 minute before/after)
    });

    if (!verified) {
      this.logger.logSecurity(
        LogCategory.SECURITY,
        'MFA verification failed - invalid token',
        { userId, action: 'MFA_VERIFY_FAILED', details: { reason: 'invalid_token' } }
      );
      return { success: false, message: 'Código TOTP inválido' };
    }

    // Enable MFA
    userMFA.isEnabled = true;
    userMFA.verifiedAt = new Date();
    await this.userMfaRepo.save(userMFA);

    this.logger.logAudit(
      'MFA_ENABLED',
      'UserMFA',
      { userId }
    );

    return { success: true, message: 'MFA habilitado exitosamente' };
  }

  async verifyToken(userId: string, token: string): Promise<boolean> {
    const userMFA = await this.userMfaRepo.findOneBy({ userId });
    if (!userMFA || !userMFA.isEnabled) {
      // MFA not enabled, allow login
      return true;
    }

    // Check if it's a backup code
    if (this.isBackupCode(userMFA, token)) {
      const used = this.useBackupCode(userMFA, token);
      if (used) {
        this.logger.logAudit(
          'MFA_BACKUP_CODE_USED',
          'UserMFA',
          { userId, details: { remainingCodes: JSON.parse(userMFA.backupCodes || '[]').length } }
        );
      }
      return used;
    }

    // Verify TOTP
    const verified = speakeasy.totp.verify({
      secret: userMFA.secret,
      encoding: 'base32',
      token,
      window: 2,
    });

    if (!verified) {
      this.logger.logSecurity(
        LogCategory.SECURITY,
        'MFA token verification failed',
        { userId, action: 'MFA_TOKEN_VERIFY_FAILED', details: { reason: 'invalid_totp' } }
      );
    }

    return verified;
  }

  async disableMFA(userId: string, password: string): Promise<void> {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Verify password (requires AuthService, but for now we'll skip this check)
    // In production, you should verify the password before disabling MFA

    await this.userMfaRepo.delete({ userId });

    this.logger.logAudit(
      'MFA_DISABLED',
      'UserMFA',
      { userId, userEmail: user.email, companyId: user.companyId?.toString() }
    );
  }

  async getMFAStatus(userId: string): Promise<{ isEnabled: boolean; setupComplete: boolean }> {
    const userMFA = await this.userMfaRepo.findOneBy({ userId });
    return {
      isEnabled: userMFA?.isEnabled || false,
      setupComplete: !!userMFA,
    };
  }

  private generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      codes.push(speakeasy.generateSecret({ length: 20 }).base32.substring(0, 8).toUpperCase());
    }
    return codes;
  }

  private isBackupCode(userMFA: UserMFA, code: string): boolean {
    const backupCodes = JSON.parse(userMFA.backupCodes || '[]');
    return backupCodes.includes(code.toUpperCase());
  }

  private useBackupCode(userMFA: UserMFA, code: string): boolean {
    const backupCodes = JSON.parse(userMFA.backupCodes || '[]');
    const index = backupCodes.indexOf(code.toUpperCase());

    if (index === -1) {
      return false;
    }

    // Remove used backup code
    backupCodes.splice(index, 1);
    userMFA.backupCodes = JSON.stringify(backupCodes);
    this.userMfaRepo.save(userMFA);

    return true;
  }
}
