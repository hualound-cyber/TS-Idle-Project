export interface IdleCalculationInput {
  elapsedSeconds: number;
  idleMaxSeconds: number;
  expPerMin: number;
  goldPerMin: number;
  expMultiplier: number;
  goldMultiplier: number;
  vipLevel?: number;
}

export interface IdleCalculationResult {
  cappedSeconds: number;
  expGained: number;
  goldGained: number;
}

export function calculateIdleRewards(input: IdleCalculationInput): IdleCalculationResult {
  const safeElapsed = Math.max(0, Math.floor(input.elapsedSeconds));
  const cappedSeconds = Math.min(safeElapsed, Math.max(0, input.idleMaxSeconds));
  const minutes = cappedSeconds / 60;
  const vipBonus = 1 + Math.max(0, input.vipLevel ?? 0) * 0.05;

  const expGained = Math.floor(minutes * input.expPerMin * input.expMultiplier * vipBonus);
  const goldGained = Math.floor(minutes * input.goldPerMin * input.goldMultiplier * vipBonus);

  return { cappedSeconds, expGained, goldGained };
}
