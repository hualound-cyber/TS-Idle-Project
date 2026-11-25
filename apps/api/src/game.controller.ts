import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  BattleSkill,
  calculateCharacterStats,
  calculateIdleRewards,
  CombatantInput,
  CombatBalanceConfig,
  DEFAULT_COMBAT_BALANCE,
  DEFAULT_STAT_GROWTH,
  ElementType,
  simulateBattle,
  StatGrowthConfig,
} from '@ts-legends/game-core';
import { PoolClient } from 'pg';
import { JwtAuthGuard } from './auth.guard.js';
import { DbService } from './db.service.js';

@Controller('api')
@UseGuards(JwtAuthGuard)
export class GameController {
  constructor(private readonly db: DbService) {}

  private async recalculateAndSaveCharStats(client: PoolClient, pcId: string, statGrowth: StatGrowthConfig) {
    const pcRes = await client.query(
      `SELECT pc.*, ce.base_hp, ce.base_sp, ce.base_int, ce.base_atk, ce.base_def, ce.base_agi
       FROM player_characters pc
       JOIN character_evolutions ce ON ce.character_id = pc.character_id AND ce.evolution_stage = pc.evolution_stage
       WHERE pc.player_character_id = $1`,
      [pcId],
    );
    const pc = pcRes.rows[0];
    if (!pc) return null;

    const eqRes = await client.query(
      `SELECT eq.*, pi.enhance_level
       FROM player_equipment pe
       JOIN player_inventory pi ON pi.inventory_id = pe.inventory_id
       JOIN equipment eq ON eq.item_id = pi.item_id
       WHERE pe.player_character_id = $1`,
      [pcId],
    );
    const bonuses = eqRes.rows.map((r: any) => {
      const mult = 1 + (r.enhance_level || 0) * 0.1;
      return {
        hp_bonus: Math.round(r.hp_bonus * mult),
        atk_bonus: Math.round(r.atk_bonus * mult),
        def_bonus: Math.round(r.def_bonus * mult),
        matk_bonus: Math.round(r.matk_bonus * mult),
        mdef_bonus: Math.round(r.mdef_bonus * mult),
        spd_bonus: Math.round(r.spd_bonus * mult),
        crit_bonus: Number(r.crit_bonus),
        hit_bonus: Number(r.hit_bonus),
        eva_bonus: Number(r.eva_bonus),
      };
    });

    const stats = calculateCharacterStats(pc, pc.level, pc.evolution_stage, pc.star_level, pc.bond_level, bonuses, statGrowth);
    await client.query(
      `INSERT INTO player_character_stats (player_character_id, hp, atk, def, matk, mdef, spd, crit, hit, eva, combat_power, recalculated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
       ON CONFLICT (player_character_id) DO UPDATE SET
         hp=$2, atk=$3, def=$4, matk=$5, mdef=$6, spd=$7, crit=$8, hit=$9, eva=$10, combat_power=$11, recalculated_at=NOW()`,
      [pcId, stats.hp, stats.atk, stats.def, stats.matk, stats.mdef, stats.spd, stats.crit, stats.hit, stats.eva, stats.combat_power],
    );
    return stats;
  }

  private async updatePlayerPowerRating(client: PoolClient, playerId: string) {
    const res = await client.query(
      `SELECT COALESCE(SUM(pcs.combat_power), 0)::int AS total_power
       FROM player_formation pf
       JOIN player_character_stats pcs ON pcs.player_character_id = pf.player_character_id
       WHERE pf.player_id = $1 AND pf.preset_index = 1`,
      [playerId],
    );
    const power = res.rows[0]?.total_power ?? 0;
    await client.query(
      `UPDATE player_profiles SET power_rating = $1, updated_at = NOW() WHERE player_id = $2`,
      [power, playerId],
    );
    await client.query(
      `INSERT INTO rankings (category, entity_id, display_name, score, updated_at)
       SELECT 'POWER', player_id, display_name, $1, NOW() FROM player_profiles WHERE player_id = $2
       ON CONFLICT (category, entity_id) DO UPDATE SET score = EXCLUDED.score, display_name = EXCLUDED.display_name, updated_at = NOW()`,
      [power, playerId],
    );
    return power;
  }

  private async advanceQuest(client: PoolClient, playerId: string, targetType: string, inc = 1) {
    await client.query(
      `UPDATE player_quests pq
       SET progress = LEAST(q.target_count, pq.progress + $3),
           status = CASE WHEN pq.progress + $3 >= q.target_count AND pq.status = 'ACTIVE' THEN 'COMPLETED' ELSE pq.status END,
           updated_at = NOW()
       FROM quests q
       WHERE pq.quest_id = q.quest_id AND pq.player_id = $1 AND q.target_type = $2 AND pq.status = 'ACTIVE'`,
      [playerId, targetType, inc],
    );
  }

