import React, { useEffect, useRef, useState } from 'react';

interface UnitSnap {
  uid: string;
  name_th: string;
  slot_index: number;
  element: string;
  hp: number;
}

interface BattleEvent {
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
    remaining_hp: number;
  }>;
}

interface Props {
  playerUnits: UnitSnap[];
  enemyUnits: UnitSnap[];
  logs: BattleEvent[];
  winner: 'WIN' | 'LOSE' | 'DRAW';
  expGained: number;
  goldGained: number;
}

const EL_COLOR: Record<string, string> = {
  fire: '#ff6b4a',
  wind: '#4ade80',
  water: '#38bdf8',
  earth: '#f59e0b',
  psy: '#c084fc',
  none: '#a1a1aa',
};

export const BattleCanvas: React.FC<Props> = ({
  playerUnits,
  enemyUnits,
  logs,
  winner,
  expGained,
  goldGained,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [speed, setSpeed] = useState<1 | 2 | 3>(1);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    setStepIdx(0);
    setPlaying(true);
  }, [logs]);

  useEffect(() => {
    if (!playing || stepIdx >= logs.length) return;
    const ms = speed === 3 ? 220 : speed === 2 ? 420 : 750;
    const timer = setTimeout(() => setStepIdx((s) => s + 1), ms);
    return () => clearTimeout(timer);
  }, [playing, stepIdx, logs.length, speed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    // Compute HP state up to stepIdx
    const hpMap: Record<string, number> = {};
    const maxHpMap: Record<string, number> = {};
    for (const u of [...playerUnits, ...enemyUnits]) {
      hpMap[u.uid] = u.hp;
      maxHpMap[u.uid] = u.hp;
    }
    for (let i = 0; i < Math.min(stepIdx, logs.length); i++) {
      for (const t of logs[i].targets) {
        hpMap[t.uid] = t.remaining_hp;
      }
    }
    const activeEvent = stepIdx > 0 && stepIdx <= logs.length ? logs[stepIdx - 1] : null;

    // Clear & Draw Isometric Arena Grid
    ctx.clearRect(0, 0, W, H);
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#1a1126');
    grad.addColorStop(1, '#2c1824');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(251, 191, 36, 0.12)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, H * 0.35);
      ctx.lineTo(x - 60, H);
      ctx.stroke();
    }
    for (let y = H * 0.38; y < H; y += 34) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    const drawUnit = (u: UnitSnap, idx: number, isPlayer: boolean) => {
      const col = u.slot_index <= 3 ? 0 : 1;
      const row = (u.slot_index - 1) % 3;
      const x = isPlayer ? 150 - col * 72 + row * 16 : W - 150 + col * 72 - row * 16;
      const y = 115 + row * 68;

      const curHp = hpMap[u.uid] ?? u.hp;
      const maxHp = maxHpMap[u.uid] || 1;
      const alive = curHp > 0;
      const isActor = activeEvent?.actor_uid === u.uid;

      ctx.save();
      if (!alive) ctx.globalAlpha = 0.28;

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.ellipse(x, y + 22, 24, 9, 0, 0, Math.PI * 2);
      ctx.fill();

      // Character Circle / Sprite Token
      const drawX = isActor ? x + (isPlayer ? 14 : -14) : x;
      ctx.fillStyle = EL_COLOR[u.element] || '#a1a1aa';
      ctx.beginPath();
      ctx.arc(drawX, y, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = isActor ? 3 : 2;
      ctx.strokeStyle = isActor ? '#fde047' : '#fff8e7';
      ctx.stroke();

      // Name inside token
      ctx.fillStyle = '#0f0b14';
      ctx.font = 'bold 11px "Noto Sans Thai", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(u.name_th.slice(0, 3), drawX, y + 4);

      // Nameplate & HP Bar
      ctx.fillStyle = '#f5efe6';
      ctx.font = '11px "Noto Sans Thai", sans-serif';
      ctx.fillText(u.name_th, drawX, y - 28);

      ctx.fillStyle = '#1f2937';
      ctx.fillRect(drawX - 28, y - 24, 56, 6);
      ctx.fillStyle = isPlayer ? '#22c55e' : '#ef4444';
      ctx.fillRect(drawX - 28, y - 24, 56 * Math.max(0, curHp / maxHp), 6);

      // Floating Damage/Heal Popup
      const hitTarget = activeEvent?.targets.find((t) => t.uid === u.uid);
      if (hitTarget) {
        ctx.font = hitTarget.is_crit ? 'bold 16px sans-serif' : 'bold 13px sans-serif';
        if (hitTarget.is_evaded) {
          ctx.fillStyle = '#94a3b8';
          ctx.fillText('MISS', drawX, y - 40);
        } else if (hitTarget.heal > 0) {
          ctx.fillStyle = '#4ade80';
          ctx.fillText(`+${hitTarget.heal}`, drawX, y - 40);
        } else {
          ctx.fillStyle = hitTarget.is_crit ? '#fde047' : '#fb7185';
          ctx.fillText(`${hitTarget.is_crit ? 'CRIT ' : ''}-${hitTarget.damage}`, drawX, y - 40);
        }
      }

      ctx.restore();
    };

    playerUnits.forEach((u, i) => drawUnit(u, i, true));
    enemyUnits.forEach((u, i) => drawUnit(u, i, false));
  }, [playerUnits, enemyUnits, logs, stepIdx]);

  const finished = stepIdx >= logs.length;

  return (
    <div className="bg-[#181221] border border-amber-500/30 rounded-2xl p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-bold text-amber-300">
          ⚔️ 2D Turn-Based Auto Battle ({Math.min(stepIdx, logs.length)} / {logs.length} Actions)
        </div>
        <div className="flex items-center gap-2">
          {([1, 2, 3] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                speed === s ? 'bg-amber-500 text-black' : 'bg-white/10 text-stone-300'
              }`}
            >
              {s}×
            </button>
          ))}
          <button
            onClick={() => {
              setStepIdx(0);
              setPlaying(true);
            }}
            className="px-3 py-1 rounded-lg text-xs font-bold bg-rose-600/80 hover:bg-rose-500 text-white"
          >
            Replay
          </button>
          <button
            onClick={() => setStepIdx(logs.length)}
            className="px-3 py-1 rounded-lg text-xs font-bold bg-white/10 hover:bg-white/20 text-stone-200"
          >
            Skip
          </button>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={680}
        height={320}
        className="w-full rounded-xl border border-white/10 bg-[#140e1c]"
      />

      {finished && (
        <div
          className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-2 ${
            winner === 'WIN'
              ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200'
              : 'bg-rose-950/60 border-rose-500/50 text-rose-200'
          }`}
        >
          <span className="font-extrabold text-base">
            {winner === 'WIN' ? '🏆 ชัยชนะ! (VICTORY)' : '💀 พ่ายแพ้ (DEFEAT)'}
          </span>
          {winner === 'WIN' && (
            <span className="text-sm font-semibold">
              +EXP {expGained.toLocaleString()} · +Gold {goldGained.toLocaleString()}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
