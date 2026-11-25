import React, { useEffect, useMemo, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  Award,
  Backpack,
  BookOpen,
  Compass,
  Crown,
  Flame,
  Gift,
  LogOut,
  Mail,
  MessageSquare,
  Settings,
  Shield,
  ShoppingBag,
  Sparkles,
  Swords,
  Trophy,
  Users,
  Wrench,
} from 'lucide-react';
import { apiFetch, clearTokens, getAccessToken, setTokens } from './api';
import { WarlordAvatar } from './components/WarlordAvatar';
import { BattleCanvas } from './components/BattleCanvas';

type Tab =
  | 'dashboard'
  | 'world'
  | 'warlords'
  | 'summon'
  | 'formation'
  | 'inventory'
  | 'quests'
  | 'boss'
  | 'social'
  | 'shop'
  | 'mailbox'
  | 'encyclopedia'
  | 'settings'
  | 'admin';

const LABELS = {
  th: {
    title: 'TS Legends — Idle RPG',
    dashboard: 'หน้าหลัก',
    world: 'แผนที่โลก',
    warlords: 'ขุนพลของฉัน',
    summon: 'อัญเชิญ',
    formation: 'จัดทัพ 2×3',
    inventory: 'กระเป๋า & อุปกรณ์',
    quests: 'ภารกิจ',
    boss: 'บอส & ดันเจี้ยน',
    social: 'กิลด์ & อันดับ',
    shop: 'ร้านค้า',
    mailbox: 'จดหมาย',
    encyclopedia: 'ทำเนียบ 429 ขุนพล',
    settings: 'ตั้งค่า',
    admin: 'ผู้ดูแลระบบ',
  },
  en: {
    title: 'TS Legends — Idle RPG',
    dashboard: 'Dashboard',
    world: 'World Map',
    warlords: 'My Warlords',
    summon: 'Summon',
    formation: 'Formation',
    inventory: 'Inventory',
    quests: 'Quests',
    boss: 'Boss & Dungeon',
    social: 'Guild & Rank',
    shop: 'Shop',
    mailbox: 'Mailbox',
    encyclopedia: '429 Codex',
    settings: 'Settings',
    admin: 'Admin Panel',
  },
};

