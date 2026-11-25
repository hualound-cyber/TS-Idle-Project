import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCharacterStats,
  calculateIdleRewards,
  getElementMultiplier,
  simulateBattle,
} from './index.js';

test('Element advantage cycle (Earth > Water > Fire > Wind > Earth)', () => {
  assert.equal(getElementMultiplier('earth', 'water'), 1.25);
  assert.equal(getElementMultiplier('water', 'earth'), 0.8);
  assert.equal(getElementMultiplier('fire', 'wind'), 1.25);
  assert.equal(getElementMultiplier('psy', 'fire'), 1.0);
});

test('Character 9-stat calculation scales with evolution and equipment', () => {
  const base = { base_hp: 50, base_sp: 20, base_int: 40, base_atk: 60, base_def: 35, base_agi: 50 };
  const s0 = calculateCharacterStats(base, 1, 0, 1, 0);
  const s2 = calculateCharacterStats(base, 20, 2, 3, 2, [
    { hp_bonus: 120, atk_bonus: 50, def_bonus: 20, matk_bonus: 0, mdef_bonus: 0, spd_bonus: 10, crit_bonus: 5, hit_bonus: 2, eva_bonus: 1 },
  ]);
  assert.ok(s2.hp > s0.hp);
  assert.ok(s2.atk > s0.atk);
  assert.ok(s2.combat_power > s0.combat_power);
  assert.equal(s2.hit, 97);
});

test('Idle progression caps at idleMaxSeconds', () => {
  const res = calculateIdleRewards({
    elapsedSeconds: 999999,
    idleMaxSeconds: 43200, // 12h = 720m
    expPerMin: 100,
    goldPerMin: 50,
    expMultiplier: 1.5,
    goldMultiplier: 1.0,
    vipLevel: 0,
  });
  assert.equal(res.cappedSeconds, 43200);
  assert.equal(res.expGained, 720 * 100 * 1.5);
  assert.equal(res.goldGained, 720 * 50);
});

test('Deterministic turn-based combat resolves cleanly', () => {
  const player = [
    {
      uid: 'p1',
      name_th: 'กวนอู',
      side: 'PLAYER' as const,
      slot_index: 1,
      element: 'wind' as const,
      hp: 800,
      atk: 140,
      def: 70,
      matk: 60,
      mdef: 50,
      spd: 90,
      crit: 15,
      hit: 95,
      eva: 5,
      skills: [
        {
          skill_id: 1,
          name_th: 'ง้าวมังกรสะบั้น',
          element: 'wind' as const,
          sp_cost: 25,
          damage_type: 'PHYSICAL' as const,
          power_multiplier: 1.5,
          target_scope: 'SINGLE' as const,
          cooldown_turns: 2,
        },
      ],
    },
  ];
  const enemy = [
    {
      uid: 'e1',
      name_th: 'โจรป่า',
      side: 'ENEMY' as const,
      slot_index: 1,
      element: 'earth' as const,
      hp: 300,
      atk: 30,
      def: 20,
      matk: 10,
      mdef: 10,
      spd: 20,
      crit: 5,
      hit: 90,
      eva: 5,
      skills: [],
    },
  ];
  const r1 = simulateBattle(player, enemy, 12345);
  const r2 = simulateBattle(player, enemy, 12345);
  assert.equal(r1.winner, 'WIN');
  assert.deepEqual(r1, r2);
  assert.ok(r1.logs.length > 0);
});
