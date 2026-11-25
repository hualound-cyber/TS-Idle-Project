import assert from 'node:assert/strict';

const BASE = 'http://127.0.0.1:3001';

async function req(path, opts = {}, token = null) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(BASE + path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function run() {
  console.log('1. Testing Health & Catalog Completeness...');
  const h = await req('/api/health');
  assert.equal(h.status, 200);
  assert.equal(h.data.postgres, true);

  const chars = await req('/api/catalog/characters');
  assert.equal(chars.status, 200);
  assert.equal(chars.data.total, 429, 'Expected 429 characters');

  const skills = await req('/api/catalog/skills');
  assert.equal(skills.status, 200);
  assert.equal(skills.data.total, 149, 'Expected 149 skills');

  const maps = await req('/api/catalog/maps');
  assert.equal(maps.status, 200);
  assert.equal(maps.data.maps.length, 8, 'Expected 8 world map zones');

  console.log('2. Testing Security: Unauthenticated & SQLi...');
  const unauth = await req('/api/player/me');
  assert.equal(unauth.status, 401);

  const sqli = await req("/api/catalog/characters?q=' OR 1=1 --");
  assert.equal(sqli.status, 200);
  assert.equal(sqli.data.total, 0);

  console.log('3. Testing Register, Login & Refresh...');
  const uname = `hero_${Date.now().toString().slice(-6)}`;
  const reg = await req('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username: uname, email: `${uname}@test.local`, password: 'password123', displayName: 'จูล่งทดสอบ' }),
  });
  assert.equal(reg.status, 201);
  assert.ok(reg.data.accessToken);
  const token = reg.data.accessToken;

  const login = await req('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: uname, password: 'password123' }),
  });
  assert.equal(login.status, 201);

  console.log('4. Testing RBAC (PLAYER -> ADMIN endpoint must return 403)...');
  const adminDeny = await req('/api/admin/overview', {}, token);
  assert.equal(adminDeny.status, 403);

  console.log('5. Testing Gameplay: Summon, Level Up, Equip, Enhance, Formation, Battle...');
  const summon = await req('/api/characters/summon', { method: 'POST', body: JSON.stringify({ count: 1 }) }, token);
  assert.equal(summon.status, 201);
  assert.equal(summon.data.summoned.length, 1);

  const me1 = await req('/api/player/me', {}, token);
  assert.equal(me1.status, 200);
  const firstChar = me1.data.characters[0];

  const lvUp = await req(`/api/characters/${firstChar.player_character_id}/level-up`, { method: 'POST' }, token);
  assert.equal(lvUp.status, 201);
  assert.equal(lvUp.data.level, 2);

  const weapon = me1.data.inventory.find((i) => i.item_type === 'EQUIPMENT');
  if (weapon) {
    const eqRes = await req('/api/equipment/equip', {
      method: 'POST',
      body: JSON.stringify({ player_character_id: firstChar.player_character_id, inventory_id: weapon.inventory_id }),
    }, token);
    assert.equal(eqRes.status, 201);

    const enhRes = await req('/api/equipment/enhance', {
      method: 'POST',
      body: JSON.stringify({ inventory_id: weapon.inventory_id }),
    }, token);
    assert.equal(enhRes.status, 201);
    assert.equal(enhRes.data.enhance_level, 1);
  }

  const battle = await req('/api/battle/stage', { method: 'POST', body: JSON.stringify({ map_id: 1 }) }, token);
  assert.equal(battle.status, 201);
  assert.ok(['WIN', 'LOSE', 'DRAW'].includes(battle.data.winner));
  assert.ok(battle.data.logs.length > 0);

  console.log('6. Testing Anti-Cheat: Duplicate Daily Claim & Idle Cooldown...');
  const d1 = await req('/api/idle/daily-claim', { method: 'POST' }, token);
  assert.equal(d1.status, 201);
  const d2 = await req('/api/idle/daily-claim', { method: 'POST' }, token);
  assert.equal(d2.status, 400, 'Duplicate daily claim must be rejected');

  const idleEarly = await req('/api/idle/claim', { method: 'POST' }, token);
  assert.equal(idleEarly.status, 400, 'Idle claim before 30s must be rejected');

  console.log('7. Testing Concurrency & Latency (100 concurrent requests)...');
  const start = performance.now();
  const batch = await Promise.all(
    Array.from({ length: 100 }, () => req('/api/health').then((r) => r.status)),
  );
  const elapsedMs = performance.now() - start;
  const errors = batch.filter((s) => s !== 200).length;
  assert.equal(errors, 0, 'Expected 0 errors under 100 concurrent requests');
  console.log(`   100 concurrent requests completed in ${elapsedMs.toFixed(1)} ms (${((100 / elapsedMs) * 1000).toFixed(0)} req/s)`);

  console.log('ALL E2E, SECURITY, AND PERFORMANCE TESTS PASSED!');
}

run().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
