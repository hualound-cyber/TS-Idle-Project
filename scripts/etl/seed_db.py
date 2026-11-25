#!/usr/bin/env python3
"""
Seeds PostgreSQL (ts_legends_pg) with:
  - 149 skills + 149 skill_effects
  - 429 characters + 1,139 character_evolutions
  - 8 world map zones, 16 monsters, 16 items/equipment, monster_drops, 10 quests
  - game_configurations (data-driven formulas & rates)
"""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SEED = ROOT / 'data' / 'seed'


def sql_str(v):
    if v is None:
        return 'NULL'
    return "'" + str(v).replace("'", "''") + "'"


def sql_int_arr(arr):
    if not arr:
        return "'{}'::integer[]"
    return "'{" + ",".join(str(int(x)) for x in arr) + "}'::integer[]"


def main():
    skills = json.loads((SEED / 'skills.json').read_text(encoding='utf-8'))
    chars = json.loads((SEED / 'characters.json').read_text(encoding='utf-8'))

    lines = ["BEGIN;"]

    # 1. Skills & Skill Effects
    for s in skills:
        lines.append(
            f"INSERT INTO skills (skill_id,name_th,name_en,element,category_th,category,sp_cost,target_desc_th,is_combo,is_spirit,description_th,original_icon_ref,asset_key) "
            f"VALUES ({s['skill_id']},{sql_str(s['name_th'])},NULL,{sql_str(s['element'])},{sql_str(s['category_th'])},{sql_str(s['category'])},"
            f"{'NULL' if s['sp_cost'] is None else s['sp_cost']},{sql_str(s['target_desc_th'])},{str(s['is_combo']).upper()},{str(s['is_spirit']).upper()},"
            f"{sql_str(s['description_th'])},{sql_str(s['original_icon_ref'])},{sql_str(s['asset_key'])}) "
            f"ON CONFLICT (skill_id) DO NOTHING;"
        )
        # Deterministic skill_effects baseline
        tg = s['target_desc_th']
        scope = 'SINGLE'
        if 'ทั้งหมด' in tg or 'ทั้งสนาม' in tg:
            scope = 'ALLY_ALL' if s['category'] == 'SUPPORT' else 'ALL_ENEMIES'
        elif 'แถว' in tg or '3' in tg or '4' in tg or '5' in tg:
            scope = 'ROW'
        elif s['category'] == 'SUPPORT':
            scope = 'ALLY_SINGLE'

        dmg_type = 'PHYSICAL'
        mult = 1.25
        status = 'NULL'
        chance = 0.0
        dur = 0
        if s['category'] == 'SUPPORT':
            if 'ฟื้น' in s['description_th'] or 'HP' in s['description_th'] or 'รักษา' in s['description_th']:
                dmg_type = 'HEAL'
                mult = 1.35
            else:
                dmg_type = 'BUFF'
                mult = 0.25
                status = "'ATK_UP'"
                chance = 1.0
                dur = 2
        elif s['category'] == 'DISRUPT':
            dmg_type = 'DEBUFF'
            mult = 0.85
            status = "'STUN'" if 'มึน' in s['description_th'] or 'สลบ' in s['description_th'] else "'DEF_DOWN'"
            chance = 0.55
            dur = 2
        else:
            if s['element'] in ('fire', 'water', 'wind', 'earth', 'psy'):
                dmg_type = 'MAGICAL' if (s['sp_cost'] or 0) >= 25 else 'PHYSICAL'
            mult = 1.65 if s['is_spirit'] else (1.40 if scope == 'SINGLE' else 1.15)

        lines.append(
            f"INSERT INTO skill_effects (skill_id,damage_type,power_multiplier,target_scope,hit_count,status_effect,status_chance,status_duration,cooldown_turns) "
            f"VALUES ({s['skill_id']},{sql_str(dmg_type)},{mult},{sql_str(scope)},1,{status},{chance},{dur},{2 if s['is_spirit'] else 1}) "
            f"ON CONFLICT (skill_id) DO NOTHING;"
        )

    # 2. Characters & Evolutions
    for c in chars:
        lines.append(
            f"INSERT INTO characters (character_id,name_th,alt_name_th,name_en,element,gender,gender_estimated,capture_level,max_evolution_stage,rarity,in_official_web,original_nameplate_ref) "
            f"VALUES ({c['character_id']},{sql_str(c['name_th'])},{sql_str(c['alt_name_th'])},NULL,{sql_str(c['element'])},{sql_str(c['gender'])},"
            f"{str(c['gender_estimated']).upper()},{'NULL' if c['capture_level'] is None else c['capture_level']},{c['max_evolution_stage']},"
            f"{sql_str(c['rarity'])},{str(c['in_official_web']).upper()},{sql_str(c['original_nameplate_ref'])}) "
            f"ON CONFLICT (character_id) DO NOTHING;"
        )
        for ev in c['evolutions']:
            lines.append(
                f"INSERT INTO character_evolutions (character_id,evolution_stage,form_name_th,base_hp,base_sp,base_int,base_atk,base_def,base_agi,total_power,skill_ids,web_skill_ids,original_sprite_ref,asset_key) "
                f"VALUES ({c['character_id']},{ev['evolution_stage']},{sql_str(ev['form_name_th'])},{ev['base_hp']},{ev['base_sp']},{ev['base_int']},"
                f"{ev['base_atk']},{ev['base_def']},{ev['base_agi']},{ev['total_power']},{sql_int_arr(ev['skill_ids'])},"
                f"{'NULL' if ev['web_skill_ids'] is None else sql_int_arr(ev['web_skill_ids'])},{sql_str(ev['original_sprite_ref'])},{sql_str(ev['asset_key'])}) "
                f"ON CONFLICT (character_id, evolution_stage) DO NOTHING;"
            )

    # 3. Maps (8 Zones)
    maps_data = [
        (1, 'zhuo_town', 'เมืองจัวจวิ้น (เมืองเริ่มต้น)', 'Zhuo County (Starter Town)', 'STARTER_TOWN', 1, 1, 30, 50, 120),
        (2, 'beihai_village', 'หมู่บ้านเป่ยไห่', 'Beihai Village', 'VILLAGE', 2, 5, 65, 110, 260),
        (3, 'zhuzhong_forest', 'ป่าจูจง', 'Zhuzhong Forest', 'FOREST', 3, 12, 120, 200, 480),
        (4, 'taishan_cave', 'ถ้ำไท่ซาน', 'Taishan Cave', 'CAVE', 4, 20, 210, 340, 820),
        (5, 'war_tower_dungeon', 'ดันเจี้ยนหอคอยศึก', 'War Tower Dungeon', 'DUNGEON', 5, 30, 350, 550, 1350),
        (6, 'luoyang_capital', 'เมืองหลวงลั่วหยาง', 'Luoyang Capital', 'CAPITAL', 6, 42, 520, 820, 2100),
        (7, 'demon_hunting_ground', 'แดนล่าอสูรจงหยวน', 'Central Plains Hunting Ground', 'HUNTING_GROUND', 7, 55, 800, 1250, 3200),
        (8, 'chibi_boss_arena', 'สมรภูมิผาแดง (Boss Area)', 'Red Cliffs Boss Arena', 'BOSS_AREA', 8, 70, 1250, 2000, 5000),
    ]
    for m in maps_data:
        lines.append(
            f"INSERT INTO maps (map_id,code,name_th,name_en,zone_type,order_index,min_level,exp_per_min,gold_per_min,recommended_power) "
            f"VALUES ({m[0]},{sql_str(m[1])},{sql_str(m[2])},{sql_str(m[3])},{sql_str(m[4])},{m[5]},{m[6]},{m[7]},{m[8]},{m[9]}) ON CONFLICT (code) DO NOTHING;"
        )
    lines.append("SELECT setval('maps_map_id_seq', (SELECT MAX(map_id) FROM maps));")

    # 4. Monsters (16 monsters across 8 zones)
    monsters_data = [
        (1, 'yellow_turban_scout', 'พลลาดตระเวนโพกผ้าเหลือง', 'Yellow Turban Scout', 'earth', 2, False, None, 120, 18, 12, 8, 8, 12, [1, 10], 25, 40),
        (2, 'wild_boar', 'หมูป่าคลั่ง', 'Wild Boar', 'fire', 4, False, None, 180, 24, 15, 6, 10, 14, [1], 35, 55),
        (3, 'beihai_pirate', 'โจรสลัดเป่ยไห่', 'Beihai Pirate', 'water', 7, False, None, 260, 34, 22, 18, 16, 18, [5, 12], 55, 85),
        (4, 'zhuzhong_bandit', 'โจรป่าจูจง', 'Zhuzhong Bandit', 'earth', 12, False, None, 420, 48, 32, 16, 22, 24, [1, 15], 95, 140),
        (5, 'forest_wolf_king', 'ราชาหมาป่าจูจง', 'Forest Wolf King', 'wind', 15, True, 'STAGE_BOSS', 850, 72, 42, 25, 30, 38, [20, 25], 240, 380),
        (6, 'taishan_golem', 'โกเลมศิลาไท่ซาน', 'Taishan Stone Golem', 'earth', 22, False, None, 780, 68, 64, 20, 40, 18, [10, 30], 170, 250),
        (7, 'crimson_bat', 'ค้างคาวโลหิต', 'Crimson Cave Bat', 'fire', 25, False, None, 650, 80, 40, 55, 35, 48, [12, 35], 195, 290),
        (8, 'tower_sentinel', 'องครักษ์หอคอยศึก', 'War Tower Sentinel', 'wind', 32, False, None, 1100, 105, 72, 60, 55, 52, [20, 40], 310, 460),
        (9, 'dong_zhuo_guard', 'ทหารองครักษ์ตั๋งโต๊ะ', 'Dong Zhuo Guard', 'fire', 44, False, None, 1650, 145, 95, 75, 70, 62, [15, 45], 480, 720),
        (10, 'imperial_mage', 'นักพรตหลวงลั่วหยาง', 'Imperial Mystic', 'psy', 48, False, None, 1480, 80, 78, 175, 110, 70, [50, 55], 540, 810),
        (11, 'chaos_tiger', 'พยัคฆ์อสูรจงหยวน', 'Chaos Tiger', 'wind', 58, False, None, 2400, 210, 125, 90, 95, 95, [60, 65], 820, 1200),
        (12, 'chibi_navy_captain', 'แม่ทัพเรือผาแดง', 'Red Cliffs Admiral', 'water', 72, True, 'STAGE_BOSS', 5200, 290, 195, 220, 165, 105, [70, 75], 1800, 2600),
        (13, 'world_boss_lu_bu', 'เทพสงคราม ลิโป้ (World Boss)', 'War God Lu Bu (World Boss)', 'fire', 99, True, 'WORLD_BOSS', 50000, 520, 320, 280, 260, 160, [80, 85, 90], 5000, 10000),
    ]
    for m in monsters_data:
        lines.append(
            f"INSERT INTO monsters (monster_id,code,name_th,name_en,element,level,is_boss,boss_tier,hp,atk,def,matk,mdef,spd,skill_ids,exp_reward,gold_reward) "
            f"VALUES ({m[0]},{sql_str(m[1])},{sql_str(m[2])},{sql_str(m[3])},{sql_str(m[4])},{m[5]},{str(m[6]).upper()},{sql_str(m[7])},"
            f"{m[8]},{m[9]},{m[10]},{m[11]},{m[12]},{m[13]},{sql_int_arr(m[14])},{m[15]},{m[16]}) ON CONFLICT (code) DO NOTHING;"
        )
    lines.append("SELECT setval('monsters_monster_id_seq', (SELECT MAX(monster_id) FROM monsters));")

    map_mon = [
        (1, 1, 100, False), (1, 2, 60, False),
        (2, 2, 80, False), (2, 3, 100, False),
        (3, 4, 100, False), (3, 5, 20, True),
        (4, 6, 100, False), (4, 7, 100, False),
        (5, 8, 100, False),
        (6, 9, 100, False), (6, 10, 80, False),
        (7, 11, 100, False),
        (8, 12, 100, True),
    ]
    for mm in map_mon:
        lines.append(f"INSERT INTO map_monsters (map_id,monster_id,spawn_weight,is_stage_boss) VALUES ({mm[0]},{mm[1]},{mm[2]},{str(mm[3]).upper()}) ON CONFLICT DO NOTHING;")

    # 5. Items & Equipment
    items_data = [
        (1, 'exp_scroll_s', 'คัมภีร์ฝึกฝน (เล็ก)', 'Minor EXP Scroll', 'EXP_BOOK', 'N', 'เพิ่มค่าประสบการณ์ขุนพล +500', 20, True),
        (2, 'exp_scroll_l', 'คัมภีร์ฝึกฝน (ใหญ่)', 'Grand EXP Scroll', 'EXP_BOOK', 'SR', 'เพิ่มค่าประสบการณ์ขุนพล +5,000', 150, True),
        (3, 'rebirth_stone', 'หินจุติฟ้าดิน', 'Heaven-Earth Rebirth Stone', 'REBIRTH_STONE', 'SSR', 'ใช้สำหรับจุติขุนพลขั้น 1 และ 2', 500, True),
        (4, 'enhance_stone', 'ศิลาตีบวก', 'Enhancement Stone', 'ENHANCE_STONE', 'R', 'ใช้ตีบวกอุปกรณ์ (+1 ถึง +15)', 80, True),
        (5, 'summon_ticket', 'ป้ายอัญเชิญขุนพล', 'Warlord Summon Ticket', 'SUMMON_TICKET', 'SR', 'ใช้อัญเชิญขุนพล 1 ครั้ง', 200, True),
        (6, 'iron_blade', 'ดาบเหล็กกล้า', 'Steel Blade', 'EQUIPMENT', 'N', 'อาวุธพื้นฐานสำหรับแม่ทัพ', 100, False),
        (7, 'dragon_halberd', 'ง้าวมังกรเขียว', 'Green Dragon Crescent Blade', 'EQUIPMENT', 'SSR', 'อาวุธระดับตำนาน เพิ่ม ATK และ CRIT สูง', 2500, False),
        (8, 'leather_armor', 'เกราะหนังจงหยวน', 'Central Plains Leather Armor', 'EQUIPMENT', 'N', 'เกราะป้องกันพื้นฐาน', 100, False),
        (9, 'tiger_plate', 'เกราะพยัคฆ์คำราม', 'Roaring Tiger Plate', 'EQUIPMENT', 'SR', 'เกราะหนักเพิ่ม HP และ DEF', 1200, False),
        (10, 'iron_helm', 'หมวกเหล็กทหาร', 'Soldier Iron Helm', 'EQUIPMENT', 'N', 'หมวกป้องกันพื้นฐาน', 80, False),
        (11, 'phoenix_crown', 'ศิราภรณ์หงส์เพลิง', 'Phoenix Crown', 'EQUIPMENT', 'SSR', 'หมวกเพิ่ม MATK และ SPD', 2200, False),
        (12, 'jade_pendant', 'หยกพกปราบมาร', 'Demon-Warding Jade', 'EQUIPMENT', 'R', 'เครื่องรางเพิ่ม HP และ EVA', 450, False),
    ]
    for it in items_data:
        lines.append(
            f"INSERT INTO items (item_id,code,name_th,name_en,item_type,rarity,description_th,sell_price,stackable) "
            f"VALUES ({it[0]},{sql_str(it[1])},{sql_str(it[2])},{sql_str(it[3])},{sql_str(it[4])},{sql_str(it[5])},{sql_str(it[6])},{it[7]},{str(it[8]).upper()}) "
            f"ON CONFLICT (code) DO NOTHING;"
        )
    lines.append("SELECT setval('items_item_id_seq', (SELECT MAX(item_id) FROM items));")

    equip_data = [
        (6, 'WEAPON', 'STARTER_SET', 1, 0, 25, 0, 10, 0, 2, 1.5, 1.0, 0),
        (7, 'WEAPON', 'DRAGON_SET', 20, 120, 145, 15, 60, 10, 12, 8.5, 5.0, 0),
        (8, 'ARMOR', 'STARTER_SET', 1, 80, 0, 18, 0, 12, 0, 0, 0, 1.0),
        (9, 'ARMOR', 'TIGER_SET', 15, 320, 20, 75, 0, 45, 5, 0, 0, 3.5),
        (10, 'HELMET', 'STARTER_SET', 1, 45, 0, 10, 5, 10, 2, 0, 1.0, 0),
        (11, 'HELMET', 'PHOENIX_SET', 20, 180, 25, 35, 130, 55, 18, 4.0, 3.0, 2.5),
        (12, 'ACCESSORY', 'JADE_SET', 10, 150, 15, 15, 15, 15, 10, 2.5, 2.0, 4.0),
    ]
    for eq in equip_data:
        lines.append(
            f"INSERT INTO equipment (item_id,slot,set_code,req_level,hp_bonus,atk_bonus,def_bonus,matk_bonus,mdef_bonus,spd_bonus,crit_bonus,hit_bonus,eva_bonus) "
            f"VALUES ({eq[0]},{sql_str(eq[1])},{sql_str(eq[2])},{eq[3]},{eq[4]},{eq[5]},{eq[6]},{eq[7]},{eq[8]},{eq[9]},{eq[10]},{eq[11]},{eq[12]}) "
            f"ON CONFLICT (item_id) DO NOTHING;"
        )

    # Drops
    for mid in range(1, 13):
        lines.append(f"INSERT INTO monster_drops (monster_id,item_id,drop_rate,min_qty,max_qty) VALUES ({mid},1,0.35,1,2) ON CONFLICT DO NOTHING;")
        lines.append(f"INSERT INTO monster_drops (monster_id,item_id,drop_rate,min_qty,max_qty) VALUES ({mid},4,0.20,1,1) ON CONFLICT DO NOTHING;")

    # 6. Quests
    quests_data = [
        (1, 'main_first_steps', 'ก้าวแรกสู่ยุทธภพ', 'First Steps in the Realm', 'MAIN', None, 1, 'CLAIM_IDLE', None, 1, 'รับรางวัล Idle ครั้งแรกเพื่อเริ่มต้นการเดินทาง'),
        (2, 'main_summon_warlord', 'อัญเชิญขุนพลคู่ใจ', 'Summon a Warlord', 'MAIN', 1, 1, 'SUMMON_COUNT', None, 1, 'อัญเชิญขุนพลเข้าสู่ทีม 1 ครั้ง'),
        (3, 'main_level_up', 'ฝึกฝนยอดขุนพล', 'Train Your Warlord', 'MAIN', 2, 1, 'LEVEL_UP_CHAR', None, 3, 'อัปเลเวลขุนพล 3 ครั้ง'),
        (4, 'daily_idle_claim', 'ภารกิจประจำวัน: เก็บเกี่ยวผลผลิต', 'Daily: Claim Idle Rewards', 'DAILY', None, 1, 'CLAIM_IDLE', None, 1, 'รับรางวัล Idle ประจำวัน'),
        (5, 'daily_summon', 'ภารกิจประจำวัน: อัญเชิญขุนพล', 'Daily: Summon Warlord', 'DAILY', None, 1, 'SUMMON_COUNT', None, 1, 'อัญเชิญขุนพล 1 ครั้ง'),
        (6, 'collection_10', 'นักสะสมขุนพล (10 ตัว)', 'Collector: 10 Warlords', 'COLLECTION', None, 1, 'COLLECT_CHARS', None, 10, 'สะสมขุนพลให้ครบ 10 ตัว'),
    ]
    for q in quests_data:
        lines.append(
            f"INSERT INTO quests (quest_id,code,title_th,title_en,quest_type,prerequisite_quest_id,req_level,target_type,target_ref_id,target_count,description_th) "
            f"VALUES ({q[0]},{sql_str(q[1])},{sql_str(q[2])},{sql_str(q[3])},{sql_str(q[4])},{'NULL' if q[5] is None else q[5]},{q[6]},{sql_str(q[7])},NULL,{q[9]},{sql_str(q[10])}) "
            f"ON CONFLICT (code) DO NOTHING;"
        )
    lines.append("SELECT setval('quests_quest_id_seq', (SELECT MAX(quest_id) FROM quests));")

    q_rewards = [
        (1, 'GOLD', None, 500), (1, 'GEMS', None, 100),
        (2, 'GOLD', None, 800), (2, 'ITEM', 1, 3),
        (3, 'GEMS', None, 150), (3, 'ITEM', 4, 3),
        (4, 'GOLD', None, 300), (4, 'GEMS', None, 50),
        (5, 'SPIRIT_STONES', None, 30),
        (6, 'GEMS', None, 300), (6, 'ITEM', 5, 2),
    ]
    for qr in q_rewards:
        lines.append(f"INSERT INTO quest_rewards (quest_id,reward_type,item_id,amount) VALUES ({qr[0]},{sql_str(qr[1])},{'NULL' if qr[2] is None else qr[2]},{qr[3]});")

    # 7. Game Configurations (Server-side tunable balance)
    configs = [
        ('exp_rate_multiplier', '1.0', 'Global EXP multiplier'),
        ('drop_rate_multiplier', '1.0', 'Global Drop multiplier'),
        ('gold_rate_multiplier', '1.0', 'Global Gold multiplier'),
        ('idle_max_seconds', '43200', 'Maximum offline idle progression cap (12 hours)'),
        ('idle_min_claim_seconds', '30', 'Minimum seconds between idle claims'),
        ('stat_growth', '{"hp_growth":0.12,"atk_growth":0.10,"def_growth":0.10,"int_growth":0.10,"mdef_growth":0.09,"agi_growth":0.08,"evo_mult":[1.0,1.35,1.75],"star_mult_per_star":0.08,"base_crit":5.0,"base_hit":95.0,"base_eva":5.0}', 'Data-driven character stat scaling formulas'),
        ('combat_balance', '{"element_advantage":1.25,"element_disadvantage":0.80,"crit_multiplier":1.50,"max_turns":20,"front_row_def_bonus":0.10,"back_row_atk_bonus":0.10}', 'Turn-based combat multipliers'),
        ('summon_rates', '{"cost_gems":150,"cost_gems_10":1350,"weights":{"SSR":0.05,"SR":0.15,"R":0.35,"N":0.45}}', 'Gacha summon probabilities and costs'),
    ]
    for ck, cv, desc in configs:
        lines.append(
            f"INSERT INTO game_configurations (config_key,config_value,description) "
            f"VALUES ({sql_str(ck)},{sql_str(cv)}::jsonb,{sql_str(desc)}) ON CONFLICT (config_key) DO NOTHING;"
        )

    lines.append("COMMIT;")
    sql_path = ROOT / 'data' / 'seed' / 'seed_all.sql'
    sql_path.write_text("\n".join(lines), encoding='utf-8')
    print(f"Generated {sql_path} ({len(lines)} SQL statements)")

    # Execute inside PostgreSQL container
    proc = subprocess.run(
        ['docker', 'exec', '-i', 'ts_legends_pg', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'tslegends', '-d', 'tslegends'],
        input=sql_path.read_text(encoding='utf-8'),
        text=True,
        capture_output=True,
    )
    if proc.returncode != 0:
        print("SEED ERROR:", proc.stderr)
        raise SystemExit(1)
    print("PostgreSQL Seeding COMMITTED successfully!")


if __name__ == '__main__':
    main()
