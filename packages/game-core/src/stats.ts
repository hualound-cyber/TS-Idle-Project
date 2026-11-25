export interface BaseEvolutionStats {
  base_hp: number;
  base_sp: number;
  base_int: number;
  base_atk: number;
  base_def: number;
  base_agi: number;
}

export interface EquipmentStatBonus {
  hp_bonus: number;
  atk_bonus: number;
  def_bonus: number;
  matk_bonus: number;
  mdef_bonus: number;
  spd_bonus: number;
  crit_bonus: number;
  hit_bonus: number;
  eva_bonus: number;
}

export interface StatGrowthConfig {
  hp_growth: number;
  atk_growth: number;
  def_growth: number;
  int_growth: number;
  mdef_growth: number;
  agi_growth: number;
  evo_mult: [number, number, number];
  star_mult_per_star: number;
  base_crit: number;
  base_hit: number;
  base_eva: number;
}

export const DEFAULT_STAT_GROWTH: StatGrowthConfig = {
  hp_growth: 0.12,
  atk_growth: 0.1,
  def_growth: 0.1,
  int_growth: 0.1,
  mdef_growth: 0.09,
  agi_growth: 0.08,
  evo_mult: [1.0, 1.35, 1.75],
  star_mult_per_star: 0.08,
  base_crit: 5.0,
  base_hit: 95.0,
  base_eva: 5.0,
};

export interface ComputedCharacterStats {
  hp: number;
  atk: number;
  def: number;
  matk: number;
  mdef: number;
  spd: number;
  crit: number;
  hit: number;
  eva: number;
  combat_power: number;
}

export function calculateCharacterStats(
  base: BaseEvolutionStats,
  level: number,
  evolutionStage: number,
  starLevel: number,
  bondLevel: number,
  equipBonuses: EquipmentStatBonus[] = [],
  config: StatGrowthConfig = DEFAULT_STAT_GROWTH,
): ComputedCharacterStats {
  const evoIdx = Math.max(0, Math.min(2, evolutionStage));
  const evoMult = config.evo_mult[evoIdx] ?? 1.0;
  const starMult = 1 + Math.max(0, starLevel - 1) * config.star_mult_per_star;
  const bondMult = 1 + Math.max(0, bondLevel) * 0.02;
  const totalMult = evoMult * starMult * bondMult;
  const lvOffset = Math.max(0, level - 1);

  const eq = equipBonuses.reduce(
    (acc, b) => ({
      hp_bonus: acc.hp_bonus + b.hp_bonus,
      atk_bonus: acc.atk_bonus + b.atk_bonus,
      def_bonus: acc.def_bonus + b.def_bonus,
      matk_bonus: acc.matk_bonus + b.matk_bonus,
      mdef_bonus: acc.mdef_bonus + b.mdef_bonus,
      spd_bonus: acc.spd_bonus + b.spd_bonus,
      crit_bonus: acc.crit_bonus + Number(b.crit_bonus),
      hit_bonus: acc.hit_bonus + Number(b.hit_bonus),
      eva_bonus: acc.eva_bonus + Number(b.eva_bonus),
    }),
    {
      hp_bonus: 0,
      atk_bonus: 0,
      def_bonus: 0,
      matk_bonus: 0,
      mdef_bonus: 0,
      spd_bonus: 0,
      crit_bonus: 0,
      hit_bonus: 0,
      eva_bonus: 0,
    },
  );

  // Scale base HP up for RPG idle pacing (x4 baseline)
  const hp = Math.round(base.base_hp * 4 * totalMult * (1 + lvOffset * config.hp_growth) + eq.hp_bonus);
  const atk = Math.round(base.base_atk * totalMult * (1 + lvOffset * config.atk_growth) + eq.atk_bonus);
  const def = Math.round(base.base_def * totalMult * (1 + lvOffset * config.def_growth) + eq.def_bonus);
  const matk = Math.round(base.base_int * totalMult * (1 + lvOffset * config.int_growth) + eq.matk_bonus);
  const mdef = Math.round(
    (base.base_int * 0.6 + base.base_def * 0.4) * totalMult * (1 + lvOffset * config.mdef_growth) + eq.mdef_bonus,
  );
  const spd = Math.round(base.base_agi * totalMult * (1 + lvOffset * config.agi_growth) + eq.spd_bonus);

  const crit = Number((config.base_crit + Math.min(35, base.base_agi * 0.05) + eq.crit_bonus).toFixed(2));
  const hit = Number((config.base_hit + eq.hit_bonus).toFixed(2));
  const eva = Number((config.base_eva + Math.min(30, base.base_agi * 0.04) + eq.eva_bonus).toFixed(2));

  const combat_power = Math.round(hp * 0.25 + atk * 1.5 + matk * 1.5 + def * 1.2 + mdef * 1.2 + spd * 1.1 + crit * 5);

  return { hp, atk, def, matk, mdef, spd, crit, hit, eva, combat_power };
}
