# GAME DESIGN DOCUMENT (GDD) — TS LEGENDS: IDLE RPG

**Version:** 1.0  
**Genre:** Idle Turn-Based Collection RPG (Chinese Fantasy / TS Online Inspired)  
**Architecture:** Server-Authoritative, Data-Driven (`game_configurations`)

---

## 1. Core Gameplay Loop

1. **Idle & Auto-Farming:** ผู้เล่นเลือกพื้นที่บน World Map (8 โซน) ทีมขุนพลจะต่อสู้อัตโนมัติ (Online/Offline) เพื่อสะสม EXP, Gold (ตำลึง), Spirit Stones (หินจิต), และ Equipment Drops
2. **Collect & Summon:** เปิดหีบ/อัญเชิญขุนพลจากฐานข้อมูลจริง **429 ตัว** (แบ่งระดับ `N`, `R`, `SR`, `SSR`)
3. **Progression & Rebirth:** อัปเลเวลขุนพล -> ปลดล็อก **จุติ 1 (Rebirth 1)** และ **จุติ 2 (Rebirth 2)** ตามข้อมูลร่างจริง (1,139 ร่าง) -> อัปเกรดสกิล (149 สกิล) -> สวมใส่และตีบวกอุปกรณ์ -> จัดทัพ (Formation)
4. **Challenge & Multiplayer:** ลุย Dungeon, World Boss / Boss Raid, Guild, Friends, PvE Leaderboard

---

## 2. Character Stats & Server-Configurable Formulas

### 2.1 Base Stats -> Combat Stats Mapping
ฐานข้อมูลต้นทางมี 6 ค่าหลัก: `HP`, `SP`, `INT`, `ATK`, `DEF`, `AGI`  
ระบบ TS Legends ขยายเป็น **9 Combat Stats** โดยคำนวณจาก `game_configurations`:

- `HP` = `base_hp * evo_mult * (1 + (lv - 1) * hp_growth) + equip_hp + bond_hp + formation_hp`
- `ATK` = `base_atk * evo_mult * (1 + (lv - 1) * atk_growth) + equip_atk + bond_atk`
- `DEF` = `base_def * evo_mult * (1 + (lv - 1) * def_growth) + equip_def`
- `MATK` = `base_int * evo_mult * (1 + (lv - 1) * int_growth) + equip_matk`
- `MDEF` = `(base_int * 0.6 + base_def * 0.4) * evo_mult * (1 + (lv - 1) * mdef_growth) + equip_mdef`
- `SPD` = `base_agi * evo_mult * (1 + (lv - 1) * agi_growth) + equip_spd`
- `CRIT` = `base_crit (5%) + min(35%, base_agi * 0.05%) + equip_crit`
- `HIT` = `base_hit (95%) + equip_hit`
- `EVA` = `base_eva (5%) + min(30%, base_agi * 0.04%) + equip_eva`

*(ทุกสัมประสิทธิ์ `hp_growth`, `evo_mult`, `base_crit` ฯลฯ อยู่ในตาราง `game_configurations` ปรับสมดุลได้โดยไม่ต้อง Rebuild Client)*

---

## 3. Element & Combat System

### 3.1 Element Matrix
- **Earth (`earth`)** > **Water (`water`)** > **Fire (`fire`)** > **Wind (`wind`)** > **Earth (`earth`)**
- ชนะธาตุ: **+25% Damage** (`element_advantage_mult: 1.25`)
- แพ้ธาตุ: **-20% Damage** (`element_disadvantage_mult: 0.80`)
- ธาตุจิต (`psy`) / ไร้ธาตุ (`none`): **1.00×** กับทุกธาตุ (เป็นกลาง)

### 3.2 Turn-Based Auto Battle & Formation (2×3 Grid)
- **Grid:** 6 ช่อง แบ่งเป็น **Front Row (แถวหน้า: ช่อง 1–3)** และ **Back Row (แถวหลัง: ช่อง 4–6)** (สูงสุด 5 ขุนพลในทีมตามมาตรฐาน TS)
- **Roles & Formation Bonus:**
  - แถวหน้า (`TANK` / `WARRIOR`): ได้รับโบนัส `DEF +10%, HP +5%` และรับการโจมตีแบบเดี่ยวก่อน
  - แถวหลัง (`DAMAGE` / `SUPPORT` / `HEALER`): ได้รับโบนัส `ATK +10%, MATK +10%`
  - **Element Synergy:** มีขุนพลธาตุเดียวกัน 3+ ตัว ได้รับโบนัสธาตุ (`ATK/MATK +8%`, `HP +8%`)
- **Turn Order:** เรียงตาม `SPD` สูง -> ต่ำ, รองรับ Auto Attack, Active Skill (ใช้ SP), Spirit Skill (`is_spirit`), Combo (`is_combo`), Buff/Debuff (ATK Up, DEF Down, Stun, Burn, Heal over Time), และ Battle Replay Log

---

## 4. Idle & Offline Progression System

- **Idle Cap:** สูงสุด **12 ชั่วโมง** (`idle_max_seconds: 43200`) ปรับได้ผ่าน `game_configurations`
- **Minimum Claim Interval:** 60 วินาที (ป้องกัน Spam Claim)
- **Server Calculation:** `elapsed = min(now - last_idle_claim_at, idle_max_seconds)`
  - `exp = floor(elapsed / 60 * map.exp_per_min * vip_or_event_mult)`
  - `gold = floor(elapsed / 60 * map.gold_per_min * event_mult)`
  - `drops = deterministic_or_seeded_loot_rolls(elapsed, map_drops)`

---

## 5. World Map (8 Zones), Monsters, Quests & Equipment

- **8 Zones:** 1. เมืองเริ่มต้น (Zhuo County) -> 2. หมู่บ้านเป่ยไห่ -> 3. ป่าจูจง -> 4. ถ้ำไท่ซาน -> 5. ดันเจี้ยนหอรบ -> 6. เมืองหลักลั่วหยาง -> 7. แดนล่าอสูร -> 8. ลานประลองบอส (Boss Area)
- **Equipment Slots:** `WEAPON`, `ARMOR`, `HELMET`, `ACCESSORY` รองรับ Upgrade/Enhancement (+1 ถึง +15) และ Set Bonus
- **Quests:** `MAIN`, `SIDE`, `DAILY`, `WEEKLY`, `CHARACTER`, `COLLECTION`, `ACHIEVEMENT`, `EVENT`
