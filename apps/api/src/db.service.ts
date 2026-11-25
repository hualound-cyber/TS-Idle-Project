import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { Redis } from 'ioredis';

@Injectable()
export class DbService implements OnModuleDestroy {
  public readonly pool: Pool;
  public readonly redis: Redis;

  constructor() {
    this.pool = new Pool({
      host: process.env.PGHOST || '127.0.0.1',
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER || 'tslegends',
      password: process.env.PGPASSWORD || 'tslegends_dev_password',
      database: process.env.PGDATABASE || 'tslegends',
      max: 20,
    });
    this.redis = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number(process.env.REDIS_PORT || 6379),
      lazyConnect: true,
    });
    this.redis.connect().catch(() => {
      // Redis fallback logged if unavailable
    });
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const res = await this.pool.query(sql, params);
    return res.rows;
  }

  async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getConfig<T = any>(key: string, fallback: T): Promise<T> {
    const row = await this.queryOne<{ config_value: T }>(
      'SELECT config_value FROM game_configurations WHERE config_key = $1',
      [key],
    );
    return row ? row.config_value : fallback;
  }

  async onModuleDestroy() {
    await this.pool.end();
    this.redis.disconnect();
  }
}