  @Get('player/me')
  async getMe(@Req() req: any) {
    const playerId = req.user.sub;
    const profile = await this.db.queryOne(
      `SELECT p.username, p.email, p.role, pp.*, m.name_th AS current_map_name_th, m.name_en AS current_map_name_en
       FROM players p
       JOIN player_profiles pp ON pp.player_id = p.player_id
       JOIN maps m ON m.map_id = pp.current_map_id
       WHERE p.player_id = $1`,
      [playerId],
    );
    if (!profile) throw new NotFoundException('Player not found');

    const currency = await this.db.queryOne('SELECT * FROM player_currency WHERE player_id = $1', [playerId]);
    const characters = await this.db.query(
      `SELECT pc.*, c.name_th, c.element, c.rarity, c.max_evolution_stage, c.gender,
              ce.form_name_th, ce.asset_key, ce.skill_ids,
              pcs.hp, pcs.atk, pcs.def, pcs.matk, pcs.mdef, pcs.spd, pcs.crit, pcs.hit, pcs.eva, pcs.combat_power
       FROM player_characters pc
       JOIN characters c ON c.character_id = pc.character_id
       JOIN character_evolutions ce ON ce.character_id = pc.character_id AND ce.evolution_stage = pc.evolution_stage
       LEFT JOIN player_character_stats pcs ON pcs.player_character_id = pc.player_character_id
       WHERE pc.player_id = $1
       ORDER BY pcs.combat_power DESC NULLS LAST, pc.obtained_at ASC`,
      [playerId],
    );
    const formation = await this.db.query(
      `SELECT * FROM player_formation WHERE player_id = $1 AND preset_index = 1 ORDER BY slot_index ASC`,
      [playerId],
    );
    const inventory = await this.db.query(
      `SELECT pi.*, i.code, i.name_th, i.name_en, i.item_type, i.rarity, i.description_th,
              eq.slot, eq.hp_bonus, eq.atk_bonus, eq.def_bonus, eq.matk_bonus, eq.mdef_bonus, eq.spd_bonus
       FROM player_inventory pi
       JOIN items i ON i.item_id = pi.item_id
       LEFT JOIN equipment eq ON eq.item_id = i.item_id
       WHERE pi.player_id = $1 AND pi.quantity > 0
       ORDER BY pi.created_at DESC`,
      [playerId],
    );
    const quests = await this.db.query(
      `SELECT pq.*, q.code, q.title_th, q.title_en, q.quest_type, q.target_type, q.target_count, q.description_th,
              COALESCE((SELECT json_agg(qr) FROM quest_rewards qr WHERE qr.quest_id = q.quest_id), '[]'::json) AS rewards
       FROM player_quests pq
       JOIN quests q ON q.quest_id = pq.quest_id
       WHERE pq.player_id = $1
       ORDER BY q.quest_id ASC`,
      [playerId],
    );
    const equipped = await this.db.query(
      `SELECT pe.*, pi.item_id, pi.enhance_level, i.name_th
       FROM player_equipment pe
       JOIN player_inventory pi ON pi.inventory_id = pe.inventory_id
       JOIN items i ON i.item_id = pi.item_id
       JOIN player_characters pc ON pc.player_character_id = pe.player_character_id
       WHERE pc.player_id = $1`,
      [playerId],
    );
    const charSkills = await this.db.query(
      `SELECT ps.*, s.name_th, s.element, s.category_th, s.sp_cost, s.target_desc_th, s.description_th, s.is_spirit
       FROM player_skills ps
       JOIN skills s ON s.skill_id = ps.skill_id
       JOIN player_characters pc ON pc.player_character_id = ps.player_character_id
       WHERE pc.player_id = $1
       ORDER BY ps.skill_id ASC`,
      [playerId],
    );

    return { profile, currency, characters, formation, inventory, quests, equipped, charSkills };
  }

