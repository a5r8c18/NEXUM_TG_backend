import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as crypto from 'crypto';

export interface CSRFToken {
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

@Injectable()
export class CsrfService {
  private readonly logger = new Logger(CsrfService.name);
  private readonly tokens = new Map<string, CSRFToken>();
  private readonly tokenExpiry = 3600000; // 1 hour in milliseconds
  private readonly maxTokens = 10000; // Maximum tokens to store

  constructor() {
    // Clean up expired tokens every 5 minutes
    setInterval(() => {
      this.cleanupExpiredTokens();
    }, 300000);
  }

  /**
   * Generate a new CSRF token
   */
  generateToken(sessionId?: string): string {
    // Clean up if we have too many tokens
    if (this.tokens.size >= this.maxTokens) {
      this.cleanupOldestTokens();
    }

    const token = this.generateSecureToken();
    const csrfToken: CSRFToken = {
      token,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + this.tokenExpiry),
    };

    // Store token with session ID if provided, otherwise use token as key
    const key = sessionId || token;
    this.tokens.set(key, csrfToken);

    this.logger.debug(`Generated CSRF token for session: ${sessionId || 'anonymous'}`);
    return token;
  }

  /**
   * Validate a CSRF token
   */
  validateToken(token: string, sessionId?: string): boolean {
    if (!token) {
      this.logger.warn('CSRF validation failed: No token provided');
      return false;
    }

    const key = sessionId || token;
    const storedToken = this.tokens.get(key);

    if (!storedToken) {
      this.logger.warn('CSRF validation failed: Token not found');
      return false;
    }

    if (storedToken.expiresAt < new Date()) {
      this.logger.warn('CSRF validation failed: Token expired');
      this.tokens.delete(key);
      return false;
    }

    if (storedToken.token !== token) {
      this.logger.warn('CSRF validation failed: Token mismatch');
      return false;
    }

    // Token is valid, optionally refresh it
    this.refreshToken(key, storedToken);
    
    this.logger.debug(`CSRF validation successful for session: ${sessionId || 'anonymous'}`);
    return true;
  }

  /**
   * Revoke a CSRF token
   */
  revokeToken(token: string, sessionId?: string): void {
    const key = sessionId || token;
    this.tokens.delete(key);
    this.logger.debug(`CSRF token revoked for session: ${sessionId || 'anonymous'}`);
  }

  /**
   * Revoke all tokens for a session
   */
  revokeSessionTokens(sessionId: string): void {
    this.tokens.delete(sessionId);
    this.logger.debug(`All CSRF tokens revoked for session: ${sessionId}`);
  }

  /**
   * Get token information
   */
  getTokenInfo(token: string, sessionId?: string): CSRFToken | null {
    const key = sessionId || token;
    return this.tokens.get(key) || null;
  }

  /**
   * Check if a token exists and is valid
   */
  isTokenValid(token: string, sessionId?: string): boolean {
    return this.validateToken(token, sessionId);
  }

  /**
   * Generate a secure random token
   */
  private generateSecureToken(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Refresh an existing token
   */
  private refreshToken(key: string, token: CSRFToken): void {
    token.expiresAt = new Date(Date.now() + this.tokenExpiry);
    this.tokens.set(key, token);
  }

  /**
   * Clean up expired tokens
   */
  private cleanupExpiredTokens(): void {
    const now = new Date();
    let cleaned = 0;

    for (const [key, token] of this.tokens.entries()) {
      if (token.expiresAt < now) {
        this.tokens.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} expired CSRF tokens`);
    }
  }

  /**
   * Clean up oldest tokens when we hit the limit
   */
  private cleanupOldestTokens(): void {
    const tokens = Array.from(this.tokens.entries());
    
    // Sort by creation date (oldest first)
    tokens.sort((a, b) => a[1].createdAt.getTime() - b[1].createdAt.getTime());
    
    // Remove the oldest 25% of tokens
    const toRemove = Math.floor(tokens.length * 0.25);
    
    for (let i = 0; i < toRemove; i++) {
      this.tokens.delete(tokens[i][0]);
    }

    this.logger.debug(`Cleaned up ${toRemove} oldest CSRF tokens`);
  }

  /**
   * Get statistics about stored tokens
   */
  getStats(): {
    total: number;
    expired: number;
    valid: number;
  } {
    const now = new Date();
    let expired = 0;
    let valid = 0;

    for (const token of this.tokens.values()) {
      if (token.expiresAt < now) {
        expired++;
      } else {
        valid++;
      }
    }

    return {
      total: this.tokens.size,
      expired,
      valid,
    };
  }
}
