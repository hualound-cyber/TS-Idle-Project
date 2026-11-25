-- ============================================================================
-- TS Legends: Idle RPG — Master Database Schema (PostgreSQL 16)
-- Phase 5: Complete 33-Table Schema with PK, FK, Constraints, and Indexes
-- ============================================================================

BEGIN;

-- 1. MASTER REFERENCE DATA (Characters, Evolutions, Skills, Skill Effects)
CREATE TABLE characters (
  character_id        INTEGER PRIMARY KEY,
  name_th             VARCHAR(120) NOT NULL,
  alt_name_th         VARCHAR(120),
  name_en             VARCHAR(120),
  element             VARCHAR(16) NOT NULL CHECK (element IN ('fire','wind','water','earth','psy','none')),
  gender              VARCHAR(8) NOT NULL DEFAULT 'o' CHECK (gender IN ('m','f','o')),
  gender_estimated    BOOLEAN NOT NULL DEFAULT FALSE,
  capture_level       INTEGER CHECK (capture_level IS NULL OR capture_level >= 1),
  max_evolution_stage SMALLINT NOT NULL DEFAULT 0 CHECK (max_evolution_stage BETWEEN 0 AND 2),
  rarity              VARCHAR(8) NOT NULL DEFAULT 'N' CHECK (rarity IN ('N','R','SR','SSR')),
  in_official_web     BOOLEAN NOT NULL DEFAULT FALSE,
  original_nameplate_ref VARCHAR(255),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_characters_element ON characters(element);
CREATE INDEX idx_characters_rarity ON characters(rarity);

CREATE TABLE character_evolutions (
  evolution_id        SERIAL PRIMARY KEY,
  character_id        INTEGER NOT NULL REFERENCES characters(character_id) ON DELETE CASCADE,
  evolution_stage     SMALLINT NOT NULL CHECK (evolution_stage BETWEEN 0 AND 2),
  form_name_th        VARCHAR(60) NOT NULL,
  base_hp             INTEGER NOT NULL CHECK (base_hp > 0),
  base_sp             INTEGER NOT NULL CHECK (base_sp >= 0),
  base_int            INTEGER NOT NULL CHECK (base_int >= 0),
  base_atk            INTEGER NOT NULL CHECK (base_atk >= 0),
  base_def            INTEGER NOT NULL CHECK (base_def >= 0),
  base_agi            INTEGER NOT NULL CHECK (base_agi >= 0),
  total_power         INTEGER NOT NULL CHECK (total_power > 0),
  skill_ids           INTEGER[] NOT NULL DEFAULT '{}',
  web_skill_ids       INTEGER[],
  original_sprite_ref VARCHAR(255),
  asset_key           VARCHAR(64) NOT NULL,
  UNIQUE (character_id, evolution_stage)
);
CREATE INDEX idx_char_evo_char ON character_evolutions(character_id);

CREATE TABLE skills (
  skill_id            INTEGER PRIMARY KEY,
  name_th             VARCHAR(120) NOT NULL UNIQUE,
  name_en             VARCHAR(120),
  element             VARCHAR(16) NOT NULL CHECK (element IN ('fire','wind','water','earth','psy','none')),
  category_th         VARCHAR(32) NOT NULL,
  category            VARCHAR(16) NOT NULL CHECK (category IN ('ATTACK','SUPPORT','DISRUPT','UNKNOWN')),
  sp_cost             INTEGER CHECK (sp_cost IS NULL OR sp_cost >= 0),
  target_desc_th      TEXT NOT NULL,
  is_combo            BOOLEAN NOT NULL DEFAULT FALSE,
  is_spirit           BOOLEAN NOT NULL DEFAULT FALSE,
  description_th      TEXT NOT NULL,
  original_icon_ref   TEXT,
  asset_key           VARCHAR(64) NOT NULL
);

CREATE TABLE skill_effects (
  effect_id           SERIAL PRIMARY KEY,
  skill_id            INTEGER NOT NULL REFERENCES skills(skill_id) ON DELETE CASCADE,
  damage_type         VARCHAR(16) NOT NULL DEFAULT 'PHYSICAL' CHECK (damage_type IN ('PHYSICAL','MAGICAL','HEAL','BUFF','DEBUFF')),
  power_multiplier    NUMERIC(6,3) NOT NULL DEFAULT 1.200 CHECK (power_multiplier >= 0),
  target_scope        VARCHAR(16) NOT NULL DEFAULT 'SINGLE' CHECK (target_scope IN ('SINGLE','ROW','ALL_ENEMIES','ALLY_SINGLE','ALLY_ALL','SELF')),
  hit_count           SMALLINT NOT NULL DEFAULT 1 CHECK (hit_count >= 1),
  status_effect       VARCHAR(32),
  status_chance       NUMERIC(5,4) NOT NULL DEFAULT 0 CHECK (status_chance BETWEEN 0 AND 1),
  status_duration     SMALLINT NOT NULL DEFAULT 0 CHECK (status_duration >= 0),
  cooldown_turns      SMALLINT NOT NULL DEFAULT 0 CHECK (cooldown_turns >= 0),
  UNIQUE (skill_id)
);

-- 2. WORLD, MAPS, MONSTERS, ITEMS, EQUIPMENT, QUESTS
CREATE TABLE maps (
  map_id              SERIAL PRIMARY KEY,
  code                VARCHAR(64) NOT NULL UNIQUE,
  name_th             VARCHAR(120) NOT NULL,
  name_en             VARCHAR(120) NOT NULL,
  zone_type           VARCHAR(32) NOT NULL CHECK (zone_type IN ('STARTER_TOWN','VILLAGE','FOREST','CAVE','DUNGEON','CAPITAL','HUNTING_GROUND','BOSS_AREA')),
  order_index         INTEGER NOT NULL,
  min_level           INTEGER NOT NULL DEFAULT 1 CHECK (min_level >= 1),
  exp_per_min         INTEGER NOT NULL DEFAULT 10 CHECK (exp_per_min >= 0),
  gold_per_min        INTEGER NOT NULL DEFAULT 10 CHECK (gold_per_min >= 0),
  recommended_power   INTEGER NOT NULL DEFAULT 100,
  description_th      TEXT
);

CREATE TABLE monsters (
  monster_id          SERIAL PRIMARY KEY,
  code                VARCHAR(64) NOT NULL UNIQUE,
  name_th             VARCHAR(120) NOT NULL,
  name_en             VARCHAR(120) NOT NULL,
  element             VARCHAR(16) NOT NULL CHECK (element IN ('fire','wind','water','earth','psy','none')),
  level               INTEGER NOT NULL CHECK (level >= 1),
  is_boss             BOOLEAN NOT NULL DEFAULT FALSE,
  boss_tier           VARCHAR(16) CHECK (boss_tier IS NULL OR boss_tier IN ('MINI_BOSS','STAGE_BOSS','DUNGEON_BOSS','WORLD_BOSS')),
  hp                  INTEGER NOT NULL CHECK (hp > 0),
  atk                 INTEGER NOT NULL CHECK (atk >= 0),
  def                 INTEGER NOT NULL CHECK (def >= 0),
  matk                INTEGER NOT NULL DEFAULT 0,
  mdef                INTEGER NOT NULL DEFAULT 0,
  spd                 INTEGER NOT NULL DEFAULT 10,
  skill_ids           INTEGER[] NOT NULL DEFAULT '{}',
  exp_reward          INTEGER NOT NULL DEFAULT 10,
  gold_reward         INTEGER NOT NULL DEFAULT 10
);

CREATE TABLE map_monsters (
  id                  SERIAL PRIMARY KEY,
  map_id              INTEGER NOT NULL REFERENCES maps(map_id) ON DELETE CASCADE,
  monster_id          INTEGER NOT NULL REFERENCES monsters(monster_id) ON DELETE CASCADE,
  spawn_weight        INTEGER NOT NULL DEFAULT 100 CHECK (spawn_weight > 0),
  is_stage_boss       BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (map_id, monster_id)
);

CREATE TABLE items (
  item_id             SERIAL PRIMARY KEY,
  code                VARCHAR(64) NOT NULL UNIQUE,
  name_th             VARCHAR(120) NOT NULL,
  name_en             VARCHAR(120) NOT NULL,
  item_type           VARCHAR(32) NOT NULL CHECK (item_type IN ('CONSUMABLE','MATERIAL','SUMMON_TICKET','REBIRTH_STONE','EXP_BOOK','ENHANCE_STONE','EQUIPMENT','CURRENCY_PACK')),
  rarity              VARCHAR(8) NOT NULL DEFAULT 'N' CHECK (rarity IN ('N','R','SR','SSR')),
  description_th      TEXT,
  sell_price          INTEGER NOT NULL DEFAULT 1 CHECK (sell_price >= 0),
  stackable           BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE equipment (
  equipment_id        SERIAL PRIMARY KEY,
  item_id             INTEGER NOT NULL UNIQUE REFERENCES items(item_id) ON DELETE CASCADE,
  slot                VARCHAR(16) NOT NULL CHECK (slot IN ('WEAPON','ARMOR','HELMET','ACCESSORY')),
  set_code            VARCHAR(64),
  req_level           INTEGER NOT NULL DEFAULT 1 CHECK (req_level >= 1),
  hp_bonus            INTEGER NOT NULL DEFAULT 0,
  atk_bonus           INTEGER NOT NULL DEFAULT 0,
  def_bonus           INTEGER NOT NULL DEFAULT 0,
  matk_bonus          INTEGER NOT NULL DEFAULT 0,
  mdef_bonus          INTEGER NOT NULL DEFAULT 0,
  spd_bonus           INTEGER NOT NULL DEFAULT 0,
  crit_bonus          NUMERIC(5,2) NOT NULL DEFAULT 0,
  hit_bonus           NUMERIC(5,2) NOT NULL DEFAULT 0,
  eva_bonus           NUMERIC(5,2) NOT NULL DEFAULT 0
);

CREATE TABLE monster_drops (
  drop_id             SERIAL PRIMARY KEY,
  monster_id          INTEGER NOT NULL REFERENCES monsters(monster_id) ON DELETE CASCADE,
  item_id             INTEGER NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
  drop_rate           NUMERIC(6,5) NOT NULL CHECK (drop_rate > 0 AND drop_rate <= 1),
  min_qty             INTEGER NOT NULL DEFAULT 1 CHECK (min_qty >= 1),
  max_qty             INTEGER NOT NULL DEFAULT 1 CHECK (max_qty >= min_qty)
);

CREATE TABLE quests (
  quest_id            SERIAL PRIMARY KEY,
  code                VARCHAR(64) NOT NULL UNIQUE,
  title_th            VARCHAR(200) NOT NULL,
  title_en            VARCHAR(200) NOT NULL,
  quest_type          VARCHAR(24) NOT NULL CHECK (quest_type IN ('MAIN','SIDE','DAILY','WEEKLY','CHARACTER','COLLECTION','ACHIEVEMENT','EVENT')),
  prerequisite_quest_id INTEGER REFERENCES quests(quest_id),
  req_level           INTEGER NOT NULL DEFAULT 1,
  target_type         VARCHAR(32) NOT NULL CHECK (target_type IN ('KILL_MONSTER','CLEAR_MAP','LEVEL_UP_CHAR','SUMMON_COUNT','EQUIP_ENHANCE','EVOLVE_CHAR','CLAIM_IDLE','COLLECT_CHARS')),
  target_ref_id       INTEGER,
  target_count        INTEGER NOT NULL DEFAULT 1 CHECK (target_count >= 1),
  description_th      TEXT
);

CREATE TABLE quest_rewards (
  reward_id           SERIAL PRIMARY KEY,
  quest_id            INTEGER NOT NULL REFERENCES quests(quest_id) ON DELETE CASCADE,
  reward_type         VARCHAR(24) NOT NULL CHECK (reward_type IN ('GOLD','GEMS','EXP','ITEM','SPIRIT_STONES')),
  item_id             INTEGER REFERENCES items(item_id),
  amount              INTEGER NOT NULL CHECK (amount > 0)
);

-- 3. PLAYERS & AUTHENTICATION
CREATE TABLE players (
  player_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username            VARCHAR(40) NOT NULL UNIQUE,
  email               VARCHAR(255) NOT NULL UNIQUE,
  password_hash       TEXT NOT NULL,
  role                VARCHAR(16) NOT NULL DEFAULT 'PLAYER' CHECK (role IN ('PLAYER','MODERATOR','ADMIN')),
  is_banned           BOOLEAN NOT NULL DEFAULT FALSE,
  last_login_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE player_profiles (
  player_id           UUID PRIMARY KEY REFERENCES players(player_id) ON DELETE CASCADE,
  display_name        VARCHAR(60) NOT NULL,
  avatar_character_id INTEGER REFERENCES characters(character_id),
  level               INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  exp                 BIGINT NOT NULL DEFAULT 0 CHECK (exp >= 0),
  vip_level           INTEGER NOT NULL DEFAULT 0 CHECK (vip_level >= 0),
  current_map_id      INTEGER NOT NULL REFERENCES maps(map_id),
  highest_map_id      INTEGER NOT NULL REFERENCES maps(map_id),
  last_idle_claim_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_battles       INTEGER NOT NULL DEFAULT 0,
  total_wins          INTEGER NOT NULL DEFAULT 0,
  power_rating        INTEGER NOT NULL DEFAULT 0,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE player_currency (
  player_id           UUID PRIMARY KEY REFERENCES players(player_id) ON DELETE CASCADE,
  gold                BIGINT NOT NULL DEFAULT 1000 CHECK (gold >= 0),
  gems                BIGINT NOT NULL DEFAULT 300 CHECK (gems >= 0),
  spirit_stones       BIGINT NOT NULL DEFAULT 50 CHECK (spirit_stones >= 0),
  guild_coins         BIGINT NOT NULL DEFAULT 0 CHECK (guild_coins >= 0),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE player_inventory (
  inventory_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id           UUID NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  item_id             INTEGER NOT NULL REFERENCES items(item_id),
  quantity            INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  enhance_level       SMALLINT NOT NULL DEFAULT 0 CHECK (enhance_level BETWEEN 0 AND 15),
  is_equipped         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_player_inv_player ON player_inventory(player_id);

-- 4. PLAYER CHARACTERS, STATS, FORMATION, EQUIPMENT, SKILLS
CREATE TABLE player_characters (
  player_character_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id           UUID NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  character_id        INTEGER NOT NULL REFERENCES characters(character_id),
  evolution_stage     SMALLINT NOT NULL DEFAULT 0 CHECK (evolution_stage BETWEEN 0 AND 2),
  level               INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  exp                 BIGINT NOT NULL DEFAULT 0 CHECK (exp >= 0),
  star_level          SMALLINT NOT NULL DEFAULT 1 CHECK (star_level BETWEEN 1 AND 10),
  bond_level          SMALLINT NOT NULL DEFAULT 0 CHECK (bond_level >= 0),
  is_locked           BOOLEAN NOT NULL DEFAULT FALSE,
  obtained_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id, character_id)
);
CREATE INDEX idx_player_chars_player ON player_characters(player_id);

CREATE TABLE player_character_stats (
  player_character_id UUID PRIMARY KEY REFERENCES player_characters(player_character_id) ON DELETE CASCADE,
  hp                  INTEGER NOT NULL,
  atk                 INTEGER NOT NULL,
  def                 INTEGER NOT NULL,
  matk                INTEGER NOT NULL,
  mdef                INTEGER NOT NULL,
  spd                 INTEGER NOT NULL,
  crit                NUMERIC(5,2) NOT NULL,
  hit                 NUMERIC(5,2) NOT NULL,
  eva                 NUMERIC(5,2) NOT NULL,
  combat_power        INTEGER NOT NULL,
  recalculated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE player_formation (
  formation_id        SERIAL PRIMARY KEY,
  player_id           UUID NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  preset_index        SMALLINT NOT NULL DEFAULT 1 CHECK (preset_index BETWEEN 1 AND 3),
  slot_index          SMALLINT NOT NULL CHECK (slot_index BETWEEN 1 AND 6),
  player_character_id UUID NOT NULL REFERENCES player_characters(player_character_id) ON DELETE CASCADE,
  role_tag            VARCHAR(16) NOT NULL DEFAULT 'DAMAGE' CHECK (role_tag IN ('TANK','DAMAGE','SUPPORT','HEALER')),
  UNIQUE (player_id, preset_index, slot_index),
  UNIQUE (player_id, preset_index, player_character_id)
);
CREATE INDEX idx_formation_player ON player_formation(player_id);

CREATE TABLE player_equipment (
  id                  SERIAL PRIMARY KEY,
  player_character_id UUID NOT NULL REFERENCES player_characters(player_character_id) ON DELETE CASCADE,
  slot                VARCHAR(16) NOT NULL CHECK (slot IN ('WEAPON','ARMOR','HELMET','ACCESSORY')),
  inventory_id        UUID NOT NULL UNIQUE REFERENCES player_inventory(inventory_id) ON DELETE CASCADE,
  equipped_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_character_id, slot)
);

CREATE TABLE player_skills (
  id                  SERIAL PRIMARY KEY,
  player_character_id UUID NOT NULL REFERENCES player_characters(player_character_id) ON DELETE CASCADE,
  skill_id            INTEGER NOT NULL REFERENCES skills(skill_id),
  skill_level         INTEGER NOT NULL DEFAULT 1 CHECK (skill_level >= 1 AND skill_level <= 20),
  is_active_slot      BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (player_character_id, skill_id)
);

-- 5. QUEST PROGRESS, BATTLES, IDLE & DAILY REWARDS
CREATE TABLE player_quests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id           UUID NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  quest_id            INTEGER NOT NULL REFERENCES quests(quest_id) ON DELETE CASCADE,
  progress            INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0),
  status              VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','COMPLETED','CLAIMED')),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id, quest_id)
);

CREATE TABLE battles (
  battle_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id           UUID NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  battle_type         VARCHAR(24) NOT NULL CHECK (battle_type IN ('STAGE','DUNGEON','BOSS_RAID','WORLD_BOSS','ARENA_PVE')),
  map_id              INTEGER REFERENCES maps(map_id),
  result              VARCHAR(16) NOT NULL CHECK (result IN ('WIN','LOSE','DRAW')),
  total_turns         INTEGER NOT NULL,
  exp_gained          INTEGER NOT NULL DEFAULT 0,
  gold_gained         INTEGER NOT NULL DEFAULT 0,
  rewards_json        JSONB NOT NULL DEFAULT '[]',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_battles_player ON battles(player_id, created_at DESC);

CREATE TABLE battle_logs (
  battle_id           UUID PRIMARY KEY REFERENCES battles(battle_id) ON DELETE CASCADE,
  replay_json         JSONB NOT NULL
);

CREATE TABLE idle_rewards (
  claim_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id           UUID NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  map_id              INTEGER NOT NULL REFERENCES maps(map_id),
  elapsed_seconds     INTEGER NOT NULL CHECK (elapsed_seconds >= 0),
  exp_claimed         INTEGER NOT NULL DEFAULT 0,
  gold_claimed        INTEGER NOT NULL DEFAULT 0,
  items_json          JSONB NOT NULL DEFAULT '[]',
  claimed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_idle_rewards_player ON idle_rewards(player_id, claimed_at DESC);

CREATE TABLE daily_rewards (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id           UUID NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  claim_date          DATE NOT NULL,
  streak_day          SMALLINT NOT NULL CHECK (streak_day BETWEEN 1 AND 30),
  rewards_json        JSONB NOT NULL,
  claimed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id, claim_date)
);

-- 6. MULTIPLAYER: GUILDS, FRIENDS, MAILBOX, RANKINGS, EVENTS, CONFIG, ADMIN
CREATE TABLE guilds (
  guild_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                VARCHAR(48) NOT NULL UNIQUE,
  tag                 VARCHAR(8) NOT NULL UNIQUE,
  leader_id           UUID NOT NULL REFERENCES players(player_id),
  level               INTEGER NOT NULL DEFAULT 1,
  exp                 BIGINT NOT NULL DEFAULT 0,
  notice              TEXT,
  max_members         INTEGER NOT NULL DEFAULT 30,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE guild_members (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id            UUID NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  player_id           UUID NOT NULL UNIQUE REFERENCES players(player_id) ON DELETE CASCADE,
  role                VARCHAR(16) NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('LEADER','OFFICER','MEMBER')),
  contribution        BIGINT NOT NULL DEFAULT 0,
  joined_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE friends (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id           UUID NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  friend_id           UUID NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  status              VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','BLOCKED')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id, friend_id),
  CHECK (player_id <> friend_id)
);

CREATE TABLE mailbox (
  mail_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id           UUID NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  title_th            VARCHAR(200) NOT NULL,
  body_th             TEXT NOT NULL,
  attachments_json    JSONB NOT NULL DEFAULT '[]',
  is_read             BOOLEAN NOT NULL DEFAULT FALSE,
  is_claimed          BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_mailbox_player ON mailbox(player_id, created_at DESC);

CREATE TABLE rankings (
  ranking_id          SERIAL PRIMARY KEY,
  category            VARCHAR(32) NOT NULL CHECK (category IN ('POWER','LEVEL','BOSS_DAMAGE','GUILD_POWER')),
  entity_id           UUID NOT NULL,
  display_name        VARCHAR(80) NOT NULL,
  score               BIGINT NOT NULL DEFAULT 0,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (category, entity_id)
);
CREATE INDEX idx_rankings_cat_score ON rankings(category, score DESC);

CREATE TABLE game_events (
  event_id            SERIAL PRIMARY KEY,
  code                VARCHAR(64) NOT NULL UNIQUE,
  title_th            VARCHAR(200) NOT NULL,
  description_th      TEXT,
  event_type          VARCHAR(32) NOT NULL CHECK (event_type IN ('DOUBLE_EXP','DOUBLE_DROP','BOSS_RUSH','SUMMON_UP')),
  multiplier          NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  is_active           BOOLEAN NOT NULL DEFAULT FALSE,
  starts_at           TIMESTAMPTZ NOT NULL,
  ends_at             TIMESTAMPTZ NOT NULL
);

CREATE TABLE game_configurations (
  config_key          VARCHAR(100) PRIMARY KEY,
  config_value        JSONB NOT NULL,
  description         TEXT,
  updated_by          UUID REFERENCES players(player_id),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE admin_logs (
  log_id              BIGSERIAL PRIMARY KEY,
  admin_id            UUID REFERENCES players(player_id),
  action              VARCHAR(64) NOT NULL,
  target_table        VARCHAR(64),
  target_id           VARCHAR(128),
  before_json         JSONB,
  after_json          JSONB,
  ip_address          VARCHAR(64),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_admin_logs_created ON admin_logs(created_at DESC);

COMMIT;