  @Post('characters/summon')
  async summon(@Req() req: any, @Body() body: { count?: number; useTicket?: boolean }) {
    const playerId = req.user.sub;
    const count = body?.count === 10 ? 10 : 1;
    const summonCfg = await this.db.getConfig('summon_rates', {
      cost_gems: 150,
      cost_gems_10: 1350,
      weights: { SSR: 0.05, SR: 0.15, R: 0.35, N: 0.45 },
    });
    const statGrowth = await this.db.getConfig<StatGrowthConfig>('stat_growth', DEFAULT_STAT_GROWTH);

    return this.db.transaction(async (client) => {
      const curRes = await client.query('SELECT * FROM player_currency WHERE player_id = $1 FOR UPDATE', [playerId]);
      const cur = curRes.rows[0];
      if (!cur) throw new NotFoundException('Currency record not found');

      if (body?.useTicket && count === 1) {
        const tkRes = await client.query(
          `SELECT * FROM player_inventory WHERE player_id = $1 AND item_id = 5 AND quantity >= 1 FOR UPDATE`,
          [playerId],
        );
        if (!tkRes.rows[0]) throw new BadRequestException('ไม่พบป้ายอัญเชิญขุนพล');
        await client.query('UPDATE player_inventory SET quantity = quantity - 1 WHERE inventory_id = $1', [tkRes.rows[0].inventory_id]);
      } else {
        const cost = count === 10 ? summonCfg.cost_gems_10 : summonCfg.cost_gems;
        if (Number(cur.gems) < cost) {
          throw new BadRequestException(`ตำลึงทอง (Gems) ไม่เพียงพอ (ต้องการ ${cost})`);
        }
        await client.query('UPDATE player_currency SET gems = gems - $1, updated_at = NOW() WHERE player_id = $2', [cost, playerId]);
      }

      const results: any[] = [];
      for (let i = 0; i < count; i++) {
        const roll = Math.random();
        let rarity: 'SSR' | 'SR' | 'R' | 'N' = 'N';
        if (roll < summonCfg.weights.SSR) rarity = 'SSR';
        else if (roll < summonCfg.weights.SSR + summonCfg.weights.SR) rarity = 'SR';
        else if (roll < summonCfg.weights.SSR + summonCfg.weights.SR + summonCfg.weights.R) rarity = 'R';

        const charRes = await client.query(
          `SELECT c.*, ce.base_hp, ce.base_sp, ce.base_int, ce.base_atk, ce.base_def, ce.base_agi, ce.skill_ids, ce.asset_key
           FROM characters c
           JOIN character_evolutions ce ON ce.character_id = c.character_id AND ce.evolution_stage = 0
           WHERE c.rarity = $1
           ORDER BY RANDOM() LIMIT 1`,
          [rarity],
        );
        const ch = charRes.rows[0];
        const existing = await client.query(
          `SELECT player_character_id, star_level FROM player_characters WHERE player_id = $1 AND character_id = $2`,
          [playerId, ch.character_id],
        );
        if (existing.rows[0]) {
          // Duplicate -> +1 Star (up to 10) + 10 Spirit Stones
          const newStar = Math.min(10, existing.rows[0].star_level + 1);
          await client.query(`UPDATE player_characters SET star_level = $1 WHERE player_character_id = $2`, [
            newStar,
            existing.rows[0].player_character_id,
          ]);
          await client.query(`UPDATE player_currency SET spirit_stones = spirit_stones + 10 WHERE player_id = $1`, [playerId]);
          await this.recalculateAndSaveCharStats(client, existing.rows[0].player_character_id, statGrowth);
          results.push({ ...ch, isDuplicate: true, newStar });
        } else {
          const ins = await client.query(
            `INSERT INTO player_characters (player_id, character_id, evolution_stage, level, star_level)
             VALUES ($1, $2, 0, 1, 1) RETURNING player_character_id`,
            [playerId, ch.character_id],
          );
          const pcId = ins.rows[0].player_character_id;
          for (const sid of ch.skill_ids || []) {
            await client.query(
              `INSERT INTO player_skills (player_character_id, skill_id, skill_level) VALUES ($1, $2, 1) ON CONFLICT DO NOTHING`,
              [pcId, sid],
            );
          }
          await this.recalculateAndSaveCharStats(client, pcId, statGrowth);
          results.push({ ...ch, player_character_id: pcId, isDuplicate: false, newStar: 1 });
        }
      }

      await this.advanceQuest(client, playerId, 'SUMMON_COUNT', count);
      const countRes = await client.query('SELECT count(*)::int AS cnt FROM player_characters WHERE player_id = $1', [playerId]);
      await client.query(
        `UPDATE player_quests pq SET progress = LEAST(q.target_count, $2),
         status = CASE WHEN $2 >= q.target_count AND pq.status = 'ACTIVE' THEN 'COMPLETED' ELSE pq.status END
         FROM quests q WHERE pq.quest_id = q.quest_id AND pq.player_id = $1 AND q.target_type = 'COLLECT_CHARS' AND pq.status = 'ACTIVE'`,
        [playerId, countRes.rows[0].cnt],
      );
      await this.updatePlayerPowerRating(client, playerId);

      return { summoned: results };
    });
  }

  @Post('characters/:pcId/level-up')
  async levelUpCharacter(@Req() req: any, @Param('pcId') pcId: string) {
    const playerId = req.user.sub;
    const statGrowth = await this.db.getConfig<StatGrowthConfig>('stat_growth', DEFAULT_STAT_GROWTH);

    return this.db.transaction(async (client) => {
      const pcRes = await client.query(
        `SELECT * FROM player_characters WHERE player_character_id = $1 AND player_id = $2 FOR UPDATE`,
        [pcId, playerId],
      );
      const pc = pcRes.rows[0];
      if (!pc) throw new NotFoundException('Character not found');

      const goldCost = pc.level * 120;
      const curRes = await client.query(`SELECT gold FROM player_currency WHERE player_id = $1 FOR UPDATE`, [playerId]);
      if (Number(curRes.rows[0].gold) < goldCost) {
        throw new BadRequestException(`เงินตำลึง (Gold) ไม่เพียงพอ (ต้องการ ${goldCost})`);
      }

      await client.query(`UPDATE player_currency SET gold = gold - $1, updated_at = NOW() WHERE player_id = $2`, [goldCost, playerId]);
      const newLevel = pc.level + 1;
      await client.query(`UPDATE player_characters SET level = $1 WHERE player_character_id = $2`, [newLevel, pcId]);
      const stats = await this.recalculateAndSaveCharStats(client, pcId, statGrowth);
      await this.advanceQuest(client, playerId, 'LEVEL_UP_CHAR', 1);
      await this.updatePlayerPowerRating(client, playerId);

      return { level: newLevel, goldCost, stats };
    });
  }

