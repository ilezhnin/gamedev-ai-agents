// Headless audio test: boots the game, builds the WebAudio graph, switches
// through every song and fires the sfx bank, asserting the audio engine
// raises no exceptions or console errors. Exit 0 = PASS.
//
//   node games/iron-curtain/tests/audio.js
//
// Chromium has no audio output headless, so we launch with
// --autoplay-policy=no-user-gesture-required to let the AudioContext run.
// We only assert the graph builds and scheduling fires without errors.

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
    args: [
      '--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
  // supply a real user gesture so autoplay unlocks even without the flag
  await page.mouse.click(544, 400);

  // 1) the WebAudio graph builds with every bus present
  const graph = await page.evaluate(() => {
    window.__audio_test.ensure();
    return window.__audio_test.graph();
  });

  // 2) song switching title -> battle -> victory -> defeat fires cleanly
  const seq = [];
  for (const name of ['menu', 'battle', 'victory', 'defeat', 'menu']) {
    const r = await page.evaluate((n) => window.__audio_test.play(n), name);
    seq.push(r);
    await page.waitForTimeout(400); // let the lookahead scheduler run steps
  }

  // 3) the whole sfx bank fires without throwing
  const sfxNames = [
    'rifle', 'mg', 'cannon', 'rocket', 'tesla', 'boomSmall', 'boomBig',
    'select', 'selInf', 'selVeh', 'ack', 'ackInf', 'ackVeh', 'place',
    'sell', 'tick', 'ready', 'nofunds', 'alert', 'zapdown', 'crush', 'flame',
  ];
  await page.evaluate((names) => {
    for (const n of names) window.__audio_test.sfx(n);
  }, sfxNames);

  await page.waitForTimeout(300);
  // stop leaves the scheduler idle
  const stopped = await page.evaluate(() => window.__audio_test.stop());
  // sfx volume bus is adjustable
  const sfxVol = await page.evaluate(() => window.__audio_test.setSfxVol(0.6));

  const graphOK = graph && graph.ctx && graph.master && graph.music && graph.sfx;
  const seqOK = seq.length === 5 &&
    seq[0].song === 'menu' && seq[1].song === 'battle' &&
    seq[2].song === 'victory' && seq[3].song === 'defeat' &&
    seq.every((s) => s.playing === true);

  const ok = errors.length === 0 && graphOK && seqOK && stopped === true && sfxVol === 0.6;

  console.log('GRAPH:', JSON.stringify(graph));
  console.log('SEQ:', JSON.stringify(seq.map((s) => s.song)));
  console.log('STOPPED:', stopped, 'SFXVOL:', sfxVol);
  if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
  console.log(ok ? 'PASS' : 'FAIL');

  await browser.close();
  server.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('FAIL (harness):', e.message); process.exit(2); });
