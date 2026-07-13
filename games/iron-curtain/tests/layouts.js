// Headless layout/biome matrix test: boots the game, then for every
// layout x biome combination (6 x 3 = 18) starts a fresh match at size 48
// via __game_test.startWith and asserts:
//   - no page errors were raised
//   - every construction yard exists (opponents + 1)
//   - flood-fill connectivity holds between all start locations
//
//   node games/iron-curtain/tests/layouts.js
//
// Same env overrides as smoke.js (PW_MODULE / PW_BROWSER).

const http = require('http');
const fs = require('fs');
const path = require('path');

const PW_MODULE = process.env.PW_MODULE ||
  '/tmp/claude-0/-home-user-gamedev-ai-agents/ecb1fb3a-7691-5507-8de2-c6c2317308fb/scratchpad/node_modules/playwright-core';
const PW_BROWSER = process.env.PW_BROWSER || '/opt/pw-browsers/chromium';
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const { chromium } = require(PW_MODULE);

const LAYOUTS = ['river', 'lakes', 'ridges', 'islands', 'open', 'maze'];
const BIOMES = ['forest', 'taiga', 'desert'];
const OPPONENTS = 3;                 // 4 starts -> strong connectivity test

const server = http.createServer((req, res) => {
  const url = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  fs.readFile(path.join(ROOT, url), (err, data) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(url)] || 'application/octet-stream' });
    res.end(data);
  });
});

(async () => {
  const port = 8800 + Math.floor(Math.random() * 90);
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

  const rows = [];
  let allOk = true;
  for (const biome of BIOMES) {
    for (const layout of LAYOUTS) {
      const before = errors.length;
      const info = await page.evaluate(
        ({ biome, layout, opp }) => window.__game_test.startWith({ opponents: opp, size: 48, biome, layout }),
        { biome, layout, opp: OPPONENTS });
      await page.waitForTimeout(500);   // let terrain build + a few sim frames run
      const res = await page.evaluate(() => ({
        conyards: window.__game_test.conyards(),
        connectivity: window.__game_test.connectivity(),
        layout: window.__game_debug().layout,
        biome: window.__game_debug().biome,
        over: window.__game_debug().over,
      }));
      const newErrors = errors.slice(before);
      const ok =
        newErrors.length === 0 &&
        res.conyards === OPPONENTS + 1 &&
        res.connectivity === true &&
        res.layout === layout && res.biome === biome && !res.over;
      if (!ok) allOk = false;
      rows.push({ biome, layout, ...res, errors: newErrors.length, ok });
      if (newErrors.length) console.log(`  errors[${biome}/${layout}]:\n   ` + newErrors.join('\n   '));
    }
  }

  // report table
  const pad = (s, n) => String(s).padEnd(n);
  console.log('\n' + pad('BIOME', 8) + pad('LAYOUT', 9) + pad('CONYARDS', 10) + pad('CONNECTED', 11) + 'RESULT');
  for (const r of rows) {
    console.log(pad(r.biome, 8) + pad(r.layout, 9) + pad(`${r.conyards}/${OPPONENTS + 1}`, 10) +
      pad(r.connectivity ? 'yes' : 'NO', 11) + (r.ok ? 'PASS' : 'FAIL'));
  }
  console.log(`\n${rows.filter((r) => r.ok).length}/${rows.length} combos passed`);
  console.log(allOk ? 'PASS' : 'FAIL');

  await browser.close();
  server.close();
  process.exit(allOk ? 0 : 1);
})().catch((e) => { console.error('FAIL (harness):', e.message); process.exit(2); });
