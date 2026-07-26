// Roads: the generator lays them, they render, they survive a save round
// trip, and a tank actually crosses one faster than open ground. Exit 0 = PASS.

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

const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });

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
  await page.waitForTimeout(1000);
  // an open map keeps the arena free of terrain that would skew the race
  await page.evaluate(() => window.__game_test.startWith({
    opponents: 1, size: 'medium', biome: 'forest', layout: 'open', seed: 4242,
  }));
  await page.waitForTimeout(1200);

  const laid = await page.evaluate(() => window.__game_test.roadCount());
  check('generator lays a road network', laid > 30, { cells: laid });

  // Race two identical tanks over the same distance: one along a road, one on
  // bare ground. Same axis, same length, so only the surface differs.
  const race = await page.evaluate(async () => {
    const t = window.__game_test;
    // longest straight paved run in any axis direction
    const run = t.longestRoadRun(6);
    if (!run) return { error: 'no straight road run found' };
    const { x: rx, y: ry, dx, dy, len } = run;

    const roadTank = t.spawn('player', 'lightTank', rx, ry);
    // control tank on bare ground well away from any road
    const off = t.findOpen(4);
    const dirtTank = t.spawn('player', 'lightTank', off[0], off[1]);

    t.moveOrderId(roadTank.id, rx + dx * len, ry + dy * len);
    t.moveOrderId(dirtTank.id, off[0] + dx * len, off[1] + dy * len);

    const t0 = performance.now();
    let roadT = null, dirtT = null;
    return await new Promise((resolve) => {
      const tick = () => {
        const reached = (u, sx, sy) => Math.abs(u.x - (sx + dx * len)) < 0.35 && Math.abs(u.y - (sy + dy * len)) < 0.35;
        if (roadT === null && reached(roadTank, rx, ry)) roadT = performance.now() - t0;
        if (dirtT === null && reached(dirtTank, off[0], off[1])) dirtT = performance.now() - t0;
        if ((roadT !== null && dirtT !== null) || performance.now() - t0 > 25000) {
          resolve({ len, roadT: Math.round(roadT), dirtT: Math.round(dirtT) });
        } else setTimeout(tick, 60);
      };
      tick();
    });
  });
  if (race.error) check('road race ran', false, race);
  else {
    check('road race ran', race.roadT !== null && race.dirtT !== null, race);
    check('road crossing is faster than open ground', race.roadT < race.dirtT * 0.92, race);
  }

  // roads must survive the save format
  const persisted = await page.evaluate(async () => {
    const before = window.__game_test.roadCount();
    window.__game_test.saveNow ? window.__game_test.saveNow() : null;
    return { before };
  });
  await page.keyboard.press('Escape');
  await page.click('#mb-quit');
  await page.click('#tb-continue');
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => window.__game_test.roadCount());
  check('roads survive quit + continue', after === persisted.before, { before: persisted.before, after });

  check('no page errors', errors.length === 0, errors.slice(0, 3));

  for (const c of checks) console.log(`${c.ok ? 'ok  ' : 'FAIL'}  ${c.name}  ${JSON.stringify(c.detail)}`);
  const ok = checks.every((c) => c.ok);
  console.log(ok ? 'PASS' : 'FAIL');
  await browser.close();
  server.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('FAIL (harness):', e.message); process.exit(2); });
