import { CombatBalanceConfig, DEFAULT_COMBAT_BALANCE, ElementType, getElementMultiplier } from './elements.js';

export type BattleSide = 'PLAYER' | 'ENEMY';
export type TargetScope = 'SINGLE' | 'ROW' | 'ALL_ENEMIES' | 'ALLY_SINGLE' | 'ALLY_ALL' | 'SELF';
export type DamageType = 'PHYSICAL' | 'MAGICAL' | 'HEAL' | 'BUFF' | 'DEBUFF';

export interface BattleSkill {
  skill_id: number;
  name_th: string;
  element: ElementType;
  sp_cost: number;
  damage_type: DamageType;
  power_multiplier: number;
  target_scope: TargetScope;
  status_effect?: string | null;
  status_chance?: number;
  status_duration?: number;
  cooldown_turns: number;
}

export interface CombatantInput {
  uid: string;
  name_th: string;
  side: BattleSide;
  slot_index: number; // 1..3 front row, 4..6 back row
  element: ElementType;
  hp: number;
  atk: number;
  def: number;
  matk: number;
  mdef: number;
  spd: number;
  crit: number;
  hit: number;
  eva: number;
  skills: BattleSkill[];
}

export interface BattleEventLog {
  turn: number;
  actor_uid: string;
  actor_name: string;
  action_type: 'NORMAL_ATTACK' | 'SKILL';
  skill_name?: string;
  targets: Array<{
    uid: string;
    name: string;
    damage: number;
    heal: number;
    is_crit: boolean;
    is_evaded: boolean;
    element_mult: number;
    remaining_hp: number;
    applied_status?: string;
  }>;
}

export interface BattleResult {
  winner: 'WIN' | 'LOSE' | 'DRAW';
  total_turns: number;
  logs: BattleEventLog[];
  survivors_player: number;
  survivors_enemy: number;
}

// Deterministic Mulberry32 PRNG for reproducible server-side battles
function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface RuntimeUnit extends CombatantInput {
  max_hp: number;
  current_hp: number;
  cooldowns: Record<number, number>;
  buffs: Array<{ type: string; turns: number }>;
}

