export type ElementType = 'fire' | 'wind' | 'water' | 'earth' | 'psy' | 'none';

export interface CombatBalanceConfig {
  element_advantage: number;
  element_disadvantage: number;
  crit_multiplier: number;
  max_turns: number;
  front_row_def_bonus: number;
  back_row_atk_bonus: number;
}

export const DEFAULT_COMBAT_BALANCE: CombatBalanceConfig = {
  element_advantage: 1.25,
  element_disadvantage: 0.8,
  crit_multiplier: 1.5,
  max_turns: 20,
  front_row_def_bonus: 0.1,
  back_row_atk_bonus: 0.1,
};

// TS Online Classic element cycle: Earth > Water > Fire > Wind > Earth
const ADVANTAGE_MAP: Record<ElementType, ElementType | null> = {
  earth: 'water',
  water: 'fire',
  fire: 'wind',
  wind: 'earth',
  psy: null,
  none: null,
};

export function getElementMultiplier(
  attacker: ElementType,
  defender: ElementType,
  config: CombatBalanceConfig = DEFAULT_COMBAT_BALANCE,
): number {
  if (ADVANTAGE_MAP[attacker] === defender) {
    return config.element_advantage;
  }
  if (ADVANTAGE_MAP[defender] === attacker) {
    return config.element_disadvantage;
  }
  return 1.0;
}
