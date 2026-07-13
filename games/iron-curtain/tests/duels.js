// Headless balance harness. Two halves:
//
//   A. DUEL MATRIX — spawn unit A vs unit B on open ground at weapon range,
//      let them fight, record the winner and time-to-kill, and assert the
//      ROLE EXPECTATIONS every faction's rock-paper-scissors leans on (rifles
//      swarm rockets, rockets kill light armour cost-for-cost, tanks step up
//      the chain, artillery out-ranges towers, flame melts infantry, the APC
//      is a survivable taxi). Each expectation is its own labelled check with
//      a loose tolerance.
//   B. AI SANITY — one full AI-vs-AI match at 4x on a small open map, plus a
//      3-minute idle-player economy run, to guard against AI stalls (nobody's
//      economy grew / nobody fought) and prove the normal AI reaches a real
//      war economy on its own.
//
// Exit 0 = PASS. Same runner shape as depth.js (playwright-core + chromium).
//
//   node games/iron-curtain/tests/duels.js

const http = require('http');
const fs = require('fs');
const path = require('path');

const PW_MODULE = process.env.PW_MODULE ||
  '/tmp/claude-0/-home-user-gamedev-ai-agents/ecb1fb3a-7691-5507-8de2-c6c2317308fb/scratchpad/node_modules/playwright-core';
const PW_BROWSER = process.env.PW_BROWSER || '/opt/pw-browsers/chromium';
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const { chromium } = require(PW_MODULE);

const server = http.createServer((req, res) => {
  const url = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  fs.readFile(path.join(ROOT, url), (err, data) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(url)] || 'application/octet-stream' });
    res.end(data);
  });
});

// Duels advance the sim with a fixed timestep (stepSim), which makes outcomes
// deterministic and independent of the headless frame rate. DT is the combat
// tick; step(secs) rounds up to whole ticks.
const DT = 0.05;
const step = (page, simSecs) =>
  page.evaluate(([dt, n]) => window.__game_test.stepSim(dt, n), [DT, Math.ceil(simSecs / DT)]);
// AI soak/economy runs still use the live clock at 4x (they exercise rAF)
const SPD = 4;
// fixed seed for the deterministic economy run (a representative 'open' map
// with a healthy ore field — see tuning notes in the report)
const ECON_SEED = 777;