  @Post('characters/:pcId/evolve')
  async evolveCharacter(@Req() req: any, @Param('pcId') pcId: string) {
    const playerId = req.user.sub;
    const statGrowth = await this.db.getConfig<StatGrowthConfig>('stat_growth', DEFAULT_STAT_GROWTH);

    return this.db.transaction(async (client) => {
      const pcRes = await client.query(
        `SELECT pc.*, c.max_evolution_stage
         FROM player_characters pc
         JOIN characters c ON c.character_id = pc.character_id
         WHERE pc.player_character_id = $1 AND pc.player_id = $2 FOR UPDATE`,
        [pcId, playerId],
      );
      const pc = pcRes.rows[0];
      if (!pc) throw new NotFoundException('Character not found');
      if (pc.evolution_stage >= pc.max_evolution_stage) {
        throw new BadRequestException('ขุนพลตัวนี้จุติถึงขั้นสูงสุดแล้ว');
      }
      const nextStage = pc.evolution_stage + 1;
      const reqLevel = nextStage === 1 ? 10 : 30;
      if (pc.level < reqLevel) {
        throw new BadRequestException(`ต้องมีเลเวลอย่างน้อย ${reqLevel} เพื่อจุติขั้น ${nextStage}`);
      }
      const stoneCost = nextStage * 20;
      const curRes = await client.query(`SELECT spirit_stones FROM player_currency WHERE player_id = $1 FOR UPDATE`, [playerId]);
      if (Number(curRes.rows[0].spirit_stones) < stoneCost) {
        throw new BadRequestException(`หินจิต (Spirit Stones) ไม่เพียงพอ (ต้องการ ${stoneCost})`);
      }

      await client.query(`UPDATE player_currency SET spirit_stones = spirit_stones - $1 WHERE player_id = $2`, [stoneCost, playerId]);
      await client.query(`UPDATE player_characters SET evolution_stage = $1 WHERE player_character_id = $2`, [nextStage, pcId]);

      const evoRes = await client.query(
        `SELECT skill_ids FROM character_evolutions WHERE character_id = $1 AND evolution_stage = $2`,
        [pc.character_id, nextStage],
      );
      for (const sid of evoRes.rows[0]?.skill_ids || []) {
        await client.query(
          `INSERT INTO player_skills (player_character_id, skill_id, skill_level) VALUES ($1, $2, 1) ON CONFLICT DO NOTHING`,
          [pcId, sid],
        );
      }

      const stats = await this.recalculateAndSaveCharStats(client, pcId, statGrowth);
      await this.updatePlayerPowerRating(client, playerId);
      return { evolution_stage: nextStage, stoneCost, stats };
    });
  }

  @Post('characters/:pcId/skills/:skillId/upgrade')
  async upgradeSkill(@Req() req: any, @Param('pcId') pcId: string, @Param('skillId') skillId: string) {
    const playerId = req.user.sub;
    return this.db.transaction(async (client) => {
      const psRes = await client.query(
        `SELECT ps.* FROM player_skills ps
         JOIN player_characters pc ON pc.player_character_id = ps.player_character_id
         WHERE ps.player_character_id = $1 AND ps.skill_id = $2 AND pc.player_id = $3 FOR UPDATE`,
        [pcId, Number(skillId), playerId],
      );
      const ps = psRes.rows[0];
      if (!ps) throw new NotFoundException('Skill not unlocked for this warlord');
      if (ps.skill_level >= 20) throw new BadRequestException('สกิลถึงระดับสูงสุด (Lv.20) แล้ว');

      const goldCost = ps.skill_level * 250;
      const curRes = await client.query(`SELECT gold FROM player_currency WHERE player_id = $1 FOR UPDATE`, [playerId]);
      if (Number(curRes.rows[0].gold) < goldCost) {
        throw new BadRequestException(`Gold ไม่เพียงพอ (ต้องการ ${goldCost})`);
      }

      await client.query(`UPDATE player_currency SET gold = gold - $1 WHERE player_id = $2`, [goldCost, playerId]);
      const newLv = ps.skill_level + 1;
      await client.query(`UPDATE player_skills SET skill_level = $1 WHERE id = $2`, [newLv, ps.id]);
      return { skill_id: Number(skillId), skill_level: newLv, goldCost };
    });
  }

