// Headless visual test: boots a match, reveals the map, forces a battle and
// building damage through the test hooks, lets the render effects run, and
// screenshots a "before" and "after" frame to tests/artifacts/. Asserts zero
// page errors and that the sim is still in a healthy play state (PASS marker).
// Exit 0 = PASS.
//
//   node games/iron-curtain/tests/visual.js
//
// Requires playwright-core + chromium (same overrides as smoke.js).

const http = require('http');
const fs = require('fs');
const path = require('path');

const PW_MODULE = process.env.PW_MODULE ||
  '/tmp/claude-0/-home-user-gamedev-ai-agents/ecb1fb3a-7691-5507-8de2-c6c2317308fb/scratchpad/node_modules/playwright-core';
const PW_BROWSER = process.env.PW_BROWSER || '/opt/pw-browsers/chromium';
const ROOT = path.join(__dirname, '..');
const ART = path.join(__dirname, 'artifacts');
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
  fs.mkdirSync(ART, { recursive: true });
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

  // title -> setup -> briefing -> play (forest so the water/edge blends show)
  await page.click('#tb-new');
  await page.click('#su-start');
  await page.waitForTimeout(400);
  await page.click('#screen-brief');
  await page.waitForTimeout(1500);

  // reveal the map and centre on the player base for a clean baseline shot
  await page.evaluate(() => {
    const t = window.__game_test;
    t.revealAll();
    t.credits('player', 20000);
  });
  await page.waitForTimeout(600);
  const beforePath = path.join(ART, 'visual-before.png');
  await page.screenshot({ path: beforePath });

  // force life: hurt player structures (crack decals + heavy smoke), spawn a
  // brawl next to the base (tread shimmer, muzzle flashes), then blow a couple
  // of buildings up (debris + camera shake).
  const forced = await page.evaluate(() => {
    const t = window.__game_test, g = window.__game_debug();
    // knock the conyard down under 25% for the damage state + smoke
    t.hurtBuilding('player', 'conyard', 0.2);
    t.hurtBuilding('player', 'power', 0.4);
    // stand up a small skirmish near the player start
    const open = t.findOpen(3);
    let clash = 0;
    if (open) {
      const [ox, oy] = open;
      t.spawn('player', 'heavyTank', ox, oy);
      t.spawn('player', 'lightTank', ox + 1, oy);
      t.spawn('enemy', 'heavyTank', ox + 3, oy + 1);
      t.spawn('enemy', 'lightTank', ox + 4, oy + 1);
      t.attack();
      clash = 4;
    }
    return { conyard: !!t.buildingInfo('player', 'conyard'), clash, mapSize: g.mapSize };
  });

  // let the shimmer / smoke / muzzle effects animate
  await page.waitForTimeout(2500);

  // detonate a structure to exercise debris + shake, then capture the "after"
  await page.evaluate(() => {
    const t = window.__game_test;
    t.killBuilding('enemy', 'power');
    t.killBuilding('player', 'power');
  });
  await page.waitForTimeout(250);
  const afterPath = path.join(ART, 'visual-after.png');
  await page.screenshot({ path: afterPath });

  // let it keep ticking to be sure the new render systems don't blow up later
  await page.waitForTimeout(2000);
  const st = await page.evaluate(() => window.__game_debug());

  const beforeBytes = fs.existsSync(beforePath) ? fs.statSync(beforePath).size : 0;
  const afterBytes = fs.existsSync(afterPath) ? fs.statSync(afterPath).size : 0;

  const checks = {
    noErrors: errors.length === 0,
    forcedBattle: forced.clash === 4,
    shotsWritten: beforeBytes > 2000 && afterBytes > 2000,
    stillPlaying: st && st.state === 'play' && !st.over && st.time > 3,
  };
  const ok = Object.values(checks).every(Boolean);

  console.log('FORCED:', JSON.stringify(forced));
  console.log('STATE :', JSON.stringify(st));
  console.log('CHECKS:', JSON.stringify(checks));
  console.log('SHOTS :', beforePath, '|', afterPath);
  if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
  console.log(ok ? 'PASS' : 'FAIL');

  await browser.close();
  server.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('FAIL (harness):', e.message); process.exit(2); });
