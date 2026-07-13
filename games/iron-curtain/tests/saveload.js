// Headless save/load test: boots a match, mutates it (build + move order),
// forces an autosave, reloads the page and clicks CONTINUE OPERATION, then
// asserts the match resumed with matching state and keeps ticking cleanly.
// Exit 0 = PASS.
//
//   node games/iron-curtain/tests/saveload.js
//
// Requires playwright-core + chromium (same overrides as smoke.js).

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

  // title -> setup -> briefing -> play
  await page.click('#tb-new');
  await page.click('#su-start');
  await page.waitForTimeout(400);
  await page.click('#screen-brief');
  await page.waitForTimeout(3000);

  // mutate the running match: drop a power plant and issue a move order
  const mutated = await page.evaluate(() => {
    const t = window.__game_test;
    const cell = t.findOpen(2);
    let built = false;
    if (cell) { t.build('player', 'power', cell[0], cell[1]); built = true; }
    const movedId = t.moveAnyUnit(20, 20);
    return { built, movedId };
  });

  // let it run a touch more, then force a save and snapshot the state
  await page.waitForTimeout(2000);
  const before = await page.evaluate(() => {
    window.__game_test.save();
    return { saved: window.__game_test.hasSave(), dbg: window.__game_debug() };
  });

  // reload the page — a cold boot with only localStorage to resume from
  await page.reload({ waitUntil: 'networkidle' });
  await page.mouse.move(544, 400);
  await page.waitForTimeout(300);

  // CONTINUE must be offered (not greyed out) and must resume into play
  const continueEnabled = await page.evaluate(() =>
    !document.getElementById('tb-continue').classList.contains('disabled'));

  await page.click('#tb-continue');
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => window.__game_debug());

  // sim must keep advancing with no errors
  await page.waitForTimeout(2500);
  const later = await page.evaluate(() => window.__game_debug());

  const b = before.dbg, a = after, c = later;
  const creditDelta = Math.abs((a.playerCredits ?? 0) - (b.playerCredits ?? 0));

  const checks = {
    noErrors: errors.length === 0,
    mutated: mutated.built && mutated.movedId > 0,
    saved: before.saved === true,
    continueEnabled,
    resumedPlay: a && a.state === 'play' && !a.over,
    sameMap: a.mapSize === b.mapSize && a.biome === b.biome && a.layout === b.layout,
    buildingsMatch: Math.abs(a.buildings - b.buildings) <= 1,
    unitsClose: Math.abs(a.units - b.units) <= 3 && a.units > 0,
    creditsClose: creditDelta <= 800,
    simAdvances: c && c.state === 'play' && c.time > a.time,
  };

  const ok = Object.values(checks).every(Boolean);

  console.log('BEFORE:', JSON.stringify(b));
  console.log('AFTER :', JSON.stringify(a));
  console.log('LATER :', JSON.stringify(c));
  console.log('CHECKS:', JSON.stringify(checks));
  if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
  console.log(ok ? 'PASS' : 'FAIL');

  await browser.close();
  server.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('FAIL (harness):', e.message); process.exit(2); });
