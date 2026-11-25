import React from 'react';

const ELEMENT_PALETTE: Record<string, { bg: string; glow: string; badge: string; label: string }> = {
  fire: { bg: '#3f1515', glow: '#ff6b4a', badge: '🔥', label: 'ไฟ' },
  wind: { bg: '#123828', glow: '#4ade80', badge: '🍃', label: 'ลม' },
  water: { bg: '#102c46', glow: '#38bdf8', badge: '💧', label: 'น้ำ' },
  earth: { bg: '#3b2c12', glow: '#f59e0b', badge: '⛰️', label: 'ดิน' },
  psy: { bg: '#2e1647', glow: '#c084fc', badge: '✦', label: 'จิต' },
  none: { bg: '#27272a', glow: '#a1a1aa', badge: '❖', label: 'กลาง' },
};

const RARITY_BORDER: Record<string, string> = {
  SSR: 'border-amber-400 shadow-[0_0_16px_rgba(251,191,36,0.45)]',
  SR: 'border-purple-400 shadow-[0_0_12px_rgba(192,132,252,0.35)]',
  R: 'border-sky-400',
  N: 'border-stone-500',
};

interface Props {
  characterId: number;
  name: string;
  element: string;
  rarity?: string;
  evolutionStage?: number;
  size?: 'sm' | 'md' | 'lg';
}

export const WarlordAvatar: React.FC<Props> = ({
  characterId,
  name,
  element,
  rarity = 'N',
  evolutionStage = 0,
  size = 'md',
}) => {
  const pal = ELEMENT_PALETTE[element] || ELEMENT_PALETTE.none;
  const dims = size === 'sm' ? 'w-12 h-12' : size === 'lg' ? 'w-24 h-24' : 'w-16 h-16';
  const initial = (name || '?').slice(0, 2);
  const patternAngle = ((characterId * 37) % 180) + 'deg';

  return (
    <div
      className={`relative ${dims} rounded-2xl border-2 ${RARITY_BORDER[rarity] || RARITY_BORDER.N} overflow-hidden flex items-center justify-center select-none shrink-0`}
      style={{
        background: `linear-gradient(${patternAngle}, ${pal.bg}, #16111d)`,
      }}
    >
      {/* Original Procedural Crest */}
      <svg viewBox="0 0 64 64" className="absolute inset-0 w-full h-full opacity-35">
        <circle cx="32" cy="32" r="24" fill="none" stroke={pal.glow} strokeWidth="1.5" strokeDasharray="4 3" />
        <polygon points="32,8 52,32 32,56 12,32" fill="none" stroke={pal.glow} strokeWidth="1.2" />
      </svg>

      <span className="relative z-10 font-extrabold text-amber-100 tracking-tight text-sm md:text-base drop-shadow">
        {initial}
      </span>

      <span className="absolute top-0.5 left-1 text-[10px] leading-none">{pal.badge}</span>

      {evolutionStage > 0 && (
        <span className="absolute bottom-0.5 right-1 text-[9px] font-bold px-1 rounded bg-amber-500/90 text-black">
          +{evolutionStage}
        </span>
      )}
    </div>
  );
};
