import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { calculateCharacterStats, DEFAULT_STAT_GROWTH, StatGrowthConfig } from '@ts-legends/game-core';
import { DbService } from './db.service.js';
import { JWT_SECRET, JwtPayload } from './auth.guard.js';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly db: DbService) {}

  private async issueTokens(player: { player_id: string; username: string; role: 'PLAYER' | 'MODERATOR' | 'ADMIN' }) {
    const payload: JwtPayload = { sub: player.player_id, username: player.username, role: player.role };
    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '2h' });
    const jti = crypto.randomUUID();
    const refreshToken = jwt.sign({ ...payload, jti }, JWT_SECRET, { expiresIn: '7d' });
    await this.db.redis.set(`refresh:${jti}`, player.player_id, 'EX', 7 * 86400).catch(() => {});
    return { accessToken, refreshToken };
  }

  @Post('register')
  async register(@Body() body: { username?: string; email?: string; password?: string; displayName?: string }) {
    const username = String(body?.username ?? '').trim();
    const email = String(body?.email ?? '').trim().toLowerCase();
    const password = String(body?.password ?? '');
    const displayName = String(body?.displayName ?? username).trim();

    if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
      throw new BadRequestException('Username must be 3-32 alphanumeric/underscore characters');
    }
    if (!email.includes('@') || email.length > 250) {
      throw new BadRequestException('Invalid email address');
    }
    if (password.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const statGrowth = await this.db.getConfig<StatGrowthConfig>('stat_growth', DEFAULT_STAT_GROWTH);

    try {
      const created = await this.db.transaction(async (client) => {
        const pRes = await client.query(
          `INSERT INTO players (username, email, password_hash, role) VALUES ($1, $2, $3, 'PLAYER') RETURNING player_id, username, role`,
          [username, email, passwordHash],
        );
        const player = pRes.rows[0];

        // Starter warlord: character_id = 0 (or 1)
        const starterCharId = 0;
        const evoRes = await client.query(
          `SELECT * FROM character_evolutions WHERE character_id = $1 AND evolution_stage = 0`,
          [starterCharId],
        );
        const evo = evoRes.rows[0];

        await client.query(
          `INSERT INTO player_profiles (player_id, display_name, avatar_character_id, current_map_id, highest_map_id)
           VALUES ($1, $2, $3, 1, 1)`,
          [player.player_id, displayName || username, starterCharId],
        );

        await client.query(
          `INSERT INTO player_currency (player_id, gold, gems, spirit_stones, guild_coins)
           VALUES ($1, 1500, 450, 50, 0)`,
          [player.player_id],
        );

        // Grant starter character + compute stats + put in formation slot 1
        const pcRes = await client.query(
          `INSERT INTO player_characters (player_id, character_id, evolution_stage, level, star_level)
           VALUES ($1, $2, 0, 1, 1) RETURNING player_character_id`,
          [player.player_id, starterCharId],
        );
        const pcId = pcRes.rows[0].player_character_id;

        if (evo) {
          const stats = calculateCharacterStats(evo, 1, 0, 1, 0, [], statGrowth);
          await client.query(
            `INSERT INTO player_character_stats (player_character_id, hp, atk, def, matk, mdef, spd, crit, hit, eva, combat_power)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [pcId, stats.hp, stats.atk, stats.def, stats.matk, stats.mdef, stats.spd, stats.crit, stats.hit, stats.eva, stats.combat_power],
          );
          await client.query(
            `UPDATE player_profiles SET power_rating = $1 WHERE player_id = $2`,
            [stats.combat_power, player.player_id],
          );
          for (const sid of evo.skill_ids || []) {
            await client.query(
              `INSERT INTO player_skills (player_character_id, skill_id, skill_level) VALUES ($1, $2, 1) ON CONFLICT DO NOTHING`,
              [pcId, sid],
            );
          }
        }

        await client.query(
          `INSERT INTO player_formation (player_id, preset_index, slot_index, player_character_id, role_tag)
           VALUES ($1, 1, 1, $2, 'DAMAGE')`,
          [player.player_id, pcId],
        );

        // Starter inventory items
        await client.query(
          `INSERT INTO player_inventory (player_id, item_id, quantity) VALUES ($1, 1, 5), ($1, 5, 2), ($1, 6, 1), ($1, 8, 1)`,
          [player.player_id],
        );

        // Initialize quests
        await client.query(
          `INSERT INTO player_quests (player_id, quest_id, progress, status)
           SELECT $1, quest_id, 0, 'ACTIVE' FROM quests`,
          [player.player_id],
        );

        // Welcome mailbox
        await client.query(
          `INSERT INTO mailbox (player_id, title_th, body_th, attachments_json)
           VALUES ($1, 'ยินดีต้อนรับสู่ TS Legends!', 'รับเสบียงเริ่มต้นสำหรับแม่ทัพใหม่ ขอให้โชคดีในยุทธภพ!', '[{"type":"GEMS","amount":150},{"type":"GOLD","amount":500}]'::jsonb)`,
          [player.player_id],
        );

        return player;
      });

      const tokens = await this.issueTokens(created);
      return {
        player: { player_id: created.player_id, username: created.username, role: created.role },
        ...tokens,
      };
    } catch (err: any) {
      if (err?.code === '23505') {
        throw new ConflictException('Username or email already exists');
      }
      throw err;
    }
  }

  @Post('login')
  async login(@Body() body: { username?: string; password?: string }) {
    const username = String(body?.username ?? '').trim();
    const password = String(body?.password ?? '');
    if (!username || !password) {
      throw new BadRequestException('Username and password are required');
    }

    const player = await this.db.queryOne<{
      player_id: string;
      username: string;
      password_hash: string;
      role: 'PLAYER' | 'MODERATOR' | 'ADMIN';
      is_banned: boolean;
    }>('SELECT player_id, username, password_hash, role, is_banned FROM players WHERE username = $1', [username]);

    if (!player || !(await bcrypt.compare(password, player.password_hash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (player.is_banned) {
      throw new ForbiddenException('Account is suspended');
    }

    await this.db.query('UPDATE players SET last_login_at = NOW() WHERE player_id = $1', [player.player_id]);
    const tokens = await this.issueTokens(player);
    return {
      player: { player_id: player.player_id, username: player.username, role: player.role },
      ...tokens,
    };
  }

  @Post('refresh')
  async refresh(@Body() body: { refreshToken?: string }) {
    const token = String(body?.refreshToken ?? '');
    if (!token) throw new UnauthorizedException('Missing refreshToken');
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload & { jti?: string };
      if (!decoded.jti) throw new UnauthorizedException('Invalid refresh token');
      const stored = await this.db.redis.get(`refresh:${decoded.jti}`).catch(() => decoded.sub);
      if (!stored || stored !== decoded.sub) {
        throw new UnauthorizedException('Refresh token revoked');
      }
      await this.db.redis.del(`refresh:${decoded.jti}`).catch(() => {});
      const player = await this.db.queryOne<{ player_id: string; username: string; role: 'PLAYER' | 'MODERATOR' | 'ADMIN' }>(
        'SELECT player_id, username, role FROM players WHERE player_id = $1 AND is_banned = FALSE',
        [decoded.sub],
      );
      if (!player) throw new UnauthorizedException('Player not found');
      return this.issueTokens(player);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  @Post('logout')
  async logout(@Body() body: { refreshToken?: string }) {
    const token = String(body?.refreshToken ?? '');
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload & { jti?: string };
        if (decoded.jti) {
          await this.db.redis.del(`refresh:${decoded.jti}`).catch(() => {});
        }
      } catch {
        // ignore invalid token on logout
      }
    }
    return { ok: true };
  }
}