  @Put('formation')
  async updateFormation(
    @Req() req: any,
    @Body() body: { slots: Array<{ slot_index: number; player_character_id: string; role_tag?: string }> },
  ) {
    const playerId = req.user.sub;
    const slots = body?.slots ?? [];
    if (slots.length === 0 || slots.length > 5) {
      throw new BadRequestException('Formation must contain 1 to 5 warlords');
    }

    return this.db.transaction(async (client) => {
      await client.query(`DELETE FROM player_formation WHERE player_id = $1 AND preset_index = 1`, [playerId]);
      for (const s of slots) {
        if (s.slot_index < 1 || s.slot_index > 6) throw new BadRequestException('slot_index must be 1..6');
        const owns = await client.query(
          `SELECT 1 FROM player_characters WHERE player_character_id = $1 AND player_id = $2`,
          [s.player_character_id, playerId],
        );
        if (!owns.rows[0]) throw new BadRequestException('Invalid character in formation');
        const role = ['TANK', 'DAMAGE', 'SUPPORT', 'HEALER'].includes(s.role_tag || '')
          ? s.role_tag
          : s.slot_index <= 3
            ? 'TANK'
            : 'DAMAGE';
        await client.query(
          `INSERT INTO player_formation (player_id, preset_index, slot_index, player_character_id, role_tag)
           VALUES ($1, 1, $2, $3, $4)`,
          [playerId, s.slot_index, s.player_character_id, role],
        );
      }
      const power = await this.updatePlayerPowerRating(client, playerId);
      return { ok: true, power_rating: power };
    });
  }

  @Post('equipment/equip')
  async equipItem(@Req() req: any, @Body() body: { player_character_id: string; inventory_id: string }) {
    const playerId = req.user.sub;
    const statGrowth = await this.db.getConfig<StatGrowthConfig>('stat_growth', DEFAULT_STAT_GROWTH);

    return this.db.transaction(async (client) => {
      const invRes = await client.query(
        `SELECT pi.*, eq.slot FROM player_inventory pi
         JOIN equipment eq ON eq.item_id = pi.item_id
         WHERE pi.inventory_id = $1 AND pi.player_id = $2 FOR UPDATE`,
        [body.inventory_id, playerId],
      );
      const inv = invRes.rows[0];
      if (!inv) throw new BadRequestException('Equipment item not found in inventory');

      // Unequip previous in same slot or same item
      await client.query(`DELETE FROM player_equipment WHERE inventory_id = $1`, [inv.inventory_id]);
      const prevRes = await client.query(
        `DELETE FROM player_equipment WHERE player_character_id = $1 AND slot = $2 RETURNING inventory_id`,
        [body.player_character_id, inv.slot],
      );
      if (prevRes.rows[0]) {
        await client.query(`UPDATE player_inventory SET is_equipped = FALSE WHERE inventory_id = $1`, [prevRes.rows[0].inventory_id]);
      }

      await client.query(
        `INSERT INTO player_equipment (player_character_id, slot, inventory_id) VALUES ($1, $2, $3)`,
        [body.player_character_id, inv.slot, inv.inventory_id],
      );
      await client.query(`UPDATE player_inventory SET is_equipped = TRUE WHERE inventory_id = $1`, [inv.inventory_id]);
      const stats = await this.recalculateAndSaveCharStats(client, body.player_character_id, statGrowth);
      await this.updatePlayerPowerRating(client, playerId);
      return { ok: true, slot: inv.slot, stats };
    });
  }

  @Post('equipment/enhance')
  async enhanceItem(@Req() req: any, @Body() body: { inventory_id: string }) {
    const playerId = req.user.sub;
    const statGrowth = await this.db.getConfig<StatGrowthConfig>('stat_growth', DEFAULT_STAT_GROWTH);

    return this.db.transaction(async (client) => {
      const invRes = await client.query(
        `SELECT pi.* FROM player_inventory pi JOIN equipment eq ON eq.item_id = pi.item_id
         WHERE pi.inventory_id = $1 AND pi.player_id = $2 FOR UPDATE`,
        [body.inventory_id, playerId],
      );
      const inv = invRes.rows[0];
      if (!inv) throw new NotFoundException('Equipment not found');
      if (inv.enhance_level >= 15) throw new BadRequestException('ตีบวกถึงระดับสูงสุด (+15) แล้ว');

      const goldCost = (inv.enhance_level + 1) * 200;
      const curRes = await client.query(`SELECT gold FROM player_currency WHERE player_id = $1 FOR UPDATE`, [playerId]);
      if (Number(curRes.rows[0].gold) < goldCost) throw new BadRequestException(`Gold ไม่พอ (ต้องการ ${goldCost})`);

      await client.query(`UPDATE player_currency SET gold = gold - $1 WHERE player_id = $2`, [goldCost, playerId]);
      const newLv = inv.enhance_level + 1;
      await client.query(`UPDATE player_inventory SET enhance_level = $1 WHERE inventory_id = $2`, [newLv, inv.inventory_id]);

      const eqOwner = await client.query(`SELECT player_character_id FROM player_equipment WHERE inventory_id = $1`, [inv.inventory_id]);
      if (eqOwner.rows[0]) {
        await this.recalculateAndSaveCharStats(client, eqOwner.rows[0].player_character_id, statGrowth);
        await this.updatePlayerPowerRating(client, playerId);
      }
      return { enhance_level: newLv, goldCost };
    });
  }