export function App() {
  const [lang, setLang] = useState<'th' | 'en'>('th');
  const [tab, setTab] = useState<Tab>('dashboard');
  const [authed, setAuthed] = useState<boolean>(!!getAccessToken());
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authForm, setAuthForm] = useState({ username: '', email: '', password: '', displayName: '' });
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);

  const [me, setMe] = useState<any>(null);
  const [idleStatus, setIdleStatus] = useState<any>(null);
  const [mapsData, setMapsData] = useState<{ maps: any[]; worldBoss: any }>({ maps: [], worldBoss: null });
  const [catalogChars, setCatalogChars] = useState<any[]>([]);
  const [catalogSkills, setCatalogSkills] = useState<any[]>([]);
  const [catalogItems, setCatalogItems] = useState<any[]>([]);
  const [rankings, setRankings] = useState<any[]>([]);
  const [guildsData, setGuildsData] = useState<{ guilds: any[]; myGuild: any }>({ guilds: [], myGuild: null });
  const [mailbox, setMailbox] = useState<any[]>([]);
  const [adminData, setAdminData] = useState<any>(null);

  const [selectedChar, setSelectedChar] = useState<any>(null);
  const [battleResult, setBattleResult] = useState<any>(null);
  const [summonResult, setSummonResult] = useState<any[] | null>(null);
  const [codexFilter, setCodexFilter] = useState({ q: '', el: 'all', rarity: 'all' });

  // WebSocket Chat
  const [socket, setSocket] = useState<Socket | null>(null);
  const [chatMsgs, setChatMsgs] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [guildForm, setGuildForm] = useState({ name: '', tag: '' });

  const t = LABELS[lang];

  const notify = (msg: string, err = false) => {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 3500);
  };

  const loadAll = async () => {
    try {
      const [meRes, idleRes, mapsRes, itemsRes] = await Promise.all([
        apiFetch('/api/player/me'),
        apiFetch('/api/idle/status'),
        apiFetch('/api/catalog/maps'),
        apiFetch('/api/catalog/items'),
      ]);
      setMe(meRes);
      setIdleStatus(idleRes);
      setMapsData(mapsRes);
      setCatalogItems(itemsRes.items || []);
      if (!selectedChar && meRes.characters?.length > 0) {
        setSelectedChar(meRes.characters[0]);
      } else if (selectedChar) {
        const updated = meRes.characters?.find((c: any) => c.player_character_id === selectedChar.player_character_id);
        if (updated) setSelectedChar(updated);
      }
    } catch (e: any) {
      if (e.message.includes('token') || e.message.includes('401')) {
        clearTokens();
        setAuthed(false);
      } else {
        notify(e.message, true);
      }
    }
  };

  useEffect(() => {
    if (!authed) return;
    loadAll();
    const s = io({ path: '/socket.io' });
    s.on('chat:message', (msg) => setChatMsgs((prev) => [...prev.slice(-40), msg]));
    setSocket(s);
    const interval = setInterval(() => {
      apiFetch('/api/idle/status').then(setIdleStatus).catch(() => {});
    }, 10000);
    return () => {
      clearInterval(interval);
      s.disconnect();
    };
  }, [authed]);

  useEffect(() => {
    if (!authed) return;
    if (tab === 'encyclopedia' && catalogChars.length === 0) {
      apiFetch('/api/catalog/characters').then((r) => setCatalogChars(r.items || []));
      apiFetch('/api/catalog/skills').then((r) => setCatalogSkills(r.items || []));
    }
    if (tab === 'social') {
      apiFetch('/api/rankings/POWER').then((r) => setRankings(r.items || []));
      apiFetch('/api/guilds').then(setGuildsData);
    }
    if (tab === 'mailbox') {
      apiFetch('/api/mailbox').then((r) => setMailbox(r.items || []));
    }
    if (tab === 'admin' && me?.profile?.role === 'ADMIN') {
      apiFetch('/api/admin/overview').then(setAdminData).catch(() => {});
    }
  }, [tab, authed]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const res = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(authForm),
      });
      setTokens(res.accessToken, res.refreshToken);
      setAuthed(true);
      notify(authMode === 'login' ? 'เข้าสู่ระบบสำเร็จ!' : 'สร้างตัวละครและเข้าสู่ยุทธภพสำเร็จ!');
    } catch (err: any) {
      notify(err.message, true);
    }
  };

  const filteredCodex = useMemo(() => {
    const q = codexFilter.q.trim().toLowerCase();
    return catalogChars.filter((c) => {
      if (codexFilter.el !== 'all' && c.element !== codexFilter.el) return false;
      if (codexFilter.rarity !== 'all' && c.rarity !== codexFilter.rarity) return false;
      if (q && !c.name_th.toLowerCase().includes(q) && !(c.alt_name_th || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [catalogChars, codexFilter]);

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-[#1a1324]/95 border border-amber-500/40 rounded-3xl p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5" /> TS Online Inspired Idle RPG
            </div>
            <h1 className="font-display text-3xl font-extrabold text-amber-300 tracking-wide">
              TS LEGENDS
            </h1>
            <p className="text-sm text-stone-400">
              ผจญภัยสามก๊ก สะสม 429 ขุนพล จุติ 1–2 และต่อสู้อัตโนมัติแบบเรียลไทม์
            </p>
          </div>

          <div className="flex bg-black/30 p-1 rounded-xl">
            <button
              onClick={() => setAuthMode('login')}
              className={`flex-1 py-2 rounded-lg text-sm font-bold ${authMode === 'login' ? 'bg-amber-500 text-black' : 'text-stone-400'}`}
            >
              เข้าสู่ระบบ
            </button>
            <button
              onClick={() => setAuthMode('register')}
              className={`flex-1 py-2 rounded-lg text-sm font-bold ${authMode === 'register' ? 'bg-amber-500 text-black' : 'text-stone-400'}`}
            >
              สมัครสมาชิกใหม่
            </button>
          </div>

          <form onSubmit={handleAuth} className="space-y-3">
            <input
              required
              placeholder="ชื่อผู้ใช้ (Username)"
              value={authForm.username}
              onChange={(e) => setAuthForm({ ...authForm, username: e.target.value })}
              className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-sm focus:border-amber-400 outline-none"
            />
            {authMode === 'register' && (
              <>
                <input
                  required
                  type="email"
                  placeholder="อีเมล (Email)"
                  value={authForm.email}
                  onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-sm focus:border-amber-400 outline-none"
                />
                <input
                  placeholder="ชื่อแม่ทัพในเกม (Display Name)"
                  value={authForm.displayName}
                  onChange={(e) => setAuthForm({ ...authForm, displayName: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-sm focus:border-amber-400 outline-none"
                />
              </>
            )}
            <input
              required
              type="password"
              placeholder="รหัสผ่าน (อย่างน้อย 6 ตัวอักษร)"
              value={authForm.password}
              onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
              className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-sm focus:border-amber-400 outline-none"
            />
            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 text-black font-extrabold text-sm hover:opacity-95 transition cursor-pointer"
            >
              {authMode === 'login' ? 'เข้าสู่ยุทธภพ' : 'สร้างตัวละคร & เริ่มเล่น'}
            </button>
          </form>

          {toast && (
            <div className={`p-3 rounded-xl text-xs font-bold text-center ${toast.err ? 'bg-rose-900/70 text-rose-200' : 'bg-emerald-900/70 text-emerald-200'}`}>
              {toast.msg}
            </div>
          )}
        </div>
      </div>
    );
  }

  const profile = me?.profile;
  const currency = me?.currency;
  const myChars = me?.characters || [];
  const formation = me?.formation || [];
  const inventory = me?.inventory || [];
  const quests = me?.quests || [];

  const navItems: Array<{ id: Tab; label: string; icon: any }> = [
    { id: 'dashboard', label: t.dashboard, icon: Crown },
    { id: 'world', label: t.world, icon: Compass },
    { id: 'warlords', label: t.warlords, icon: Users },
    { id: 'summon', label: t.summon, icon: Sparkles },
    { id: 'formation', label: t.formation, icon: Shield },
    { id: 'inventory', label: t.inventory, icon: Backpack },
    { id: 'quests', label: t.quests, icon: Award },
    { id: 'boss', label: t.boss, icon: Flame },
    { id: 'social', label: t.social, icon: Trophy },
    { id: 'shop', label: t.shop, icon: ShoppingBag },
    { id: 'mailbox', label: t.mailbox, icon: Mail },
    { id: 'encyclopedia', label: t.encyclopedia, icon: BookOpen },
    { id: 'settings', label: t.settings, icon: Settings },
  ];
  if (profile?.role === 'ADMIN') {
    navItems.push({ id: 'admin', label: t.admin, icon: Wrench });
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-[#150f1e]/95 backdrop-blur border-b border-amber-500/20 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="font-display text-xl font-extrabold text-amber-300">TS LEGENDS</span>
          {profile && (
            <div className="flex items-center gap-2 text-xs bg-white/5 px-3 py-1 rounded-full border border-white/10">
              <span className="font-bold text-amber-200">{profile.display_name}</span>
              <span className="text-stone-400">Lv.{profile.level}</span>
              <span className="text-emerald-300 font-bold">⚔️ {Number(profile.power_rating).toLocaleString()}</span>
            </div>
          )}
        </div>

        {currency && (
          <div className="flex items-center gap-2 text-xs font-bold">
            <span className="px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300">
              🪙 {Number(currency.gold).toLocaleString()}
            </span>
            <span className="px-2.5 py-1 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
              💎 {Number(currency.gems).toLocaleString()}
            </span>
            <span className="px-2.5 py-1 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300">
              🔮 {Number(currency.spirit_stones).toLocaleString()}
            </span>
          </div>
        )}
      </header>

      <div className="flex-1 flex flex-col md:flex-row max-w-[1440px] w-full mx-auto">
        {/* Sidebar Nav */}
        <aside className="md:w-56 shrink-0 border-b md:border-b-0 md:border-r border-white/10 p-2 flex md:flex-col gap-1 overflow-x-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs md:text-sm font-semibold whitespace-nowrap transition cursor-pointer ${
                  active
                    ? 'bg-gradient-to-r from-amber-500/25 to-rose-500/20 text-amber-300 border border-amber-500/40'
                    : 'text-stone-400 hover:bg-white/5 hover:text-stone-200'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-6 space-y-5 overflow-x-hidden">
          {toast && (
            <div className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl shadow-xl border text-sm font-bold ${toast.err ? 'bg-rose-950 border-rose-500 text-rose-200' : 'bg-emerald-950 border-emerald-500 text-emerald-200'}`}>
              {toast.msg}
            </div>
          )}

          {/* 1. DASHBOARD */}
          {tab === 'dashboard' && profile && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Idle Rewards Card */}
                <div className="lg:col-span-2 bg-[#1a1324] border border-amber-500/30 rounded-2xl p-5 flex flex-col justify-between gap-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Idle Progression</span>
                      <h2 className="text-xl font-extrabold mt-0.5">{profile.current_map_name_th}</h2>
                      <p className="text-xs text-stone-400 mt-1">
                        สะสมแล้ว {Math.floor((idleStatus?.cappedSeconds || 0) / 60)} นาที (สูงสุด {Math.floor((idleStatus?.idle_max_seconds || 43200) / 3600)} ชม.)
                      </p>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          const r = await apiFetch('/api/idle/daily-claim', { method: 'POST' });
                          notify(`รับรางวัลประจำวัน วันที่ ${r.streak_day}: +${r.gems} 💎, +${r.gold} 🪙`);
                          loadAll();
                        } catch (e: any) {
                          notify(e.message, true);
                        }
                      }}
                      className="px-3 py-1.5 rounded-xl bg-purple-600/30 border border-purple-400/40 text-purple-200 text-xs font-bold flex items-center gap-1.5 hover:bg-purple-600/50 cursor-pointer"
                    >
                      <Gift className="w-4 h-4" /> Daily Check-in
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-black/30 rounded-xl p-3 border border-white/5">
                      <div className="text-xs text-stone-400">EXP สะสม</div>
                      <div className="text-lg font-extrabold text-sky-300">+{idleStatus?.expGained ?? 0}</div>
                    </div>
                    <div className="bg-black/30 rounded-xl p-3 border border-white/5">
                      <div className="text-xs text-stone-400">Gold สะสม</div>
                      <div className="text-lg font-extrabold text-amber-300">+{idleStatus?.goldGained ?? 0}</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={async () => {
                        try {
                          const r = await apiFetch('/api/idle/claim', { method: 'POST' });
                          notify(`รับรางวัล Idle: +${r.expGained} EXP, +${r.goldGained} Gold!`);
                          loadAll();
                        } catch (e: any) {
                          notify(e.message, true);
                        }
                      }}
                      className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-sm cursor-pointer"
                    >
                      รับรางวัล Idle
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          const r = await apiFetch('/api/battle/stage', {
                            method: 'POST',
                            body: JSON.stringify({ map_id: profile.current_map_id }),
                          });
                          setBattleResult(r);
                          setTab('world');
                          loadAll();
                        } catch (e: any) {
                          notify(e.message, true);
                        }
                      }}
                      className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-sm flex items-center gap-2 cursor-pointer"
                    >
                      <Swords className="w-4 h-4" /> ท้าทายด่านปัจจุบัน
                    </button>
                  </div>
                </div>

                {/* Current Formation Summary */}
                <div className="bg-[#1a1324] border border-white/10 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-amber-300">ทีมออกศึกปัจจุบัน ({formation.length}/5)</h3>
                    <button onClick={() => setTab('formation')} className="text-xs text-sky-400 hover:underline cursor-pointer">
                      จัดทัพ →
                    </button>
                  </div>
                  <div className="space-y-2">
                    {formation.map((f: any) => {
                      const ch = myChars.find((c: any) => c.player_character_id === f.player_character_id);
                      if (!ch) return null;
                      return (
                        <div key={f.slot_index} className="flex items-center gap-3 bg-black/25 p-2 rounded-xl border border-white/5">
                          <WarlordAvatar characterId={ch.character_id} name={ch.name_th} element={ch.element} rarity={ch.rarity} evolutionStage={ch.evolution_stage} size="sm" />
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-sm truncate">{ch.name_th}</div>
                            <div className="text-[11px] text-stone-400">
                              ช่อง {f.slot_index} ({f.role_tag}) · Lv.{ch.level}
                            </div>
                          </div>
                          <div className="text-xs font-bold text-emerald-300">⚔️ {ch.combat_power}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Quick Quests */}
              <div className="bg-[#1a1324] border border-white/10 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-sm text-amber-300">ภารกิจด่วน (Quests)</h3>
                  <button onClick={() => setTab('quests')} className="text-xs text-sky-400 hover:underline cursor-pointer">ดูทั้งหมด →</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {quests.slice(0, 3).map((q: any) => (
                    <div key={q.quest_id} className="bg-black/25 p-3 rounded-xl border border-white/5 flex items-center justify-between gap-2">
                      <div>
                        <div className="font-bold text-xs">{q.title_th}</div>
                        <div className="text-[11px] text-stone-400">{q.progress} / {q.target_count}</div>
                      </div>
                      {q.status === 'COMPLETED' ? (
                        <button
                          onClick={async () => {
                            await apiFetch(`/api/quests/${q.quest_id}/claim`, { method: 'POST' });
                            notify('รับรางวัลภารกิจแล้ว!');
                            loadAll();
                          }}
                          className="px-2.5 py-1 rounded-lg bg-emerald-500 text-black text-xs font-bold cursor-pointer"
                        >
                          รับ
                        </button>
                      ) : (
                        <span className="text-[11px] text-stone-500">{q.status}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 2. WORLD MAP & BATTLE */}
          {tab === 'world' && (
            <div className="space-y-5">
              {battleResult && (
                <BattleCanvas
                  playerUnits={battleResult.playerUnits}
                  enemyUnits={battleResult.enemyUnits}
                  logs={battleResult.logs}
                  winner={battleResult.winner}
                  expGained={battleResult.exp_gained}
                  goldGained={battleResult.gold_gained}
                />
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {mapsData.maps.map((m: any) => {
                  const unlocked = m.map_id <= (profile?.highest_map_id || 1) + 1;
                  return (
                    <div key={m.map_id} className={`p-4 rounded-2xl border ${unlocked ? 'bg-[#1a1324] border-amber-500/30' : 'bg-black/30 border-white/5 opacity-60'} space-y-3`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-amber-300">{m.zone_type}</span>
                        <span className="text-xs text-stone-400">Lv.{m.min_level}+</span>
                      </div>
                      <div>
                        <h3 className="font-bold text-base">{m.name_th}</h3>
                        <p className="text-xs text-stone-400">{m.name_en}</p>
                      </div>
                      <div className="text-xs text-stone-300 space-y-1">
                        <div>EXP/นาที: <b className="text-sky-300">{m.exp_per_min}</b> · Gold/นาที: <b className="text-amber-300">{m.gold_per_min}</b></div>
                        <div>มอนสเตอร์: {m.monsters?.map((x: any) => x.name_th).join(', ')}</div>
                      </div>
                      <button
                        disabled={!unlocked}
                        onClick={async () => {
                          try {
                            const r = await apiFetch('/api/battle/stage', {
                              method: 'POST',
                              body: JSON.stringify({ map_id: m.map_id }),
                            });
                            setBattleResult(r);
                            loadAll();
                          } catch (e: any) {
                            notify(e.message, true);
                          }
                        }}
                        className="w-full py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:bg-stone-700 text-white text-xs font-bold cursor-pointer"
                      >
                        {unlocked ? '⚔️ โจมตี / ฟาร์มด่านนี้' : '🔒 ยังไม่ปลดล็อก'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. MY WARLORDS (Level Up, Rebirth, 9 Stats) */}
          {tab === 'warlords' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 content-start">
                {myChars.map((c: any) => (
                  <button
                    key={c.player_character_id}
                    onClick={() => setSelectedChar(c)}
                    className={`text-left p-3 rounded-2xl border flex items-center gap-3 transition cursor-pointer ${
                      selectedChar?.player_character_id === c.player_character_id
                        ? 'bg-amber-500/15 border-amber-400'
                        : 'bg-[#1a1324] border-white/10 hover:border-white/30'
                    }`}
                  >
                    <WarlordAvatar characterId={c.character_id} name={c.name_th} element={c.element} rarity={c.rarity} evolutionStage={c.evolution_stage} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold truncate">{c.name_th}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">{c.rarity}</span>
                      </div>
                      <div className="text-xs text-stone-400">
                        Lv.{c.level} · {c.form_name_th} · ★{c.star_level}
                      </div>
                      <div className="text-xs font-bold text-emerald-300 mt-0.5">⚔️ {c.combat_power}</div>
                    </div>
                  </button>
                ))}
              </div>

              {selectedChar && (
                <div className="bg-[#1a1324] border border-amber-500/30 rounded-2xl p-5 space-y-4 h-fit">
                  <div className="flex items-center gap-4">
                    <WarlordAvatar characterId={selectedChar.character_id} name={selectedChar.name_th} element={selectedChar.element} rarity={selectedChar.rarity} evolutionStage={selectedChar.evolution_stage} size="lg" />
                    <div>
                      <h3 className="text-xl font-extrabold">{selectedChar.name_th}</h3>
                      <p className="text-xs text-amber-300 font-bold">{selectedChar.rarity} · {selectedChar.form_name_th} (สูงสุด จุติ {selectedChar.max_evolution_stage})</p>
                      <p className="text-xs text-stone-400">Lv.{selectedChar.level} · ★{selectedChar.star_level} · Combat Power: {selectedChar.combat_power}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {[
                      ['HP', selectedChar.hp],
                      ['ATK', selectedChar.atk],
                      ['DEF', selectedChar.def],
                      ['MATK', selectedChar.matk],
                      ['MDEF', selectedChar.mdef],
                      ['SPD', selectedChar.spd],
                      ['CRIT', `${selectedChar.crit}%`],
                      ['HIT', `${selectedChar.hit}%`],
                      ['EVA', `${selectedChar.eva}%`],
                    ].map(([k, v]) => (
                      <div key={String(k)} className="bg-black/30 p-2 rounded-xl border border-white/5">
                        <div className="text-stone-400 text-[10px]">{k}</div>
                        <div className="font-bold text-sm">{v}</div>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        try {
                          const r = await apiFetch(`/api/characters/${selectedChar.player_character_id}/level-up`, { method: 'POST' });
                          notify(`อัปเลเวลเป็น Lv.${r.level} (ใช้ ${r.goldCost} Gold)`);
                          loadAll();
                        } catch (e: any) {
                          notify(e.message, true);
                        }
                      }}
                      className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs cursor-pointer"
                    >
                      อัปเลเวล ({selectedChar.level * 120} 🪙)
                    </button>
                    <button
                      disabled={selectedChar.evolution_stage >= selectedChar.max_evolution_stage}
                      onClick={async () => {
                        try {
                          const r = await apiFetch(`/api/characters/${selectedChar.player_character_id}/evolve`, { method: 'POST' });
                          notify(`จุติขั้น ${r.evolution_stage} สำเร็จ!`);
                          loadAll();
                        } catch (e: any) {
                          notify(e.message, true);
                        }
                      }}
                      className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-stone-700 text-white font-extrabold text-xs cursor-pointer"
                    >
                      {selectedChar.evolution_stage >= selectedChar.max_evolution_stage ? 'จุติสูงสุดแล้ว' : `จุติขั้น ${selectedChar.evolution_stage + 1}`}
                    </button>
                  </div>

                  {/* Skill Management */}
                  <div className="pt-3 border-t border-white/10 space-y-2">
                    <div className="text-xs font-bold text-amber-300">📜 สกิลขุนพล (Skill Management)</div>
                    {(me?.charSkills || [])
                      .filter((sk: any) => sk.player_character_id === selectedChar.player_character_id)
                      .map((sk: any) => (
                        <div key={sk.skill_id} className="bg-black/30 p-2.5 rounded-xl border border-white/5 flex items-center justify-between gap-2 text-xs">
                          <div className="min-w-0">
                            <div className="font-bold text-amber-100 truncate">
                              {sk.name_th} <span className="text-sky-300">Lv.{sk.skill_level}</span>
                            </div>
                            <div className="text-[10px] text-stone-400 truncate">
                              {sk.category_th} · SP {sk.sp_cost ?? '-'} · {sk.target_desc_th}
                            </div>
                          </div>
                          <button
                            disabled={sk.skill_level >= 20}
                            onClick={async () => {
                              try {
                                const r = await apiFetch(`/api/characters/${selectedChar.player_character_id}/skills/${sk.skill_id}/upgrade`, { method: 'POST' });
                                notify(`อัปเกรด ${sk.name_th} เป็น Lv.${r.skill_level}!`);
                                loadAll();
                              } catch (e: any) {
                                notify(e.message, true);
                              }
                            }}
                            className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:bg-stone-700 text-white font-bold text-[11px] shrink-0 cursor-pointer"
                          >
                            อัปสกิล ({sk.skill_level * 250} 🪙)
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 4. SUMMON */}
          {tab === 'summon' && (
            <div className="bg-[#1a1324] border border-amber-500/30 rounded-2xl p-6 space-y-5">
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-extrabold text-amber-300">✨ แท่นอัญเชิญขุนพลสามก๊ก (429 Warlords)</h2>
                <p className="text-xs text-stone-400">อัตราการออก: SSR 5% · SR 15% · R 35% · N 45% (คำนวณที่ Server 100%)</p>
              </div>
              <div className="flex flex-wrap justify-center gap-3">
                <button
                  onClick={async () => {
                    try {
                      const r = await apiFetch('/api/characters/summon', { method: 'POST', body: JSON.stringify({ count: 1 }) });
                      setSummonResult(r.summoned);
                      loadAll();
                    } catch (e: any) {
                      notify(e.message, true);
                    }
                  }}
                  className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-sm cursor-pointer"
                >
                  อัญเชิญ 1 ครั้ง (150 💎)
                </button>
                <button
                  onClick={async () => {
                    try {
                      const r = await apiFetch('/api/characters/summon', { method: 'POST', body: JSON.stringify({ count: 10 }) });
                      setSummonResult(r.summoned);
                      loadAll();
                    } catch (e: any) {
                      notify(e.message, true);
                    }
                  }}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 text-black font-extrabold text-sm cursor-pointer"
                >
                  อัญเชิญ 10 ครั้ง (1,350 💎)
                </button>
                <button
                  onClick={async () => {
                    try {
                      const r = await apiFetch('/api/characters/summon', { method: 'POST', body: JSON.stringify({ count: 1, useTicket: true }) });
                      setSummonResult(r.summoned);
                      loadAll();
                    } catch (e: any) {
                      notify(e.message, true);
                    }
                  }}
                  className="px-5 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-sm cursor-pointer"
                >
                  ใช้ป้ายอัญเชิญ (Ticket)
                </button>
              </div>

              {summonResult && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-4 border-t border-white/10">
                  {summonResult.map((s, idx) => (
                    <div key={idx} className="bg-black/30 p-3 rounded-xl border border-white/10 flex flex-col items-center text-center gap-2">
                      <WarlordAvatar characterId={s.character_id} name={s.name_th} element={s.element} rarity={s.rarity} />
                      <div className="font-bold text-xs">{s.name_th}</div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold">
                        {s.rarity} {s.isDuplicate ? `(ซ้ำ ★${s.newStar})` : 'NEW!'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 5. FORMATION 2x3 */}
          {tab === 'formation' && (
            <div className="bg-[#1a1324] border border-white/10 rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-extrabold text-amber-300">🛡️ จัดทัพ 2×3 (Front Row DEF+10% / Back Row ATK+10%)</h2>
                  <p className="text-xs text-stone-400">เลือกขุนพลใส่ช่อง 1–3 (แถวหน้า) หรือ 4–6 (แถวหลัง) สูงสุด 5 ตัว</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4, 5, 6].map((slot) => {
                  const cur = formation.find((f: any) => f.slot_index === slot);
                  const curChar = myChars.find((c: any) => c.player_character_id === cur?.player_character_id);
                  return (
                    <div key={slot} className="bg-black/30 p-3 rounded-xl border border-white/10 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-amber-300">
                          ช่องที่ {slot} · {slot <= 3 ? 'แถวหน้า (Front)' : 'แถวหลัง (Back)'}
                        </div>
                        <div className="text-sm font-bold mt-1">{curChar ? `${curChar.name_th} (⚔️ ${curChar.combat_power})` : '— ว่าง —'}</div>
                      </div>
                      <select
                        value={cur?.player_character_id || ''}
                        onChange={async (e) => {
                          const val = e.target.value;
                          const next = formation.filter((f: any) => f.slot_index !== slot && f.player_character_id !== val);
                          if (val) next.push({ slot_index: slot, player_character_id: val });
                          try {
                            await apiFetch('/api/formation', { method: 'PUT', body: JSON.stringify({ slots: next }) });
                            notify('อัปเดตผังทัพเรียบร้อย');
                            loadAll();
                          } catch (err: any) {
                            notify(err.message, true);
                          }
                        }}
                        className="bg-[#150f1e] border border-white/20 rounded-lg px-2 py-1.5 text-xs"
                      >
                        <option value="">-- ว่าง --</option>
                        {myChars.map((c: any) => (
                          <option key={c.player_character_id} value={c.player_character_id}>
                            {c.name_th} (Lv.{c.level})
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 6. INVENTORY & EQUIPMENT */}
          {tab === 'inventory' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {inventory.map((it: any) => (
                <div key={it.inventory_id} className="bg-[#1a1324] border border-white/10 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm">{it.name_th} {it.enhance_level > 0 ? `+${it.enhance_level}` : ''}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-white/10">x{it.quantity}</span>
                  </div>
                  <div className="text-xs text-stone-400">{it.description_th}</div>
                  {it.item_type === 'EQUIPMENT' && (
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={async () => {
                          if (!selectedChar) return notify('กรุณาเลือกขุนพลในหน้าขุนพลก่อน', true);
                          try {
                            await apiFetch('/api/equipment/equip', {
                              method: 'POST',
                              body: JSON.stringify({ player_character_id: selectedChar.player_character_id, inventory_id: it.inventory_id }),
                            });
                            notify(`สวมใส่ให้ ${selectedChar.name_th} แล้ว!`);
                            loadAll();
                          } catch (e: any) {
                            notify(e.message, true);
                          }
                        }}
                        className="flex-1 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold cursor-pointer"
                      >
                        {it.is_equipped ? 'สวมใส่อยู่' : `สวมให้ ${selectedChar?.name_th || 'ขุนพล'}`}
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            const r = await apiFetch('/api/equipment/enhance', {
                              method: 'POST',
                              body: JSON.stringify({ inventory_id: it.inventory_id }),
                            });
                            notify(`ตีบวกสำเร็จเป็น +${r.enhance_level}!`);
                            loadAll();
                          } catch (e: any) {
                            notify(e.message, true);
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg bg-amber-500 text-black text-xs font-bold cursor-pointer"
                      >
                        ตีบวก
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 7. QUESTS */}
          {tab === 'quests' && (
            <div className="space-y-3">
              {quests.map((q: any) => (
                <div key={q.quest_id} className="bg-[#1a1324] border border-white/10 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">{q.quest_type}</span>
                      <span className="font-bold text-sm">{q.title_th}</span>
                    </div>
                    <p className="text-xs text-stone-400 mt-1">{q.description_th} ({q.progress}/{q.target_count})</p>
                  </div>
                  <button
                    disabled={q.status !== 'COMPLETED'}
                    onClick={async () => {
                      await apiFetch(`/api/quests/${q.quest_id}/claim`, { method: 'POST' });
                      notify('รับรางวัลภารกิจสำเร็จ!');
                      loadAll();
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-500 disabled:bg-stone-700 text-black font-bold text-xs cursor-pointer"
                  >
                    {q.status === 'CLAIMED' ? 'รับแล้ว' : q.status === 'COMPLETED' ? 'รับรางวัล' : 'กำลังทำ'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 8. BOSS RAID */}
          {tab === 'boss' && (
            <div className="space-y-4">
              {mapsData.worldBoss && (
                <div className="bg-gradient-to-r from-rose-950/80 to-[#1a1324] border border-rose-500/40 rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <span className="text-xs font-bold text-rose-400 uppercase">World Boss Raid</span>
                    <h2 className="text-2xl font-extrabold text-amber-300">{mapsData.worldBoss.name_th}</h2>
                    <p className="text-xs text-stone-300 mt-1">
                      Lv.{mapsData.worldBoss.level} · HP {Number(mapsData.worldBoss.hp).toLocaleString()} · ATK {mapsData.worldBoss.atk}
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        const r = await apiFetch('/api/battle/stage', {
                          method: 'POST',
                          body: JSON.stringify({ battle_type: 'WORLD_BOSS', map_id: 1 }),
                        });
                        setBattleResult(r);
                        loadAll();
                      } catch (e: any) {
                        notify(e.message, true);
                      }
                    }}
                    className="px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-sm cursor-pointer"
                  >
                    🔥 ท้าทาย World Boss
                  </button>
                </div>
              )}
              {battleResult && (
                <BattleCanvas
                  playerUnits={battleResult.playerUnits}
                  enemyUnits={battleResult.enemyUnits}
                  logs={battleResult.logs}
                  winner={battleResult.winner}
                  expGained={battleResult.exp_gained}
                  goldGained={battleResult.gold_gained}
                />
              )}
            </div>
          )}

          {/* 9. SOCIAL (Rankings, Guild, Real-Time Chat) */}
          {tab === 'social' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="space-y-4">
                <div className="bg-[#1a1324] border border-white/10 rounded-2xl p-4 space-y-3">
                  <h3 className="font-bold text-sm text-amber-300">🏆 อันดับพลังรบ (Power Ranking)</h3>
                  {rankings.map((r, i) => (
                    <div key={r.entity_id} className="flex justify-between text-xs bg-black/25 p-2 rounded-lg">
                      <span>#{i + 1} {r.display_name}</span>
                      <span className="font-bold text-emerald-300">⚔️ {Number(r.score).toLocaleString()}</span>
                    </div>
                  ))}
                </div>

                <div className="bg-[#1a1324] border border-white/10 rounded-2xl p-4 space-y-3">
                  <h3 className="font-bold text-sm text-amber-300">🏰 ระบบกิลด์ (Guilds)</h3>
                  {guildsData.myGuild ? (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-sm">
                      สังกัดกิลด์: <b>[{guildsData.myGuild.tag}] {guildsData.myGuild.name}</b> ({guildsData.myGuild.my_role})
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input placeholder="ชื่อกิลด์" value={guildForm.name} onChange={(e) => setGuildForm({ ...guildForm, name: e.target.value })} className="flex-1 px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs" />
                      <input placeholder="TAG" value={guildForm.tag} onChange={(e) => setGuildForm({ ...guildForm, tag: e.target.value })} className="w-20 px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs" />
                      <button
                        onClick={async () => {
                          try {
                            await apiFetch('/api/guilds', { method: 'POST', body: JSON.stringify(guildForm) });
                            notify('สร้างกิลด์สำเร็จ!');
                            apiFetch('/api/guilds').then(setGuildsData);
                          } catch (e: any) {
                            notify(e.message, true);
                          }
                        }}
                        className="px-3 py-2 rounded-lg bg-amber-500 text-black text-xs font-bold cursor-pointer"
                      >
                        สร้างกิลด์
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Real-time WebSocket Chat */}
              <div className="bg-[#1a1324] border border-white/10 rounded-2xl p-4 flex flex-col h-96">
                <h3 className="font-bold text-sm text-amber-300 flex items-center gap-2 mb-2">
                  <MessageSquare className="w-4 h-4" /> World Chat (Real-Time WebSocket)
                </h3>
                <div className="flex-1 overflow-y-auto space-y-1.5 bg-black/30 rounded-xl p-3 text-xs">
                  {chatMsgs.length === 0 && <div className="text-stone-500">ยังไม่มีข้อความ... พิมพ์ทักทายได้เลย!</div>}
                  {chatMsgs.map((m, i) => (
                    <div key={i}>
                      <span className="text-amber-300 font-bold">[{m.sender}]: </span>
                      <span>{m.message}</span>
                    </div>
                  ))}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!chatInput.trim() || !socket) return;
                    socket.emit('chat:send', { sender: profile?.display_name || 'Player', channel: 'WORLD', message: chatInput });
                    setChatInput('');
                  }}
                  className="flex gap-2 mt-2"
                >
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="พิมพ์ข้อความ..."
                    className="flex-1 px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs"
                  />
                  <button type="submit" className="px-4 py-2 rounded-xl bg-amber-500 text-black font-bold text-xs cursor-pointer">
                    ส่ง
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* 10. SHOP */}
          {tab === 'shop' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {catalogItems.map((it: any) => {
                const price = Math.max(100, it.sell_price * 4);
                return (
                  <div key={it.item_id} className="bg-[#1a1324] border border-white/10 rounded-2xl p-4 flex flex-col justify-between gap-3">
                    <div>
                      <div className="font-bold text-sm">{it.name_th}</div>
                      <div className="text-xs text-stone-400 mt-1">{it.description_th}</div>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          await apiFetch('/api/shop/buy', { method: 'POST', body: JSON.stringify({ item_id: it.item_id, quantity: 1 }) });
                          notify(`ซื้อ ${it.name_th} สำเร็จ!`);
                          loadAll();
                        } catch (e: any) {
                          notify(e.message, true);
                        }
                      }}
                      className="w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs cursor-pointer"
                    >
                      ซื้อ ({price.toLocaleString()} 🪙)
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* 11. MAILBOX */}
          {tab === 'mailbox' && (
            <div className="space-y-3">
              {mailbox.map((m: any) => (
                <div key={m.mail_id} className="bg-[#1a1324] border border-white/10 rounded-2xl p-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-bold text-sm">{m.title_th}</div>
                    <div className="text-xs text-stone-400 mt-1">{m.body_th}</div>
                  </div>
                  <button
                    disabled={m.is_claimed}
                    onClick={async () => {
                      await apiFetch(`/api/mailbox/${m.mail_id}/claim`, { method: 'POST' });
                      notify('รับของแนบจากจดหมายแล้ว!');
                      apiFetch('/api/mailbox').then((r) => setMailbox(r.items || []));
                      loadAll();
                    }}
                    className="px-4 py-2 rounded-xl bg-amber-500 disabled:bg-stone-700 text-black font-bold text-xs cursor-pointer"
                  >
                    {m.is_claimed ? 'รับแล้ว' : 'รับของแนบ'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 12. 429 CODEX (ENCYCLOPEDIA) */}
          {tab === 'encyclopedia' && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <input
                  placeholder="ค้นหาชื่อขุนพล (429 ตัว)..."
                  value={codexFilter.q}
                  onChange={(e) => setCodexFilter({ ...codexFilter, q: e.target.value })}
                  className="flex-1 min-w-[200px] px-4 py-2 rounded-xl bg-[#1a1324] border border-white/10 text-sm"
                />
                <select
                  value={codexFilter.el}
                  onChange={(e) => setCodexFilter({ ...codexFilter, el: e.target.value })}
                  className="px-3 py-2 rounded-xl bg-[#1a1324] border border-white/10 text-sm"
                >
                  <option value="all">ทุกธาตุ</option>
                  <option value="fire">🔥 ไฟ</option>
                  <option value="wind">🍃 ลม</option>
                  <option value="water">💧 น้ำ</option>
                  <option value="earth">⛰️ ดิน</option>
                </select>
                <select
                  value={codexFilter.rarity}
                  onChange={(e) => setCodexFilter({ ...codexFilter, rarity: e.target.value })}
                  className="px-3 py-2 rounded-xl bg-[#1a1324] border border-white/10 text-sm"
                >
                  <option value="all">ทุกระดับ</option>
                  <option value="SSR">SSR</option>
                  <option value="SR">SR</option>
                  <option value="R">R</option>
                  <option value="N">N</option>
                </select>
              </div>
              <div className="text-xs text-stone-400">พบ {filteredCodex.length} ตัว (จากฐานข้อมูลจริง 429 ขุนพล / {catalogSkills.length} สกิล)</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {filteredCodex.slice(0, 80).map((c: any) => (
                  <div key={c.character_id} className="bg-[#1a1324] border border-white/10 rounded-2xl p-3 flex items-center gap-3">
                    <WarlordAvatar characterId={c.character_id} name={c.name_th} element={c.element} rarity={c.rarity} evolutionStage={c.max_evolution_stage} />
                    <div className="min-w-0">
                      <div className="font-bold text-sm truncate">{c.name_th}</div>
                      <div className="text-[11px] text-stone-400">ID #{c.character_id} · {c.rarity} · {c.evolutions?.length || 1} ร่าง</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 13. SETTINGS */}
          {tab === 'settings' && (
            <div className="bg-[#1a1324] border border-white/10 rounded-2xl p-6 max-w-md space-y-4">
              <h2 className="text-lg font-extrabold text-amber-300">⚙️ ตั้งค่า (Settings)</h2>
              <div className="flex items-center justify-between">
                <span className="text-sm">ภาษา (Language)</span>
                <div className="flex gap-2">
                  <button onClick={() => setLang('th')} className={`px-3 py-1 rounded-lg text-xs font-bold ${lang === 'th' ? 'bg-amber-500 text-black' : 'bg-white/10'}`}>ไทย</button>
                  <button onClick={() => setLang('en')} className={`px-3 py-1 rounded-lg text-xs font-bold ${lang === 'en' ? 'bg-amber-500 text-black' : 'bg-white/10'}`}>EN</button>
                </div>
              </div>
              <button
                onClick={() => {
                  clearTokens();
                  setAuthed(false);
                }}
                className="w-full py-2.5 rounded-xl bg-rose-600/80 hover:bg-rose-500 text-white font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogOut className="w-4 h-4" /> ออกจากระบบ
              </button>
            </div>
          )}

          {/* 14. ADMIN PANEL */}
          {tab === 'admin' && adminData && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {Object.entries(adminData.stats || {}).map(([k, v]) => (
                  <div key={k} className="bg-[#1a1324] border border-amber-500/30 rounded-xl p-3">
                    <div className="text-[11px] text-stone-400">{k}</div>
                    <div className="text-xl font-extrabold text-amber-300">{String(v)}</div>
                  </div>
                ))}
              </div>

              <div className="bg-[#1a1324] border border-white/10 rounded-2xl p-4 space-y-3">
                <h3 className="font-bold text-sm text-amber-300">📢 ส่งประกาศทั้งเซิร์ฟเวอร์ (Global Announcement)</h3>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    try {
                      const r = await apiFetch('/api/admin/announcement', {
                        method: 'POST',
                        body: JSON.stringify({
                          title_th: fd.get('title_th'),
                          body_th: fd.get('body_th'),
                          gems: Number(fd.get('gems') || 0),
                        }),
                      });
                      notify(`ส่งประกาศไปยังผู้เล่น ${r.sent_count} คนแล้ว!`);
                      e.currentTarget.reset();
                    } catch (err: any) {
                      notify(err.message, true);
                    }
                  }}
                  className="grid grid-cols-1 md:grid-cols-4 gap-2"
                >
                  <input name="title_th" required placeholder="หัวข้อประกาศ" className="px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs" />
                  <input name="body_th" required placeholder="เนื้อหาข้อความ" className="px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs" />
                  <input name="gems" type="number" min="0" defaultValue="100" placeholder="ของขวัญ Gems" className="px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs" />
                  <button type="submit" className="px-4 py-2 rounded-lg bg-amber-500 text-black font-bold text-xs cursor-pointer">
                    ส่งประกาศ
                  </button>
                </form>
              </div>

              <div className="bg-[#1a1324] border border-white/10 rounded-2xl p-4 space-y-3">
                <h3 className="font-bold text-sm text-amber-300">⚙️ Live Game Configurations (No Client Rebuild)</h3>
                {adminData.configs?.map((cfg: any) => (
                  <div key={cfg.config_key} className="flex flex-wrap items-center justify-between gap-2 bg-black/30 p-2.5 rounded-xl text-xs">
                    <div>
                      <b className="text-sky-300">{cfg.config_key}</b>
                      <div className="text-stone-400">{cfg.description}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="bg-black/50 px-2 py-1 rounded text-amber-200 max-w-xs truncate">{JSON.stringify(cfg.config_value)}</code>
                      {typeof cfg.config_value === 'number' && (
                        <button
                          onClick={async () => {
                            const val = window.prompt(`แก้ไขค่า ${cfg.config_key}:`, String(cfg.config_value));
                            if (val === null || isNaN(Number(val))) return;
                            await apiFetch(`/api/admin/configs/${cfg.config_key}`, {
                              method: 'PUT',
                              body: JSON.stringify({ value: Number(val) }),
                            });
                            notify(`อัปเดต ${cfg.config_key} เป็น ${val} แล้ว!`);
                            apiFetch('/api/admin/overview').then(setAdminData);
                          }}
                          className="px-2.5 py-1 rounded bg-sky-600 text-white font-bold cursor-pointer"
                        >
                          แก้ไข
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
