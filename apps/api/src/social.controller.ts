import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from './auth.guard.js';
import { DbService } from './db.service.js';

@Controller('api')
@UseGuards(JwtAuthGuard)
export class SocialController {
  constructor(private readonly db: DbService) {}

  @Get('rankings/:category')
  async getRankings(@Param('category') category: string) {
    const cat = category.toUpperCase();
    const rows = await this.db.query(
      `SELECT entity_id, display_name, score, updated_at
       FROM rankings WHERE category = $1 ORDER BY score DESC LIMIT 50`,
      [cat],
    );
    return { category: cat, items: rows };
  }

  @Get('guilds')
  async listGuilds(@Req() req: any) {
    const guilds = await this.db.query(
      `SELECT g.*, (SELECT count(*)::int FROM guild_members gm WHERE gm.guild_id = g.guild_id) AS member_count
       FROM guilds g ORDER BY g.level DESC, g.exp DESC LIMIT 50`,
    );
    const myGuild = await this.db.queryOne(
      `SELECT g.*, gm.role AS my_role FROM guild_members gm JOIN guilds g ON g.guild_id = gm.guild_id WHERE gm.player_id = $1`,
      [req.user.sub],
    );
    return { guilds, myGuild };
  }

  @Post('guilds')
  async createGuild(@Req() req: any, @Body() body: { name?: string; tag?: string; notice?: string }) {
    const playerId = req.user.sub;
    const name = String(body?.name ?? '').trim();
    const tag = String(body?.tag ?? '').trim().toUpperCase();
    if (name.length < 3 || tag.length < 2 || tag.length > 6) {
      throw new BadRequestException('Guild name (>=3) and tag (2-6) required');
    }
    return this.db.transaction(async (client) => {
      const existing = await client.query(`SELECT 1 FROM guild_members WHERE player_id = $1`, [playerId]);
      if (existing.rows[0]) throw new BadRequestException('คุณสังกัดกิลด์อยู่แล้ว');
      const gRes = await client.query(
        `INSERT INTO guilds (name, tag, leader_id, notice) VALUES ($1, $2, $3, $4) RETURNING *`,
        [name, tag, playerId, body?.notice ?? 'ยินดีต้อนรับสหายร่วมรบ!'],
      );
      await client.query(`INSERT INTO guild_members (guild_id, player_id, role) VALUES ($1, $2, 'LEADER')`, [
        gRes.rows[0].guild_id,
        playerId,
      ]);
      return gRes.rows[0];
    });
  }

  @Post('guilds/:guildId/join')
  async joinGuild(@Req() req: any, @Param('guildId') guildId: string) {
    const playerId = req.user.sub;
    const existing = await this.db.queryOne(`SELECT 1 FROM guild_members WHERE player_id = $1`, [playerId]);
    if (existing) throw new BadRequestException('คุณสังกัดกิลด์อยู่แล้ว');
    await this.db.query(`INSERT INTO guild_members (guild_id, player_id, role) VALUES ($1, $2, 'MEMBER')`, [
      guildId,
      playerId,
    ]);
    return { ok: true };
  }

  @Get('friends')
  async listFriends(@Req() req: any) {
    const rows = await this.db.query(
      `SELECT f.*, pp.display_name, pp.level, pp.power_rating
       FROM friends f
       JOIN player_profiles pp ON pp.player_id = f.friend_id
       WHERE f.player_id = $1`,
      [req.user.sub],
    );
    return { friends: rows };
  }

  @Post('friends/request')
  async requestFriend(@Req() req: any, @Body() body: { username?: string }) {
    const playerId = req.user.sub;
    const uname = String(body?.username ?? '').trim();
    if (!uname) throw new BadRequestException('กรุณาระบุชื่อผู้ใช้ (Username)');
    const target = await this.db.queryOne<{ player_id: string }>(`SELECT player_id FROM players WHERE username = $1`, [uname]);
    if (!target) throw new NotFoundException('ไม่พบผู้เล่นนี้');
    if (target.player_id === playerId) throw new BadRequestException('ไม่สามารถเพิ่มตัวเองเป็นเพื่อนได้');

    await this.db.query(
      `INSERT INTO friends (player_id, friend_id, status) VALUES ($1, $2, 'ACCEPTED') ON CONFLICT (player_id, friend_id) DO NOTHING`,
      [playerId, target.player_id],
    );
    return { ok: true };
  }

  @Get('mailbox')
  async listMail(@Req() req: any) {
    const rows = await this.db.query(
      `SELECT * FROM mailbox WHERE player_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.sub],
    );
    return { items: rows };
  }

  @Post('mailbox/:mailId/claim')
  async claimMail(@Req() req: any, @Param('mailId') mailId: string) {
    const playerId = req.user.sub;
    return this.db.transaction(async (client) => {
      const mRes = await client.query(
        `SELECT * FROM mailbox WHERE mail_id = $1 AND player_id = $2 FOR UPDATE`,
        [mailId, playerId],
      );
      const mail = mRes.rows[0];
      if (!mail) throw new NotFoundException('Mail not found');
      if (mail.is_claimed) throw new BadRequestException('รับของแนบในจดหมายนี้ไปแล้ว');

      await client.query(`UPDATE mailbox SET is_read = TRUE, is_claimed = TRUE WHERE mail_id = $1`, [mailId]);
      for (const att of mail.attachments_json || []) {
        if (att.type === 'GOLD') await client.query(`UPDATE player_currency SET gold = gold + $1 WHERE player_id = $2`, [att.amount, playerId]);
        if (att.type === 'GEMS') await client.query(`UPDATE player_currency SET gems = gems + $1 WHERE player_id = $2`, [att.amount, playerId]);
      }
      return { ok: true, attachments: mail.attachments_json };
    });
  }
}