  @Get('idle/status')
  async getIdleStatus(@Req() req: any) {
    const playerId = req.user.sub;
    const maxSec = Number(await this.db.getConfig('idle_max_seconds', 43200));
    const expMult = Number(await this.db.getConfig('exp_rate_multiplier', 1.0));
    const goldMult = Number(await this.db.getConfig('gold_rate_multiplier', 1.0));

    const row = await this.db.queryOne(
      `SELECT pp.last_idle_claim_at, pp.vip_level, m.map_id, m.name_th, m.exp_per_min, m.gold_per_min,
              EXTRACT(EPOCH FROM (NOW() - pp.last_idle_claim_at))::int AS elapsed_seconds
       FROM player_profiles pp JOIN maps m ON m.map_id = pp.current_map_id
       WHERE pp.player_id = $1`,
      [playerId],
    );
    if (!row) throw new NotFoundException('Profile not found');

    const calc = calculateIdleRewards({
      elapsedSeconds: row.elapsed_seconds,
      idleMaxSeconds: maxSec,
      expPerMin: row.exp_per_min,
      goldPerMin: row.gold_per_min,
      expMultiplier: expMult,
      goldMultiplier: goldMult,
      vipLevel: row.vip_level,
    });
    return { ...calc, map_id: row.map_id, map_name_th: row.name_th, idle_max_seconds: maxSec };
  }

  @Post('idle/claim')
  async claimIdle(@Req() req: any) {
    const playerId = req.user.sub;
    const maxSec = Number(await this.db.getConfig('idle_max_seconds', 43200));
    const minSec = Number(await this.db.getConfig('idle_min_claim_seconds', 30));
    const expMult = Number(await this.db.getConfig('exp_rate_multiplier', 1.0));
    const goldMult = Number(await this.db.getConfig('gold_rate_multiplier', 1.0));

    return this.db.transaction(async (client) => {
      const profRes = await client.query(
        `SELECT pp.*, m.exp_per_min, m.gold_per_min,
                EXTRACT(EPOCH FROM (NOW() - pp.last_idle_claim_at))::int AS elapsed_seconds
         FROM player_profiles pp JOIN maps m ON m.map_id = pp.current_map_id
         WHERE pp.player_id = $1 FOR UPDATE OF pp`,
        [playerId],
      );
      const prof = profRes.rows[0];
      if (!prof) throw new NotFoundException('Profile not found');
      if (prof.elapsed_seconds < minSec) {
        throw new BadRequestException(`กรุณารออย่างน้อย ${minSec} วินาทีก่อนรับรางวัล Idle (เหลือ ${minSec - prof.elapsed_seconds} วินาที)`);
      }

      const calc = calculateIdleRewards({
        elapsedSeconds: prof.elapsed_seconds,
        idleMaxSeconds: maxSec,
        expPerMin: prof.exp_per_min,
        goldPerMin: prof.gold_per_min,
        expMultiplier: expMult,
        goldMultiplier: goldMult,
        vipLevel: prof.vip_level,
      });

      const newExp = Number(prof.exp) + calc.expGained;
      const newLevel = Math.max(prof.level, Math.floor(1 + Math.sqrt(newExp / 100)));
      await client.query(
        `UPDATE player_profiles SET exp = $1, level = $2, last_idle_claim_at = NOW(), updated_at = NOW() WHERE player_id = $3`,
        [newExp, newLevel, playerId],
      );
      await client.query(
        `UPDATE player_currency SET gold = gold + $1, updated_at = NOW() WHERE player_id = $2`,
        [calc.goldGained, playerId],
      );
      await client.query(
        `INSERT INTO idle_rewards (player_id, map_id, elapsed_seconds, exp_claimed, gold_claimed)
         VALUES ($1, $2, $3, $4, $5)`,
        [playerId, prof.current_map_id, calc.cappedSeconds, calc.expGained, calc.goldGained],
      );
      await this.advanceQuest(client, playerId, 'CLAIM_IDLE', 1);

      return { ...calc, newLevel, newExp };
    });
  }

  @Post('idle/daily-claim')
  async claimDaily(@Req() req: any) {
    const playerId = req.user.sub;
    const today = new Date().toISOString().slice(0, 10);
    return this.db.transaction(async (client) => {
      try {
        const cntRes = await client.query(`SELECT count(*)::int AS cnt FROM daily_rewards WHERE player_id = $1`, [playerId]);
        const streak = (cntRes.rows[0].cnt % 30) + 1;
        const gems = 50 + streak * 10;
        const gold = 500 * streak;
        await client.query(
          `INSERT INTO daily_rewards (player_id, claim_date, streak_day, rewards_json)
           VALUES ($1, $2, $3, $4::jsonb)`,
          [playerId, today, streak, JSON.stringify({ gems, gold })],
        );
        await client.query(`UPDATE player_currency SET gems = gems + $1, gold = gold + $2 WHERE player_id = $3`, [
          gems,
          gold,
          playerId,
        ]);
        return { streak_day: streak, gems, gold };
      } catch (err: any) {
        if (err?.code === '23505') {
          throw new BadRequestException('รับรางวัลประจำวันของวันนี้ไปแล้ว');
        }
        throw err;
      }
    });
  }

