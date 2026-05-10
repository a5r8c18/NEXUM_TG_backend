import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from '@redis/client';

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private client: RedisClientType | null = null;
  private isConnected = false;
  private readonly enabled: boolean;
  private readonly defaultTtl: number;

  constructor(private readonly configService: ConfigService) {
    this.enabled = this.configService.get<string>('REDIS_ENABLED', 'false') === 'true';
    this.defaultTtl = this.configService.get<number>('REDIS_CACHE_TTL', 300); // 5 min default
  }

  async onModuleInit() {
    if (!this.enabled) {
      this.logger.log('Redis cache DISABLED — running without cache');
      return;
    }

    try {
      const host = this.configService.get<string>('REDIS_HOST', 'localhost');
      const port = this.configService.get<number>('REDIS_PORT', 6379);
      const password = this.configService.get<string>('REDIS_PASSWORD', '');

      this.client = createClient({
        socket: { host, port, connectTimeout: 5000 },
        ...(password ? { password } : {}),
      }) as RedisClientType;

      this.client.on('error', (err) => {
        this.logger.warn(`Redis connection error: ${err.message}`);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        this.logger.log(`Redis connected at ${host}:${port}`);
        this.isConnected = true;
      });

      this.client.on('reconnecting', () => {
        this.logger.log('Redis reconnecting...');
      });

      await this.client.connect();
    } catch (error) {
      this.logger.warn(`Redis init failed: ${error?.message || error} — running without cache`);
      this.client = null;
      this.isConnected = false;
    }
  }

  async onModuleDestroy() {
    if (this.client && this.isConnected) {
      await this.client.quit();
      this.logger.log('Redis disconnected');
    }
  }

  /**
   * Get a cached value by key. Returns null if not found or Redis unavailable.
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.isAvailable()) return null;
    try {
      const data = await this.client!.get(key);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  }

  /**
   * Set a cached value with optional TTL in seconds.
   */
  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      const ttl = ttlSeconds ?? this.defaultTtl;
      await this.client!.setEx(key, ttl, JSON.stringify(value));
    } catch {
      // Silently fail — cache is optional
    }
  }

  /**
   * Delete a specific cache key.
   */
  async del(key: string): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      await this.client!.del(key);
    } catch {
      // Silently fail
    }
  }

  /**
   * Invalidate all keys matching a pattern (e.g., 'reports:company:1:*').
   */
  async invalidatePattern(pattern: string): Promise<number> {
    if (!this.isAvailable()) return 0;
    try {
      let deleted = 0;
      for await (const key of this.client!.scanIterator({ MATCH: pattern, COUNT: 100 })) {
        await this.client!.del(key);
        deleted++;
      }
      if (deleted > 0) {
        this.logger.debug(`Cache invalidated: ${deleted} keys matching "${pattern}"`);
      }
      return deleted;
    } catch {
      return 0;
    }
  }

  /**
   * Get-or-set pattern: returns cached value, or calls factory and caches result.
   */
  async getOrSet<T>(key: string, factory: () => Promise<T>, ttlSeconds?: number): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }
    const result = await factory();
    await this.set(key, result, ttlSeconds);
    return result;
  }

  private isAvailable(): boolean {
    return this.enabled && this.isConnected && this.client !== null;
  }
}
