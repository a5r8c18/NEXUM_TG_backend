import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RefreshToken } from './refresh-token.entity';
import { User } from '../entities/user.entity';
import * as crypto from 'crypto';

@Injectable()
export class RefreshTokenService {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
  ) {}

  async createRefreshToken(user: User, ipAddress?: string, userAgent?: string): Promise<RefreshToken & { token: string }> {
    console.log('REFRESH TOKEN SERVICE - Creating token for user:', user.id);
    
    try {
      // Revoke existing tokens for this user
      console.log('REFRESH TOKEN SERVICE - Revoking existing tokens');
      await this.revokeUserTokens(user.id);

      // Generate refresh token
      const token = crypto.randomBytes(64).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      
      console.log('REFRESH TOKEN SERVICE - Token generated');
      
      // Set expiration to 7 days
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      console.log('REFRESH TOKEN SERVICE - Creating refresh token entity');
      const refreshToken = this.refreshTokenRepo.create({
        userId: user.id,
        tokenHash,
        expiresAt,
        ipAddress,
        userAgent,
      });

      console.log('REFRESH TOKEN SERVICE - Saving refresh token');
      await this.refreshTokenRepo.save(refreshToken);

      console.log('REFRESH TOKEN SERVICE - Token saved successfully');
      // Return the actual token (not the hash)
      return { ...refreshToken, token };
    } catch (error) {
      console.log('REFRESH TOKEN SERVICE - Error:', error);
      throw error;
    }
  }

  async validateRefreshToken(token: string): Promise<RefreshToken | null> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    
    const refreshToken = await this.refreshTokenRepo.findOne({
      where: { tokenHash, isRevoked: false },
      relations: ['user'],
    });

    if (!refreshToken) {
      return null;
    }

    // Check if expired
    if (refreshToken.expiresAt < new Date()) {
      await this.revokeToken(refreshToken.id);
      return null;
    }

    return refreshToken;
  }

  async revokeToken(tokenId: string): Promise<void> {
    await this.refreshTokenRepo.update(tokenId, {
      isRevoked: true,
      revokedAt: new Date(),
    });
  }

  async revokeUserTokens(userId: string): Promise<void> {
    await this.refreshTokenRepo.update(
      { userId, isRevoked: false },
      { isRevoked: true, revokedAt: new Date() }
    );
  }

  async cleanupExpiredTokens(): Promise<void> {
    await this.refreshTokenRepo
      .createQueryBuilder()
      .delete()
      .where('expires_at < :now', { now: new Date() })
      .orWhere('is_revoked = :revoked', { revoked: true })
      .andWhere('revoked_at < :cutoff', { 
        cutoff: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
      })
      .execute();
  }

  async getUserTokens(userId: string): Promise<RefreshToken[]> {
    return this.refreshTokenRepo.find({
      where: { userId, isRevoked: false },
      order: { createdAt: 'DESC' },
    });
  }
}