  @Post('battle/stage')
  async battleStage(@Req() req: any, @Body() body: { map_id?: number; battle_type?: string }) {
    const playerId = req.user.sub;
    const combatCfg = await this.db.getConfig<CombatBalanceConfig>('combat_balance', DEFAULT_COMBAT_BALANCE);
    const expMult = Number(await this.db.getConfig('exp_rate_multiplier', 1.0));
    const goldMult = Number(await this.db.getConfig('gold_rate_multiplier', 1.0));

    return this.db.transaction(async (client) => {
      const profRes = await client.query(`SELECT * FROM player_profiles WHERE player_id = $1 FOR UPDATE`, [playerId]);
      const prof = profRes.rows[0];
      const mapId = body?.map_id ?? prof.current_map_id;
      if (mapId > prof.highest_map_id + 1) {
        throw new BadRequestException('ยังไม่ปลดล็อกด่านนี้');
      }

      const teamRows = await client.query(
        `SELECT pf.slot_index, pc.player_character_id, c.name_th, c.element, ce.skill_ids,
                pcs.hp, pcs.atk, pcs.def, pcs.matk, pcs.mdef, pcs.spd, pcs.crit, pcs.hit, pcs.eva
         FROM player_formation pf
         JOIN player_characters pc ON pc.player_character_id = pf.player_character_id
         JOIN characters c ON c.character_id = pc.character_id
         JOIN character_evolutions ce ON ce.character_id = pc.character_id AND ce.evolution_stage = pc.evolution_stage
         JOIN player_character_stats pcs ON pcs.player_character_id = pc.player_character_id
         WHERE pf.player_id = $1 AND pf.preset_index = 1`,
        [playerId],
      );
      if (teamRows.rows.length === 0) throw new BadRequestException('กรุณาจัดทีมขุนพลก่อนเข้าต่อสู้');

      const allSkillIds = Array.from(new Set(teamRows.rows.flatMap((r: any) => r.skill_ids || [])));
      const skillMap = new Map<number, BattleSkill>();
      if (allSkillIds.length > 0) {
        const skRows = await client.query(
          `SELECT s.skill_id, s.name_th, s.element, COALESCE(s.sp_cost, 20) AS sp_cost,
                  se.damage_type, se.power_multiplier, se.target_scope, se.status_effect, se.status_chance, se.status_duration, se.cooldown_turns
           FROM skills s JOIN skill_effects se ON se.skill_id = s.skill_id
           WHERE s.skill_id = ANY($1::int[])`,
          [allSkillIds],
        );
        for (const s of skRows.rows) {
          skillMap.set(s.skill_id, { ...s, power_multiplier: Number(s.power_multiplier), status_chance: Number(s.status_chance) });
        }
      }

      const playerUnits: CombatantInput[] = teamRows.rows.map((r: any) => ({
        uid: r.player_character_id,
        name_th: r.name_th,
        side: 'PLAYER',
        slot_index: r.slot_index,
        element: r.element as ElementType,
        hp: r.hp,
        atk: r.atk,
        def: r.def,
        matk: r.matk,
        mdef: r.mdef,
        spd: r.spd,
        crit: Number(r.crit),
        hit: Number(r.hit),
        eva: Number(r.eva),
        skills: (r.skill_ids || []).map((id: number) => skillMap.get(id)).filter(Boolean) as BattleSkill[],
      }));

      const isWorldBoss = body?.battle_type === 'WORLD_BOSS';
      const monRows = isWorldBoss
        ? await client.query(`SELECT * FROM monsters WHERE boss_tier = 'WORLD_BOSS' LIMIT 1`)
        : await client.query(
            `SELECT m.* FROM map_monsters mm JOIN monsters m ON m.monster_id = mm.monster_id WHERE mm.map_id = $1`,
            [mapId],
          );
      if (monRows.rows.length === 0) throw new NotFoundException('No monsters in this area');

      const enemyUnits: CombatantInput[] = monRows.rows.map((m: any, idx: number) => ({
        uid: `mon_${m.monster_id}_${idx}`,
        name_th: m.name_th,
        side: 'ENEMY',
        slot_index: idx + 1,
        element: m.element as ElementType,
        hp: m.hp,
        atk: m.atk,
        def: m.def,
        matk: m.matk,
        mdef: m.mdef,
        spd: m.spd,
        crit: 5,
        hit: 92,
        eva: 5,
        skills: [],
      }));

      const seed = Date.now() & 0x7fffffff;
      const result = simulateBattle(playerUnits, enemyUnits, seed, combatCfg);

      let expGained = 0;
      let goldGained = 0;
      const droppedItems: Array<{ item_id: number; name_th: string; quantity: number }> = [];

      if (result.winner === 'WIN') {
        expGained = Math.round(monRows.rows.reduce((a: number, m: any) => a + m.exp_reward, 0) * expMult);
        goldGained = Math.round(monRows.rows.reduce((a: number, m: any) => a + m.gold_reward, 0) * goldMult);
        const newExp = Number(prof.exp) + expGained;
        const newLv = Math.max(prof.level, Math.floor(1 + Math.sqrt(newExp / 100)));
        const nextHighest = Math.max(prof.highest_map_id, Math.min(8, mapId + 1));
        await client.query(
          `UPDATE player_profiles SET current_map_id = $1, highest_map_id = $2, exp = $3, level = $4,
           total_battles = total_battles + 1, total_wins = total_wins + 1 WHERE player_id = $5`,
          [mapId, nextHighest, newExp, newLv, playerId],
        );
        await client.query(`UPDATE player_currency SET gold = gold + $1 WHERE player_id = $2`, [goldGained, playerId]);

        // Deterministic/random drop roll
        if (Math.random() < 0.5) {
          await client.query(`INSERT INTO player_inventory (player_id, item_id, quantity) VALUES ($1, 1, 1)`, [playerId]);
          droppedItems.push({ item_id: 1, name_th: 'คัมภีร์ฝึกฝน (เล็ก)', quantity: 1 });
        }
      } else {
        await client.query(`UPDATE player_profiles SET total_battles = total_battles + 1 WHERE player_id = $1`, [playerId]);
      }

      const battleType = isWorldBoss ? 'WORLD_BOSS' : 'STAGE';
      const bRes = await client.query(
        `INSERT INTO battles (player_id, battle_type, map_id, result, total_turns, exp_gained, gold_gained, rewards_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb) RETURNING battle_id`,
        [playerId, battleType, mapId, result.winner, result.total_turns, expGained, goldGained, JSON.stringify(droppedItems)],
      );
      await client.query(`INSERT INTO battle_logs (battle_id, replay_json) VALUES ($1, $2::jsonb)`, [
        bRes.rows[0].battle_id,
        JSON.stringify(result.logs),
      ]);

      return {
        battle_id: bRes.rows[0].battle_id,
        map_id: mapId,
        ...result,
        exp_gained: expGained,
        gold_gained: goldGained,
        drops: droppedItems,
        playerUnits,
        enemyUnits,
      };
    });
  }