(async () => {
  const port = 8790 + Math.floor(Math.random() * 90);
  await new Promise((r) => server.listen(port, r));
  const browser = await chromium.launch({
    executablePath: PW_BROWSER,
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__game_test);

  const checks = [];
  const add = (name, ok, detail) => { checks.push({ name, ok, detail }); };

  // helper installed in the page: place N units of `key` for `house` spread
  // around an anchor cell, returning their ids. Each spawn occupies its cell so
  // the next findOpenNear picks a fresh neighbour.
  await page.evaluate(() => {
    const t = window.__game_test;
    window.__duel = {
      // place one unit at the nearest free buildable cell to (cx,cy)
      place: (house, key, cx, cy) => {
        const s = t.findOpenNear(cx, cy, 0) || [cx, cy];
        return t.spawn(house, key, s[0], s[1]).id;
      },
      group: (house, key, n, cx, cy) => {
        const ids = [];
        for (let i = 0; i < n; i++) ids.push(window.__duel.place(house, key, cx, cy));
        return ids;
      },
      // a live unit is still in the array (dead ones are filtered out each
      // tick, so unitField returns null); count only found + positive-hp ids
      aliveCount: (ids) => ids.filter((id) => {
        const hp = window.__game_test.unitField(id, 'hp');
        return hp != null && hp > 0;
      }).length,
      minHp: (ids) => Math.min(...ids.map((id) => window.__game_test.unitField(id, 'hp') ?? -1)),
    };
  });

  // ---- DUEL MATRIX -------------------------------------------------------
  // Fresh isolated sandbox: an open 64 map, AI frozen, sim at 4x. Both bases
  // sit in the corners (keeps checkEnd happy); we fight in the empty middle
  // and wipe combatants between arenas so nothing bleeds over.
  await page.evaluate(() => window.__game_test.startWith({ opponents: 1, size: 64, biome: 'forest', layout: 'open' }));
  await page.waitForTimeout(400);
  // one clean open stage, far from both bases and any neutral depot. Every
  // duel places its combatants relative to this centre.
  const ARENA = await page.evaluate(() => {
    window.__game_test.aiPause(true);
    const c = window.__game_test.clearArena(30, 11);
    window.__ARENA = { cx: c[0], cy: c[1] };
    return window.__ARENA;
  });
  const CX = ARENA.cx, CY = ARENA.cy;

  // run one duel: arm() sets it up and returns ids, then we wait simSecs, then
  // read() reports the outcome. cleanup kills every combatant id afterwards.
  async function duel(simSecs, armFn) {
    const S = await page.evaluate(armFn);
    await step(page, simSecs);
    const R = await page.evaluate((s) => {
      const d = window.__duel, t = window.__game_test;
      const rd = {};
      rd.aAlive = d.aliveCount(s.a);
      rd.bAlive = d.aliveCount(s.b);
      rd.aHp = s.a.map((id) => Math.round(t.unitField(id, 'hp') ?? -1));
      rd.bHp = s.b.map((id) => Math.round(t.unitField(id, 'hp') ?? -1));
      return rd;
    }, S);
    // wipe combatants so the next arena starts clean
    await page.evaluate((s) => {
      for (const id of [...(s.a || []), ...(s.b || [])]) window.__game_test.killUnit(id);
    }, S);
    return R;
  }

  // 1. rifle squad (3) beats 1 rocket soldier
  {
    const R = await duel(8, () => {
      const d = window.__duel, t = window.__game_test, A = window.__ARENA;
      const a = d.group('player', 'rifle', 3, A.cx - 3, A.cy);
      const b = d.group('enemy', 'rocket', 1, A.cx + 2, A.cy);
      for (const id of a) t.attackId(id, b[0]);
      for (const id of b) t.attackId(id, a[0]);
      return { a, b };
    });
    add('rifle squad (3) beats 1 rocket soldier', R.bAlive === 0 && R.aAlive >= 1,
      { rifles: R.aAlive, rockets: R.bAlive });
  }

  // 2. rocket soldiers beat a light tank cost-for-cost (2x300 vs 1x700)
  {
    const R = await duel(16, () => {
      const d = window.__duel, t = window.__game_test, A = window.__ARENA;
      const b = d.group('enemy', 'lightTank', 1, A.cx + 2, A.cy);   // spawn tank first
      const a = d.group('player', 'rocket', 2, A.cx - 3, A.cy);
      for (const id of a) t.attackId(id, b[0]);                      // rockets hold + fire
      t.attackId(b[0], a[0]);
      return { a, b };
    });
    add('2 rocket soldiers (600) beat 1 light tank (700)', R.bAlive === 0 && R.aAlive >= 1,
      { rockets: R.aAlive, tankHp: R.bHp[0], tank: R.bAlive });
  }

  // 3. light tank beats a rifle squad (gun + crush)
  {
    const R = await duel(14, () => {
      const d = window.__duel, t = window.__game_test, A = window.__ARENA;
      const a = d.group('player', 'lightTank', 1, A.cx - 3, A.cy);
      const b = d.group('enemy', 'rifle', 3, A.cx + 2, A.cy);
      t.attackMoveId(a[0], A.cx + 2, A.cy);        // drive through them (crush)
      for (const id of b) t.attackId(id, a[0]);
      return { a, b };
    });
    add('light tank beats rifle squad (3)', R.aAlive === 1 && R.bAlive === 0,
      { tankHp: R.aHp[0], rifles: R.bAlive });
  }

  // 4. heavy tank beats a light tank 1v1
  {
    const R = await duel(22, () => {
      const d = window.__duel, t = window.__game_test, A = window.__ARENA;
      const a = d.group('player', 'heavyTank', 1, A.cx - 2, A.cy);
      const b = d.group('enemy', 'lightTank', 1, A.cx + 2, A.cy);
      t.attackId(a[0], b[0]); t.attackId(b[0], a[0]);
      return { a, b };
    });
    add('heavy tank beats light tank 1v1', R.aAlive === 1 && R.bAlive === 0,
      { heavyHp: R.aHp[0], light: R.bAlive });
  }

  // 5. behemoth beats a heavy tank 1v1
  {
    const R = await duel(26, () => {
      const d = window.__duel, t = window.__game_test, A = window.__ARENA;
      const a = d.group('player', 'behemoth', 1, A.cx - 2, A.cy);
      const b = d.group('enemy', 'heavyTank', 1, A.cx + 2, A.cy);
      t.attackId(a[0], b[0]); t.attackId(b[0], a[0]);
      return { a, b };
    });
    add('behemoth beats heavy tank 1v1', R.aAlive === 1 && R.bAlive === 0,
      { behemothHp: R.aHp[0], heavy: R.bAlive });
  }

  // 6. artillery kills a guard tower without taking return fire
  {
    const S = await page.evaluate(() => {
      const t = window.__game_test, A = window.__ARENA;
      const tx = A.cx + 4, ty = A.cy;
      t.build('enemy', 'guard', tx, ty);
      const a = window.__duel.place('player', 'artillery', tx - 7, ty);  // out of tower range 5
      t.attackBuildingAt(a, tx, ty);
      return { a, tx, ty, hp0: t.unitField(a, 'hp') };
    });
    await step(page, 40);
    const R = await page.evaluate((s) => {
      const t = window.__game_test;
      return { towerAlive: t.buildingAliveAt(s.tx, s.ty), artHp: Math.round(t.unitField(s.a, 'hp') ?? -1) };
    }, S);
    add('artillery destroys guard tower', R.towerAlive === false, { towerAlive: R.towerAlive });
    add('artillery took no return fire (full hp)', R.artHp >= S.hp0 - 0.5,
      { hp0: Math.round(S.hp0), hp1: R.artHp });
    await page.evaluate((s) => { window.__game_test.killUnit(s.a); window.__game_test.removeBuildingAt(s.tx, s.ty); }, S);
  }

  // 7. flame tower kills 3 riflemen before dying
  {
    const S = await page.evaluate(() => {
      const t = window.__game_test, A = window.__ARENA;
      const fx = A.cx, fy = A.cy;
      t.build('enemy', 'flametower', fx, fy);
      const b = [];
      for (const dy of [-1, 0, 1]) {
        const s = t.findOpenNear(fx - 2, fy + dy, 0);
        b.push(t.spawn('player', 'rifle', s[0], s[1]).id);
      }
      for (const id of b) t.attackBuildingAt(id, fx, fy);
      return { fx, fy, b };
    });
    await step(page, 12);
    const R = await page.evaluate((s) => {
      const d = window.__duel, t = window.__game_test;
      return { rifles: d.aliveCount(s.b), towerAlive: t.buildingAliveAt(s.fx, s.fy) };
    }, S);
    add('flame tower kills 3 riflemen', R.rifles === 0, { riflesLeft: R.rifles });
    add('flame tower survives the 3 riflemen', R.towerAlive === true, { towerAlive: R.towerAlive });
    await page.evaluate((s) => { for (const id of s.b) window.__game_test.killUnit(id); window.__game_test.removeBuildingAt(s.fx, s.fy); }, S);
  }

  // 8. APC survives one rifleman long enough to cross 15 cells (taxi role)
  {
    const S = await page.evaluate(() => {
      const t = window.__game_test, A = window.__ARENA;
      const s0 = t.findOpenNear(A.cx - 8, A.cy, 0);
      const apc = t.spawn('player', 'apc', s0[0], s0[1]).id;
      const rs = t.findOpenNear(s0[0], s0[1] + 2, 0);
      const rif = t.spawn('enemy', 'rifle', rs[0], rs[1]).id;
      t.attackId(rif, apc);
      t.moveOrderId(apc, s0[0] + 15, s0[1]);
      return { apc, rif, x0: t.unitField(apc, 'x') };
    });
    await step(page, 12);
    const R = await page.evaluate((s) => {
      const t = window.__game_test;
      return {
        apcAlive: !t.unitField(s.apc, 'dead'),
        apcHp: Math.round(t.unitField(s.apc, 'hp') ?? -1),
        dx: (t.unitField(s.apc, 'x') ?? s.x0) - s.x0,
      };
    }, S);
    add('APC survives a rifleman while crossing 15 cells',
      R.apcAlive && R.dx >= 13, { alive: R.apcAlive, hp: R.apcHp, crossed: Math.round(R.dx) });
    await page.evaluate((s) => { window.__game_test.killUnit(s.apc); window.__game_test.killUnit(s.rif); }, S);
  }

  // fast tuning path: MATRIX_ONLY=1 skips the ~2min AI soak/economy runs
  if (process.env.MATRIX_ONLY) {
    add('no page errors', errors.length === 0, errors.slice(0, 6));
    const okm = checks.every((c) => c.ok);
    for (const c of checks) console.log(`${c.ok ? 'ok  ' : 'FAIL'}  ${c.name}  ${JSON.stringify(c.detail)}`);
    console.log(okm ? 'PASS' : 'FAIL');
    await browser.close(); server.close(); process.exit(okm ? 0 : 1);
  }

  // ---- AI SANITY: full AI-vs-AI soak -------------------------------------
  // fresh match, AI live, 5 minutes of sim at 4x on an open 48. Assert some
  // economy grew and real combat happened (guards against AI stalls).
  await page.evaluate(() => window.__game_test.startWith({ opponents: 1, size: 48, biome: 'forest', layout: 'open' }));
  await page.waitForTimeout(400);
  const soak0 = await page.evaluate((spd) => {
    window.__game_test.aiPause(false);
    window.__game_test.setSpeed(spd);
    return { enemy: window.__game_test.stats('enemy'), player: window.__game_test.stats('player') };
  }, SPD);
  // 5 min sim / 4x ~= 75s real; poll a couple of times so a stall shows early
  await page.waitForTimeout(78000);
  const soak1 = await page.evaluate(() => ({
    enemy: window.__game_test.stats('enemy'),
    player: window.__game_test.stats('player'),
    over: window.__game_debug().over,
    time: window.__game_debug().time,
  }));
  const econGrew = (soak1.enemy.buildings > soak0.enemy.buildings) ||
                   (soak1.player.buildings > soak0.player.buildings);
  const kills = soak1.enemy.killed + soak1.player.killed;
  add('AI soak: economy grew (buildings added)', econGrew,
    { e0: soak0.enemy.buildings, e1: soak1.enemy.buildings, p0: soak0.player.buildings, p1: soak1.player.buildings });
  add('AI soak: combat occurred (kills > 0)', kills > 0,
    { enemyKilled: soak1.enemy.killed, playerKilled: soak1.player.killed, simTime: soak1.time });

  // ---- AI SANITY: 3-minute idle-player economy run -----------------------
  // The human does nothing; the normal AI must reach a war economy: a factory,
  // ore trucks and a real army. Run on a fixed representative seed (so it's
  // deterministic — 'open' seeds vary a lot in ore richness) with the
  // personality pinned to 'balanced' (the middle). We score army by units
  // PRODUCED, not the instantaneous count, since the AI keeps throwing waves at
  // the idle player and taking attrition. The soak above already stress-tests
  // random seeds/personalities against a hard stall.
  await page.evaluate(() => window.__game_test.startWith(
    { opponents: 1, size: 64, biome: 'forest', layout: 'open', seed: ECON_SEED }));
  await page.waitForTimeout(400);
  await page.evaluate((spd) => {
    window.__game_test.setPersonality('enemy', 'balanced');
    window.__game_test.aiPause(false);
    window.__game_test.setSpeed(spd);
  }, SPD);
  await page.waitForTimeout(50000);   // ~3.3 min sim / 4x, a little margin
  const econ = await page.evaluate(() => window.__game_test.stats('enemy'));
  add('economy: normal AI built a war factory', econ.hasFactory, { buildings: econ.buildings, hasFactory: econ.hasFactory });
  add('economy: normal AI kept its ore trucks (>=2)', econ.harvesters >= 2, { harvesters: econ.harvesters });
  add('economy: normal AI produced >= 8 army units', econ.armyBuilt >= 8,
    { armyBuilt: econ.armyBuilt, army: econ.army, credits: econ.credits });

  // ---- AI SANITY: uses the new toys (APC transport + hard-AI retreat) -----
  await runAiMechanics(page, add);

  add('no page errors', errors.length === 0, errors.slice(0, 6));

  const ok = checks.every((c) => c.ok);
  for (const c of checks) console.log(`${c.ok ? 'ok  ' : 'FAIL'}  ${c.name}  ${JSON.stringify(c.detail)}`);
  if (errors.length) console.log('ERRORS:\n' + errors.slice(0, 6).join('\n'));
  console.log(ok ? 'PASS' : 'FAIL');

  await browser.close();
  server.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('FAIL (harness):', e.message); process.exit(2); });

// Proves the AI reaches for the round-2 toys: it ferries infantry in an APC,
// and (on hard) pulls a badly-wounded vehicle out of a losing fight. Both are
// staged deterministically — spawn the pieces, let the AI think, read the
// telemetry counters it bumps when it uses each mechanic.
async function runAiMechanics(page, add) {
  // --- APC transport: the AI fills a spare carrier with nearby riflemen ---
  const L = await page.evaluate(() => {
    const t = window.__game_test;
    t.startWith({ opponents: 1, size: 64, biome: 'forest', layout: 'open', seed: 4242 });
    t.aiPause(true);                              // stage the scene before the AI acts
    const c = t.buildingInfo('enemy', 'conyard');
    const s0 = t.findOpenNear(c.cx, c.cy + 5, 0);
    const apc = t.spawn('enemy', 'apc', s0[0], s0[1]).id;   // a spare, empty carrier
    for (let i = 0; i < 4; i++) {                 // a squad milling by the base
      const s = t.findOpenNear(c.cx + 1, c.cy + 6, 0);
      t.spawn('enemy', 'rifle', s[0], s[1]);
    }
    return { apc };
  });
  await page.evaluate(() => window.__game_test.aiPause(false));
  await step(page, 30);                           // 30s of AI thinking (deterministic)
  const Lr = await page.evaluate((s) => {
    const t = window.__game_test;
    const info = t.aiApcInfo().find((a) => a.house === 'enemy') || {};
    return { everLoaded: info.apcEverLoaded, cargo: t.apcCargoCount(s.apc) };
  }, L);
  add('AI mechanics: enemy loaded infantry into an APC',
    Lr.everLoaded === true, { everLoaded: Lr.everLoaded, cargo: Lr.cargo });

  // --- Hard-AI retreat: a sub-25% hp tank, locally outnumbered, breaks off ---
  const R = await page.evaluate(() => {
    const t = window.__game_test;
    t.startWith({ opponents: 1, size: 64, biome: 'forest', layout: 'open', seed: 4242 });
    t.aiPause(true);
    t.setAiLevel('enemy', 'hard');
    const c = t.buildingInfo('enemy', 'conyard');
    const s0 = t.findOpenNear(c.cx + 14, c.cy + 12, 0);
    const tank = t.spawn('enemy', 'lightTank', s0[0], s0[1]).id;
    t.hurtUnit(tank, 40);                          // < 25% of 230 hp
    for (const d of [[6, 0], [-6, 0], [0, 6]]) {   // three player units within 8 cells
      const s = t.findOpenNear(s0[0] + d[0], s0[1] + d[1], 0);
      t.spawn('player', 'rifle', s[0], s[1]);
    }
    return { tank };
  });
  await page.evaluate(() => window.__game_test.aiPause(false));
  await step(page, 4);                             // a few hard-AI thinks (0.7s each)
  const Rr = await page.evaluate((s) => {
    const t = window.__game_test;
    const info = t.aiApcInfo().find((a) => a.house === 'enemy') || {};
    return { retreated: info.retreated || 0, tankAlive: t.unitField(s.tank, 'hp') != null };
  }, R);
  add('AI mechanics: hard AI retreated a <25% hp vehicle',
    Rr.retreated > 0, { retreated: Rr.retreated, tankAlive: Rr.tankAlive });
}
