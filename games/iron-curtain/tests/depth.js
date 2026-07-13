// Headless depth-mechanics exercise: proves the round-2 gameplay systems work
// end to end on a clean open map —
//   1. VETERANCY  a unit promotes (and gains max hp) after scoring kills
//   2. APC        infantry board a transport and unload back onto the map
//   3. DEPOTS     an engineer captures a neutral supply depot (owner + income)
//   4. EMP        an EMP blast freezes an enemy tank under a move order
// Exit 0 = PASS. Same runner shape as content.js (playwright-core + chromium).
//
//   node games/iron-curtain/tests/depth.js

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

(async () => {
  const port = 8700 + Math.floor(Math.random() * 90);
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
  // a clean open map keeps the four arenas grassy and well separated
  await page.evaluate(() =>
    window.__game_test.startWith({ opponents: 1, size: 64, biome: 'forest', layout: 'open' }));
  await page.waitForTimeout(500);

  // arm every scenario at once, in four widely-spaced arenas
  const S = await page.evaluate(() => {
    const t = window.__game_test;
    const out = {};

    // 1. VETERANCY — a player rifleman guns down an unarmed enemy ore truck
    // (cost 1100). One kill clears 3x the rifle's 100 cost -> straight to rank2.
    const va = t.findOpenNear(20, 20, 2);
    const rifId = t.spawn('player', 'rifle', va[0], va[1]).id;
    const truck = t.spawn('enemy', 'harvester', va[0] + 2, va[1]);
    t.hurtUnit(truck.id, 1);
    t.attackMoveId(rifId, va[0] + 2, va[1]);
    out.rifId = rifId;
    out.rank0 = t.unitField(rifId, 'rank');
    out.maxHp0 = t.unitField(rifId, 'maxHp');

    // 2. APC — two riflemen board a transport
    const ab = t.findOpenNear(44, 20, 2);
    const apcId = t.spawn('player', 'apc', ab[0], ab[1]).id;
    const r1 = t.spawn('player', 'rifle', ab[0] + 1, ab[1]).id;
    const r2 = t.spawn('player', 'rifle', ab[0] + 1, ab[1] + 1).id;
    t.boardInto(apcId, [r1, r2]);
    out.apcId = apcId; out.r1 = r1; out.r2 = r2;

    // 3. DEPOT — an engineer seizes a neutral supply depot
    const dc = t.findOpenNear(20, 44, 2);
    t.build('neutral', 'depot', dc[0], dc[1]);
    t.spawn('player', 'engineer', dc[0] - 1, dc[1]);
    t.captureAt('player', 'engineer', dc[0], dc[1]);
    out.depotX = dc[0]; out.depotY = dc[1];

    // 4. EMP — freeze an enemy tank that's been told to drive off
    const tc = t.findOpenNear(32, 32, 1);
    t.build('player', 'techcenter', tc[0], tc[1]);   // unlocks commander powers
    const eb = t.findOpenNear(46, 46, 1);
    const etId = t.spawn('enemy', 'lightTank', eb[0], eb[1]).id;
    out.etId = etId;
    out.etX0 = t.unitField(etId, 'x'); out.etY0 = t.unitField(etId, 'y');
    t.moveOrderId(etId, eb[0] - 12, eb[1] - 12);
    out.empCast = t.castPower('emp', out.etX0, out.etY0);
    out.empCd = t.powerCd('emp');
    return out;
  });

  // first read at ~4s: EMP still active (8s window), APC boarded, depot taken
  await page.waitForTimeout(4200);
  const A = await page.evaluate((s) => {
    const t = window.__game_test;
    return {
      etX: t.unitField(s.etId, 'x'), etY: t.unitField(s.etId, 'y'),
      empT: t.unitField(s.etId, 'empT'),
      apcCargo: t.apcCargoCount(s.apcId),
      r1boarded: t.unitField(s.r1, 'boarded'),
      r2boarded: t.unitField(s.r2, 'boarded'),
      riflesOnMap: t.countUnits('player', 'rifle'),
      depotOwner: t.ownerAt(s.depotX, s.depotY),
      credits: window.__game_debug().playerCredits,
    };
  }, S);

  // now unload the APC and let veterancy + depot income settle
  await page.evaluate((s) => window.__game_test.unloadApc(s.apcId), S);
  await page.waitForTimeout(4200);
  const B = await page.evaluate((s) => {
    const t = window.__game_test;
    return {
      rank: t.unitField(s.rifId, 'rank'),
      maxHp: t.unitField(s.rifId, 'maxHp'),
      xp: t.unitField(s.rifId, 'xp'),
      apcCargo: t.apcCargoCount(s.apcId),
      r1boarded: t.unitField(s.r1, 'boarded'),
      riflesOnMap: t.countUnits('player', 'rifle'),
      depotOwner: t.ownerAt(s.depotX, s.depotY),
      credits: window.__game_debug().playerCredits,
      over: window.__game_debug().over,
    };
  }, S);

  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });

  // 1. veterancy: promoted to rank2 with a raised max hp
  add('rifle starts unranked', S.rank0 === 0 && S.maxHp0 === 50, { rank0: S.rank0, maxHp0: S.maxHp0 });
  add('rifle promoted to rank2 after a kill', B.rank === 2, { rank: B.rank, xp: B.xp });
  add('promotion raised max hp', B.maxHp > S.maxHp0, { was: S.maxHp0, now: B.maxHp });

  // 2. APC: boarded (off the grid) then unloaded (back on the grid)
  add('both riflemen boarded the APC', A.apcCargo === 2 && A.r1boarded === 1 && A.r2boarded === 1,
    { cargo: A.apcCargo, r1: A.r1boarded, r2: A.r2boarded });
  add('APC emptied on unload', B.apcCargo === 0 && B.r1boarded === 0,
    { cargo: B.apcCargo, r1: B.r1boarded });
  add('unloaded riflemen returned to the map', B.riflesOnMap === A.riflesOnMap + 2,
    { before: A.riflesOnMap, after: B.riflesOnMap });

  // 3. depot: owner flipped to the player and income trickles in
  add('depot captured by the player', A.depotOwner === 'player' && B.depotOwner === 'player',
    { early: A.depotOwner, late: B.depotOwner });
  add('captured depot ticks up credits', B.credits - A.credits >= 15,
    { c0: A.credits, c1: B.credits, delta: Math.round(B.credits - A.credits) });

  // 4. EMP: the blast fired and pinned the tank in place mid-order
  add('EMP fired and started its cooldown', S.empCast === true && S.empCd > 100,
    { cast: S.empCast, cd: S.empCd });
  add('EMP froze the enemy tank', A.empT > 0, { empT: A.empT });
  add('EMP\'d tank did not move under its order',
    Math.abs(A.etX - S.etX0) < 0.05 && Math.abs(A.etY - S.etY0) < 0.05,
    { x0: S.etX0, y0: S.etY0, x: A.etX, y: A.etY });

  add('no page errors', errors.length === 0, errors);
  add('match still running', B.over === false, { over: B.over });

  const ok = checks.every((c) => c.ok);
  for (const c of checks) console.log(`${c.ok ? 'ok  ' : 'FAIL'}  ${c.name}  ${JSON.stringify(c.detail)}`);
  if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
  console.log(ok ? 'PASS' : 'FAIL');

  await browser.close();
  server.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('FAIL (harness):', e.message); process.exit(2); });
