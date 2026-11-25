import { Controller, Get, Query } from '@nestjs/common';
import { DbService } from './db.service.js';

@Controller('api/catalog')
export class CatalogController {
  constructor(private readonly db: DbService) {}

  @Get('characters')
  async getCharacters(
    @Query('element') element?: string,
    @Query('rarity') rarity?: string,
    @Query('q') q?: string,
  ) {
    const conditions: string[] = [];
    const params: any[] = [];
    if (element && element !== 'all') {
      params.push(element);
      conditions.push(`c.element = $${params.length}`);
    }
    if (rarity && rarity !== 'all') {
      params.push(rarity);
      conditions.push(`c.rarity = $${params.length}`);
    }
    if (q && q.trim()) {
      params.push(`%${q.trim()}%`);
      conditions.push(`(c.name_th ILIKE $${params.length} OR c.alt_name_th ILIKE $${params.length})`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await this.db.query(
      `SELECT c.*,
        COALESCE(
          (SELECT json_agg(e ORDER BY e.evolution_stage)
           FROM character_evolutions e WHERE e.character_id = c.character_id),
          '[]'::json
        ) AS evolutions
       FROM characters c
       ${where}
       ORDER BY c.character_id ASC`,
      params,
    );
    return { total: rows.length, items: rows };
  }

  @Get('skills')
  async getSkills() {
    const rows = await this.db.query(
      `SELECT s.*, se.damage_type, se.power_multiplier, se.target_scope, se.status_effect, se.cooldown_turns
       FROM skills s
       LEFT JOIN skill_effects se ON se.skill_id = s.skill_id
       ORDER BY s.skill_id ASC`,
    );
    return { total: rows.length, items: rows };
  }

  @Get('maps')
  async getMaps() {
    const maps = await this.db.query(
      `SELECT m.*,
        COALESCE(
          (SELECT json_agg(json_build_object(
            'monster_id', mo.monster_id, 'name_th', mo.name_th, 'name_en', mo.name_en,
            'element', mo.element, 'level', mo.level, 'is_boss', mo.is_boss, 'boss_tier', mo.boss_tier,
            'hp', mo.hp, 'atk', mo.atk, 'def', mo.def, 'spd', mo.spd
          ) ORDER BY mo.level)
          FROM map_monsters mm JOIN monsters mo ON mo.monster_id = mm.monster_id
          WHERE mm.map_id = m.map_id),
          '[]'::json
        ) AS monsters
       FROM maps m
       ORDER BY m.order_index ASC`,
    );
    const worldBoss = await this.db.queryOne(
      `SELECT * FROM monsters WHERE boss_tier = 'WORLD_BOSS' LIMIT 1`,
    );
    return { maps, worldBoss };
  }

  @Get('items')
  async getItems() {
    const items = await this.db.query(
      `SELECT i.*, e.slot, e.set_code, e.req_level, e.hp_bonus, e.atk_bonus, e.def_bonus, e.matk_bonus, e.mdef_bonus, e.spd_bonus, e.crit_bonus
       FROM items i
       LEFT JOIN equipment e ON e.item_id = i.item_id
       ORDER BY i.item_id ASC`,
    );
    return { total: items.length, items };
  }
}
