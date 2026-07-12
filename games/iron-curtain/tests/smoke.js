// Headless smoke test: boots the game from source (no bundling), starts a
// match, runs the sim and checks for page errors. Exit 0 = PASS.
//
//   node games/iron-curtain/tests/smoke.js
//
// Requires playwright-core + chromium. Override module/browser locations:
//   PW_MODULE=/path/to/node_modules/playwright-core  PW_BROWSER=/opt/pw-browsers/chromium

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
  await page.waitForTimeout(1000);

  // pause menu round trip
  await page.keyboard.press('Escape');
  await page.click('#mb-resume');

  // let the sim breathe, then interrogate it
  await page.waitForTimeout(15000);
  const st = await page.evaluate(() => window.__game_debug && window.__game_debug());

  const ok =
    errors.length === 0 &&
    st && st.state === 'play' && !st.over &&
    st.units > 0 && st.buildings >= 2 && st.time > 10;

  console.log('STATE:', JSON.stringify(st));
  if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
  console.log(ok ? 'PASS' : 'FAIL');

  await browser.close();
  server.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('FAIL (harness):', e.message); process.exit(2); });
