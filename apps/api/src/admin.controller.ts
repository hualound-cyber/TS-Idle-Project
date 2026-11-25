import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, Roles } from './auth.guard.js';
import { DbService } from './db.service.js';

@Controller('api/admin')
@UseGuards(JwtAuthGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly db: DbService) {}

  @Get('overview')
  async overview() {
    const stats = await this.db.queryOne(
      `SELECT
        (SELECT count(*)::int FROM players) AS total_players,
        (SELECT count(*)::int FROM battles) AS total_battles,
        (SELECT count(*)::int FROM guilds) AS total_guilds,
        (SELECT count(*)::int FROM characters) AS total_characters,
        (SELECT count(*)::int FROM skills) AS total_skills`,
    );
    const logs = await this.db.query(`SELECT * FROM admin_logs ORDER BY created_at DESC LIMIT 30`);
    const configs = await this.db.query(`SELECT * FROM game_configurations ORDER BY config_key ASC`);
    return { stats, logs, configs };
  }

  @Put('configs/:key')
  async updateConfig(@Req() req: any, @Param('key') key: string, @Body() body: { value: any }) {
    const adminId = req.user.sub;
    return this.db.transaction(async (client) => {
      const prev = await client.query(`SELECT config_value FROM game_configurations WHERE config_key = $1`, [key]);
      await client.query(
        `INSERT INTO game_configurations (config_key, config_value, updated_by, updated_at)
         VALUES ($1, $2::jsonb, $3, NOW())
         ON CONFLICT (config_key) DO UPDATE SET config_value = $2::jsonb, updated_by = $3, updated_at = NOW()`,
        [key, JSON.stringify(body.value), adminId],
      );
      await client.query(
        `INSERT INTO admin_logs (admin_id, action, target_table, target_id, before_json, after_json)
         VALUES ($1, 'UPDATE_CONFIG', 'game_configurations', $2, $3::jsonb, $4::jsonb)`,
        [adminId, key, JSON.stringify(prev.rows[0]?.config_value ?? null), JSON.stringify(body.value)],
      );
      return { ok: true, config_key: key, config_value: body.value };
    });
  }

  @Post('announcement')
  async sendAnnouncement(@Req() req: any, @Body() body: { title_th: string; body_th: string; gems?: number }) {
    const adminId = req.user.sub;
    const attachments = body.gems && body.gems > 0 ? [{ type: 'GEMS', amount: body.gems }] : [];
    const res = await this.db.query(
      `INSERT INTO mailbox (player_id, title_th, body_th, attachments_json)
       SELECT player_id, $1, $2, $3::jsonb FROM players RETURNING mail_id`,
      [body.title_th, body.body_th, JSON.stringify(attachments)],
    );
    await this.db.query(
      `INSERT INTO admin_logs (admin_id, action, target_table, after_json)
       VALUES ($1, 'SEND_ANNOUNCEMENT', 'mailbox', $2::jsonb)`,
      [adminId, JSON.stringify({ title_th: body.title_th, recipients: res.length })],
    );
    return { ok: true, sent_count: res.length };
  }

  @Get('players')
  async listPlayers() {
    const players = await this.db.query(
      `SELECT p.player_id, p.username, p.role, p.is_banned, p.last_login_at, pp.display_name, pp.level, pp.power_rating
       FROM players p JOIN player_profiles pp ON pp.player_id = p.player_id
       ORDER BY p.created_at DESC LIMIT 50`,
    );
    return { players };
  }

  @Post('players/:id/ban')
  async toggleBan(@Req() req: any, @Param('id') targetId: string, @Body() body: { banned: boolean }) {
    const adminId = req.user.sub;
    await this.db.query(`UPDATE players SET is_banned = $1 WHERE player_id = $2`, [Boolean(body?.banned), targetId]);
    await this.db.query(
      `INSERT INTO admin_logs (admin_id, action, target_table, target_id, after_json)
       VALUES ($1, $2, 'players', $3, $4::jsonb)`,
      [adminId, body?.banned ? 'BAN_PLAYER' : 'UNBAN_PLAYER', targetId, JSON.stringify({ is_banned: Boolean(body?.banned) })],
    );
    return { ok: true, is_banned: Boolean(body?.banned) };
  }
}