export function simulateBattle(
  playerUnits: CombatantInput[],
  enemyUnits: CombatantInput[],
  seed: number = Date.now(),
  config: CombatBalanceConfig = DEFAULT_COMBAT_BALANCE,
): BattleResult {
  const rng = createRng(seed);

  const applyRowBonus = (u: CombatantInput): RuntimeUnit => {
    const isFront = u.slot_index >= 1 && u.slot_index <= 3;
    const def = isFront ? Math.round(u.def * (1 + config.front_row_def_bonus)) : u.def;
    const atk = !isFront ? Math.round(u.atk * (1 + config.back_row_atk_bonus)) : u.atk;
    const matk = !isFront ? Math.round(u.matk * (1 + config.back_row_atk_bonus)) : u.matk;
    return {
      ...u,
      atk,
      matk,
      def,
      max_hp: u.hp,
      current_hp: u.hp,
      cooldowns: {},
      buffs: [],
    };
  };

  const units: RuntimeUnit[] = [
    ...playerUnits.map(applyRowBonus),
    ...enemyUnits.map(applyRowBonus),
  ];

  const logs: BattleEventLog[] = [];
  let turn = 0;

  const aliveOf = (side: BattleSide) => units.filter((u) => u.side === side && u.current_hp > 0);

  while (turn < config.max_turns && aliveOf('PLAYER').length > 0 && aliveOf('ENEMY').length > 0) {
    turn++;
    const turnOrder = units
      .filter((u) => u.current_hp > 0)
      .sort((a, b) => b.spd - a.spd || (a.side === 'PLAYER' ? -1 : 1));

    for (const actor of turnOrder) {
      if (actor.current_hp <= 0) continue;
      if (aliveOf('PLAYER').length === 0 || aliveOf('ENEMY').length === 0) break;

      // Decrement cooldowns & buffs
      for (const sid of Object.keys(actor.cooldowns)) {
        if (actor.cooldowns[+sid] > 0) actor.cooldowns[+sid]--;
      }
      actor.buffs = actor.buffs.map((b) => ({ ...b, turns: b.turns - 1 })).filter((b) => b.turns > 0);

      if (actor.buffs.some((b) => b.type === 'STUN')) {
        continue;
      }

      const enemies = aliveOf(actor.side === 'PLAYER' ? 'ENEMY' : 'PLAYER');
      const allies = aliveOf(actor.side);
      if (enemies.length === 0) break;

      // Pick highest priority ready skill or fall back to normal attack
      const readySkill = actor.skills.find((s) => (actor.cooldowns[s.skill_id] ?? 0) <= 0);
      const useSkill = readySkill && rng() < 0.65 ? readySkill : null;

      if (useSkill) {
        actor.cooldowns[useSkill.skill_id] = Math.max(1, useSkill.cooldown_turns);
      }

      const frontEnemies = enemies.filter((e) => e.slot_index <= 3);
      const primaryEnemy = (frontEnemies.length > 0 ? frontEnemies : enemies)[0];

      let targets: RuntimeUnit[] = [primaryEnemy];
      if (useSkill) {
        if (useSkill.target_scope === 'ALL_ENEMIES') targets = enemies;
        else if (useSkill.target_scope === 'ROW') {
          const targetRowFront = primaryEnemy.slot_index <= 3;
          targets = enemies.filter((e) => (targetRowFront ? e.slot_index <= 3 : e.slot_index > 3));
        } else if (useSkill.target_scope === 'ALLY_SINGLE') {
          targets = [allies.sort((a, b) => a.current_hp / a.max_hp - b.current_hp / b.max_hp)[0]];
        } else if (useSkill.target_scope === 'ALLY_ALL') {
          targets = allies;
        } else if (useSkill.target_scope === 'SELF') {
          targets = [actor];
        }
      }

      const eventTargets: BattleEventLog['targets'] = [];

      for (const tgt of targets) {
        if (useSkill && useSkill.damage_type === 'HEAL') {
          const healAmt = Math.max(10, Math.round(actor.matk * useSkill.power_multiplier));
          tgt.current_hp = Math.min(tgt.max_hp, tgt.current_hp + healAmt);
          eventTargets.push({
            uid: tgt.uid,
            name: tgt.name_th,
            damage: 0,
            heal: healAmt,
            is_crit: false,
            is_evaded: false,
            element_mult: 1.0,
            remaining_hp: tgt.current_hp,
          });
          continue;
        }

        if (useSkill && useSkill.damage_type === 'BUFF') {
          const status = useSkill.status_effect || 'ATK_UP';
          tgt.buffs.push({ type: status, turns: useSkill.status_duration || 2 });
          eventTargets.push({
            uid: tgt.uid,
            name: tgt.name_th,
            damage: 0,
            heal: 0,
            is_crit: false,
            is_evaded: false,
            element_mult: 1.0,
            remaining_hp: tgt.current_hp,
            applied_status: status,
          });
          continue;
        }

        // Hit / Evasion check
        const hitChance = Math.max(0.5, Math.min(0.99, (actor.hit - tgt.eva) / 100));
        if (rng() > hitChance) {
          eventTargets.push({
            uid: tgt.uid,
            name: tgt.name_th,
            damage: 0,
            heal: 0,
            is_crit: false,
            is_evaded: true,
            element_mult: 1.0,
            remaining_hp: tgt.current_hp,
          });
          continue;
        }

        const isMagical = useSkill?.damage_type === 'MAGICAL';
        const atkStat = (isMagical ? actor.matk : actor.atk) * (actor.buffs.some((b) => b.type === 'ATK_UP') ? 1.2 : 1.0);
        const defStat = (isMagical ? tgt.mdef : tgt.def) * (tgt.buffs.some((b) => b.type === 'DEF_DOWN') ? 0.75 : 1.0);
        const skillMult = useSkill ? useSkill.power_multiplier : 1.0;
        const elMult = getElementMultiplier(useSkill ? useSkill.element : actor.element, tgt.element, config);
        const isCrit = rng() * 100 < actor.crit;
        const critMult = isCrit ? config.crit_multiplier : 1.0;

        const mitigation = 100 / (100 + Math.max(0, defStat));
        const variance = 0.92 + rng() * 0.16;
        const rawDmg = atkStat * skillMult * mitigation * elMult * critMult * variance;
        const damage = Math.max(1, Math.round(rawDmg));

        tgt.current_hp = Math.max(0, tgt.current_hp - damage);

        let appliedStatus: string | undefined;
        if (useSkill?.status_effect && useSkill.status_chance && rng() < useSkill.status_chance) {
          tgt.buffs.push({ type: useSkill.status_effect, turns: useSkill.status_duration || 2 });
          appliedStatus = useSkill.status_effect;
        }

        eventTargets.push({
          uid: tgt.uid,
          name: tgt.name_th,
          damage,
          heal: 0,
          is_crit: isCrit,
          is_evaded: false,
          element_mult: elMult,
          remaining_hp: tgt.current_hp,
          applied_status: appliedStatus,
        });
      }

      logs.push({
        turn,
        actor_uid: actor.uid,
        actor_name: actor.name_th,
        action_type: useSkill ? 'SKILL' : 'NORMAL_ATTACK',
        skill_name: useSkill?.name_th,
        targets: eventTargets,
      });
    }
  }

  const pAlive = aliveOf('PLAYER').length;
  const eAlive = aliveOf('ENEMY').length;
  const winner = eAlive === 0 && pAlive > 0 ? 'WIN' : pAlive === 0 ? 'LOSE' : 'DRAW';

  return {
    winner,
    total_turns: turn,
    logs,
    survivors_player: pAlive,
    survivors_enemy: eAlive,
  };
}
