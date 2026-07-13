// Headless content exercise: boots a match and proves the new mid/late-game
// roster works end to end — artillery out-ranges a guard tower and kills it
// unscathed, an engineer captures an enemy power plant, the behemoth is gated
// behind the tech center, and concrete walls block pathing. Exit 0 = PASS.
//
//   node games/iron-curtain/tests/content.js
//
// Same runner shape as smoke.js (playwright-core + chromium).

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
  const port = 8900 + Math.floor(Math.random() * 90);
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
  await page.mouse.move(544, 400);
  await page.click('#tb-new');
  await page.click('#su-start');
  await page.waitForTimeout(400);
  await page.click('#screen-brief');
  await page.waitForTimeout(1200);
  // deterministic arena: sparse 'open' layout so findOpen always succeeds
  // (a rolled maze/ridges map can lack big buildable clearings — flaky)
  await page.evaluate(() => window.__game_test.startWith({
    opponents: 1, size: 'medium', biome: 'forest', layout: 'open',
  }));
  await page.waitForTimeout(1200);
  // and fail loudly if an arena still cannot be found (instead of null[0])
  await page.evaluate(() => {
    const orig = window.__game_test.findOpen;
    window.__game_test.findOpen = (r) => {
      const spot = orig(r);
      if (!spot) throw new Error(`findOpen(${r}): no clear area on this map`);
      return spot;
    };
  });

  // --- D: behemoth requires a tech center (instant, no timing) ---
  const D = await page.evaluate(() => {
    const t = window.__game_test;
    const of = t.findOpen(3);
    t.build('player', 'factory', of[0] - 1, of[1] - 1);   // producedAt satisfied
    const before = t.canProduce('player', 'unit', 'behemoth');
    const oc = t.findOpen(2);
    t.build('player', 'techcenter', oc[0], oc[1]);
    const after = t.canProduce('player', 'unit', 'behemoth');
    return { before, after };
  });

  // --- A: concrete walls block pathing (instant) ---
  const A = await page.evaluate(() => {
    const t = window.__game_test;
    const o = t.findOpen(4);
    const cx = o[0], cy = o[1];
    const before = t.path(cx - 3, cy, cx, cy);
    const ring = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
    for (const [dx, dy] of ring) t.build('player', 'wall', cx + dx, cy + dy);
    const after = t.path(cx - 3, cy, cx, cy);
    return { cx, cy, before, after };
  });

  // --- B + C: set up timed scenarios, then let the sim resolve them ---
  const setup = await page.evaluate(() => {
    const t = window.__game_test;
    // B: 10 artillery 6.5-8 cells south of an enemy guard tower. Tower gun
    // reaches ~5.5 cells, artillery's field120 reaches 8 — a clean overmatch.
    const ob = t.findOpen(4);
    const bx = ob[0], by = ob[1];
    t.build('enemy', 'guard', bx, by - 3);
    let count = 0;
    for (let ax = bx - 2; ax <= bx + 2; ax++)
      for (let ay = by + 4; ay <= by + 5; ay++) { t.spawn('player', 'artillery', ax, ay); count++; }
    const ordered = t.attackAll('player', 'artillery', 'enemy', 'guard');
    // C: engineer stands next to an enemy power plant and seizes it
    const oc = t.findOpen(3);
    const px = oc[0], py = oc[1];
    t.build('enemy', 'power', px, py);
    t.spawn('player', 'engineer', px - 1, py);
    const powerBefore = t.power('player').made;
    const cap = t.captureAt('player', 'engineer', px, py);
    return { count, ordered, powerBefore, cap, bx, by, px, py };
  });

  await page.waitForTimeout(6000);

  const V = await page.evaluate((s) => {
    const t = window.__game_test;
    return {
      towerOwner: t.ownerAt(s.bx, s.by - 3),
      arty: t.unitStats('player', 'artillery'),
      capturedOwner: t.ownerAt(s.px, s.py),
      engineerLeft: t.unitStats('player', 'engineer'),
      powerAfter: t.power('player').made,
      over: window.__game_debug().over,
    };
  }, setup);

  // --- evaluate every claim ---
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });

  add('behemoth gated by tech center', D.before === false && D.after === true, D);
  add('walls block pathing',
    !!A.before && A.before.ex === A.cx && A.before.ey === A.cy &&
    (!A.after || A.after.ex !== A.cx || A.after.ey !== A.cy), A);
  add('artillery destroyed the guard tower', setup.ordered === setup.count && V.towerOwner === null,
    { ordered: setup.ordered, count: setup.count, towerOwner: V.towerOwner });
  add('artillery took no return fire', !!V.arty && V.arty.minHp === V.arty.maxHp,
    V.arty);
  add('engineer captured enemy power plant', setup.cap === true && V.capturedOwner === 'player',
    { cap: setup.cap, owner: V.capturedOwner });
  add('engineer consumed on capture', V.engineerLeft === null, V.engineerLeft);
  add('captured plant added power', V.powerAfter >= setup.powerBefore + 90,
    { before: setup.powerBefore, after: V.powerAfter });
  add('no page errors', errors.length === 0, errors);
  add('match still running', V.over === false, { over: V.over });

  const ok = checks.every((c) => c.ok);
  for (const c of checks) console.log(`${c.ok ? 'ok  ' : 'FAIL'}  ${c.name}  ${JSON.stringify(c.detail)}`);
  if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
  console.log(ok ? 'PASS' : 'FAIL');

  await browser.close();
  server.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('FAIL (harness):', e.message); process.exit(2); });