  @Post('quests/:questId/claim')
  async claimQuest(@Req() req: any, @Param('questId') questId: string) {
    const playerId = req.user.sub;
    return this.db.transaction(async (client) => {
      const pqRes = await client.query(
        `SELECT * FROM player_quests WHERE player_id = $1 AND quest_id = $2 FOR UPDATE`,
        [playerId, Number(questId)],
      );
      const pq = pqRes.rows[0];
      if (!pq) throw new NotFoundException('Quest not found');
      if (pq.status !== 'COMPLETED') throw new BadRequestException('ภารกิจยังไม่สำเร็จหรือรับรางวัลไปแล้ว');

      await client.query(`UPDATE player_quests SET status = 'CLAIMED', updated_at = NOW() WHERE id = $1`, [pq.id]);
      const rewards = await client.query(`SELECT * FROM quest_rewards WHERE quest_id = $1`, [Number(questId)]);
      for (const r of rewards.rows) {
        if (r.reward_type === 'GOLD') await client.query(`UPDATE player_currency SET gold = gold + $1 WHERE player_id = $2`, [r.amount, playerId]);
        if (r.reward_type === 'GEMS') await client.query(`UPDATE player_currency SET gems = gems + $1 WHERE player_id = $2`, [r.amount, playerId]);
        if (r.reward_type === 'SPIRIT_STONES') await client.query(`UPDATE player_currency SET spirit_stones = spirit_stones + $1 WHERE player_id = $2`, [r.amount, playerId]);
        if (r.reward_type === 'ITEM' && r.item_id) {
          await client.query(`INSERT INTO player_inventory (player_id, item_id, quantity) VALUES ($1, $2, $3)`, [
            playerId,
            r.item_id,
            r.amount,
          ]);
        }
      }
      return { ok: true, rewards: rewards.rows };
    });
  }

  @Post('shop/buy')
  async buyShopItem(@Req() req: any, @Body() body: { item_id: number; quantity?: number }) {
    const playerId = req.user.sub;
    const qty = Math.max(1, Math.min(99, Number(body?.quantity || 1)));
    return this.db.transaction(async (client) => {
      const itemRes = await client.query(`SELECT * FROM items WHERE item_id = $1`, [body.item_id]);
      const item = itemRes.rows[0];
      if (!item) throw new NotFoundException('Item not found');
      const priceGold = Math.max(100, item.sell_price * 4) * qty;

      const curRes = await client.query(`SELECT gold FROM player_currency WHERE player_id = $1 FOR UPDATE`, [playerId]);
      if (Number(curRes.rows[0].gold) < priceGold) throw new BadRequestException(`Gold ไม่เพียงพอ (ต้องการ ${priceGold})`);

      await client.query(`UPDATE player_currency SET gold = gold - $1 WHERE player_id = $2`, [priceGold, playerId]);
      await client.query(`INSERT INTO player_inventory (player_id, item_id, quantity) VALUES ($1, $2, $3)`, [
        playerId,
        item.item_id,
        qty,
      ]);
      return { ok: true, item: item.name_th, quantity: qty, goldSpent: priceGold };
    });
  }
}
