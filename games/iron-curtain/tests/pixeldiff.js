// Pixel-identity harness for art refactors. Two independent proofs:
//
//   ATLAS  — dynamic-imports src/sprites.js in the page, runs buildSprites()
//            plus makeCameo/drawTitleLogo/S.shore/S.edge, and hashes the RGBA
//            bytes of EVERY canvas produced. That covers all three biomes, all
//            five house tints and all 16 facings, i.e. art that never reaches
//            a screenshot.
//   SHOTS  — screenshots a fixed scene (fixed seed, camera parked on the
//            player base, tanks/infantry brawling, a cracked conyard, an
//            exploding power plant) and a fixed frame of the title logo, then
//            compares the PNGs pixel by pixel.
//
// Determinism comes from an init script, not from game changes: the page gets
// a synthetic rAF pump (exactly 1/60s per frame, frames only advance when the
// harness asks), a virtual performance.now/Date.now, and a seeded Math.random
// (Unit's constructor rolls its initial facing off Math.random, and facing is
// visible). So a capture is a pure function of the pump schedule.
//
//   node games/iron-curtain/tests/pixeldiff.js               # self-check: capture twice, expect 0
//   node games/iron-curtain/tests/pixeldiff.js --save before # capture a labelled baseline
//   node games/iron-curtain/tests/pixeldiff.js --compare before after
//
// Exit 0 = identical. Exit 1 = pixels or atlas hashes moved. Exit 2 = harness fault.

const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PW_MODULE = process.env.PW_MODULE ||
  '/tmp/claude-0/-home-user-gamedev-ai-agents/ecb1fb3a-7691-5507-8de2-c6c2317308fb/scratchpad/node_modules/playwright-core';
const PW_BROWSER = process.env.PW_BROWSER || '/opt/pw-browsers/chromium';
const ROOT = path.join(__dirname, '..');
const ART = path.join(__dirname, 'artifacts', 'pixeldiff');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const { chromium } = require(PW_MODULE);

// ------------------------------------------------------------ PNG decoding --
// Just enough of the spec for what chromium emits: 8-bit, non-interlaced,
// colour type 0/2/6. zlib is a node builtin, so this stays dependency-free.

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let pos = 8, w = 0, h = 0, depth = 0, ct = 0;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; ct = data[9];
      if (data[12] !== 0) throw new Error('interlaced PNG unsupported');
    } else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (depth !== 8) throw new Error(`bit depth ${depth} unsupported`);
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : ct === 0 ? 1 : 0;
  if (!bpp) throw new Error(`colour type ${ct} unsupported`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let ip = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[ip++];
    const o = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[o + x - bpp] : 0;
      const b = y > 0 ? out[o - stride + x] : 0;
      const c = (x >= bpp && y > 0) ? out[o - stride + x - bpp] : 0;
      let v = raw[ip + x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      } else if (filter !== 0) throw new Error(`bad filter ${filter}`);
      out[o + x] = v & 255;
    }
    ip += stride;
  }
  return { w, h, bpp, data: out };
}

// Differing-pixel count between two PNGs; a size mismatch is reported as a
// total mismatch rather than thrown, so the summary still prints.
function diffPng(aBuf, bBuf) {
  const a = decodePng(aBuf), b = decodePng(bBuf);
  if (a.w !== b.w || a.h !== b.h || a.bpp !== b.bpp) {
    return { diff: Math.max(a.w * a.h, b.w * b.h), total: a.w * a.h, note: `size ${a.w}x${a.h} vs ${b.w}x${b.h}` };
  }
  let diff = 0;
  for (let i = 0; i < a.data.length; i += a.bpp) {
    for (let k = 0; k < a.bpp; k++) {
      if (a.data[i + k] !== b.data[i + k]) { diff++; break; }
    }
  }
  return { diff, total: a.w * a.h, note: null };
}

// ------------------------------------------------------------- page driver --

// Installed before any page script. Replaces the frame clock with a pump the
// harness turns by hand, so every dt the game sees is exactly 1/60s and the
// number of frames between two captures is fixed.
const DETERMINISM_SHIM = `
(() => {
  const STEP = 1000 / 60;
  let vt = 0, queue = [], nextId = 1;
  window.requestAnimationFrame = (cb) => { queue.push({ id: nextId, cb }); return nextId++; };
  window.cancelAnimationFrame = (id) => { queue = queue.filter((q) => q.id !== id); };
  try {
    Object.defineProperty(performance, 'now', { value: () => vt, configurable: true });
  } catch (e) { /* locked down: dt still comes from the rAF timestamp */ }
  Date.now = () => 1700000000000 + Math.round(vt);
  window.__pd = {
    errors: [],
    pump(n) {
      for (let i = 0; i < n; i++) {
        vt += STEP;
        const due = queue; queue = [];
        for (const item of due) {
          try { item.cb(vt); } catch (e) { window.__pd.errors.push(String(e && e.message || e)); }
        }
      }
      return vt;
    },
  };
  // No audio: the sequencer runs on real setTimeout and its noise buffers eat
  // an unpredictable number of Math.random draws, which would desync the
  // seeded stream the sim draws unit facings from. ensure() catches this.
  window.AudioContext = undefined;
  window.webkitAudioContext = undefined;
  // Unit picks its initial facing off Math.random and facing is on screen.
  let s = 0x2f6e2b1;
  Math.random = () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();
`;

// Hash every canvas reachable from the public art surface. Runs in the page.
const ATLAS_PROBE = `
(async () => {
  const art = await import('/src/sprites.js');
  const hash = (c) => {
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let h = 0x811c9dc5;
    for (let i = 0; i < d.length; i++) { h ^= d[i]; h = Math.imul(h, 0x01000193); }
    return c.width + 'x' + c.height + ':' + ((h >>> 0).toString(16));
  };
  const out = {};
  const walk = (p, v) => {
    if (v == null) { out[p] = String(v); return; }
    if (typeof v === 'function') return;
    if (typeof v === 'object' && v.getContext && v.width != null) { out[p] = hash(v); return; }
    if (Array.isArray(v)) { v.forEach((x, i) => walk(p + '[' + i + ']', x)); return; }
    if (typeof v === 'object') { for (const k of Object.keys(v).sort()) walk(p + '.' + k, v[k]); return; }
    out[p] = String(v);
  };
  out['const.TILE'] = String(art.TILE);
  out['const.FACINGS'] = String(art.FACINGS);
  walk('BIOMES', art.BIOMES);
  const S = art.buildSprites();
  for (const k of Object.keys(S).sort()) walk('S.' + k, S[k]);
  // shore/edge are functions of (base, mask, biome): probe every mask/biome
  for (const biome of Object.keys(art.BIOMES).sort()) {
    const base = S.tiles[biome].ground[0];
    for (let mask = 0; mask < 16; mask++) {
      out['shore.' + biome + '.' + mask] = hash(S.shore(base, mask, biome));
      out['edge.' + biome + '.' + mask] = hash(S.edge(base, mask, biome));
    }
  }
  // cameos over a representative slice of the atlas, incl. the scale argument
  const cameoSrc = [
    ['tank', S.units.player.heavyTank.hull[0], 1],
    ['inf', S.units.player.rifle.frames[0][0], 2],
    ['conyard', S.buildings.player.conyard, 1],
    ['power', S.buildings.enemy.power, 1],
    ['recon', S.powerIcons.recon, 1],
    ['empty', null, 1],
  ];
  for (const [name, spr, scale] of cameoSrc) out['cameo.' + name] = hash(art.makeCameo(spr, name, scale));
  // the title logo at fixed times: calm, flash, post-flash, drifted clouds
  for (const t of [0, 0.03, 0.16, 1.7, 3.9]) {
    const c = document.createElement('canvas');
    c.width = 320; c.height = 180;
    art.drawTitleLogo(c, t);
    out['logo.t' + t] = hash(c);
  }
  return out;
})()
`;

function serve() {
  return http.createServer((req, res) => {
    const url = req.url === '/' ? '/index.html' : req.url.split('?')[0];
    fs.readFile(path.join(ROOT, url), (err, data) => {
      if (err) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(url)] || 'application/octet-stream' });
      res.end(data);
    });
  });
}

// Screenshot a DOM element by clip rect. Element screenshots poll rAF for
// stability, which the pump shim would deadlock, so we go through the page.
async function shotEl(page, sel) {
  const box = await page.evaluate((s) => {
    const r = document.querySelector(s).getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, sel);
  if (!box.width || !box.height) throw new Error(`element ${sel} has no box`);
  return page.screenshot({ clip: box, animations: 'disabled' });
}

// One full capture: boots a page, fingerprints the atlas, builds the fixed
// scene and screenshots it. Returns { atlas, scene, boom, logo, info }.
async function capture(browser, port) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  await page.addInitScript(DETERMINISM_SHIM);
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });

  const atlas = await page.evaluate(ATLAS_PROBE);

  // title screen: the logo redraws on rAF, so pump to a fixed frame first
  await page.evaluate(() => window.__pd.pump(12));
  const logo = await shotEl(page, '#title-logo');

  // fixed arena, AI frozen, fog lifted, camera parked on the player conyard
  const info = await page.evaluate(() => {
    const t = window.__game_test;
    const started = t.startWith({
      opponents: 1, size: 'medium', biome: 'forest', layout: 'open', seed: 1337,
    });
    t.aiPause(true);
    t.credits('player', 20000);
    t.revealAll();
    const cy = t.buildingInfo('player', 'conyard');
    if (!cy) return { started, ok: false };
    t.cam(cy.cx + 9, cy.cy + 4);
    // every structure sprite on screen, laid out on a fixed grid
    const plan = [
      ['power', 4, 0], ['refinery', 7, 0], ['barracks', 11, 0],
      ['factory', 14, 0], ['radar', 18, 0],
      ['techcenter', 4, 4], ['guard', 7, 4], ['tesla', 9, 4],
      ['silo', 11, 4], ['flametower', 13, 4], ['wall', 15, 4], ['depot', 17, 4],
    ];
    let built = 0;
    for (const [key, dx, dy] of plan) {
      if (t.build('player', key, cy.cx + dx, cy.cy + dy)) built++;
    }
    // battle damage: crack decals on the conyard, heavy smoke on the plant
    t.hurtBuilding('player', 'conyard', 0.2);
    t.hurtBuilding('player', 'power', 0.4);
    // a full roster parade south of the base so every hull/turret/soldier set
    // and both tread frames are on screen, with a live brawl for muzzle/shell
    const bx = cy.cx + 4, by = cy.cy + 8;
    const mine = [];
    const roster = ['heavyTank', 'lightTank', 'behemoth', 'artillery', 'rocketTruck',
      'apc', 'harvester', 'mcv', 'rifle', 'rocket', 'engineer'];
    roster.forEach((key, i) => {
      const u = t.spawn('player', key, bx + (i % 6) * 2, by + Math.floor(i / 6) * 2);
      if (u) mine.push({ key, id: u.id });
    });
    const foes = [];
    for (const [key, dx] of [['heavyTank', 1], ['lightTank', 4], ['rifle', 7], ['rocket', 9]]) {
      const u = t.spawn('enemy', key, bx + dx, by + 5);
      if (u) foes.push(u.id);
    }
    for (let i = 0; i < mine.length && foes.length; i++) {
      t.attackId(mine[i].id, foes[i % foes.length]);
    }
    return { started, ok: true, built, mine: mine.length, foes: foes.length, cam: [cy.cx + 9, cy.cy + 4] };
  });

  // let the brawl run: shells fly, muzzles flash, treads shimmer, smoke rises
  await page.evaluate(() => window.__pd.pump(150));
  await page.evaluate(() => window.__game_test.revealAll());
  await page.evaluate(() => window.__pd.pump(6));
  const scene = await shotEl(page, '#game-canvas');

  // blow structures up for debris, scorch decals and camera shake
  await page.evaluate(() => {
    const t = window.__game_test;
    t.killBuilding('player', 'power');
    t.killBuilding('enemy', 'power');
    window.__pd.pump(9);
  });
  const boom = await shotEl(page, '#game-canvas');

  const pageErrors = await page.evaluate(() => window.__pd.errors.slice());
  await page.close();
  return { atlas, logo, scene, boom, info, errors: errors.concat(pageErrors) };
}

function writeCapture(dir, cap) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'atlas.json'), JSON.stringify(cap.atlas, null, 1));
  fs.writeFileSync(path.join(dir, 'logo.png'), cap.logo);
  fs.writeFileSync(path.join(dir, 'scene.png'), cap.scene);
  fs.writeFileSync(path.join(dir, 'boom.png'), cap.boom);
  fs.writeFileSync(path.join(dir, 'info.json'), JSON.stringify(cap.info, null, 1));
}

function readCapture(dir) {
  return {
    atlas: JSON.parse(fs.readFileSync(path.join(dir, 'atlas.json'), 'utf8')),
    logo: fs.readFileSync(path.join(dir, 'logo.png')),
    scene: fs.readFileSync(path.join(dir, 'scene.png')),
    boom: fs.readFileSync(path.join(dir, 'boom.png')),
  };
}

// Prints the per-image differing-pixel count and the atlas hash delta.
function report(a, b, labelA, labelB) {
  let bad = 0;
  const keys = new Set([...Object.keys(a.atlas), ...Object.keys(b.atlas)]);
  const moved = [];
  for (const k of [...keys].sort()) {
    if (a.atlas[k] !== b.atlas[k]) moved.push(`${k}: ${a.atlas[k]} -> ${b.atlas[k]}`);
  }
  console.log(`ATLAS : ${keys.size} entries, ${moved.length} changed  (${labelA} -> ${labelB})`);
  for (const m of moved.slice(0, 20)) console.log('        ' + m);
  if (moved.length > 20) console.log(`        ... and ${moved.length - 20} more`);
  bad += moved.length;

  for (const name of ['logo', 'scene', 'boom']) {
    const d = diffPng(a[name], b[name]);
    console.log(`SHOT  : ${name.padEnd(6)} ${d.diff} / ${d.total} pixels differ${d.note ? '  (' + d.note + ')' : ''}`);
    bad += d.diff;
  }
  return bad;
}

(async () => {
  const argv = process.argv.slice(2);
  const flag = (n) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv.slice(i + 1) : null; };

  const cmp = flag('compare');
  if (cmp) {
    const [la, lb] = cmp;
    if (!la || !lb) { console.error('usage: --compare <labelA> <labelB>'); process.exit(2); }
    const bad = report(readCapture(path.join(ART, la)), readCapture(path.join(ART, lb)), la, lb);
    console.log(bad === 0 ? 'PASS' : 'FAIL');
    process.exit(bad === 0 ? 0 : 1);
  }

  const server = serve();
  const port = 8700 + Math.floor(Math.random() * 90);
  await new Promise((r) => server.listen(port, r));
  const browser = await chromium.launch({
    executablePath: PW_BROWSER,
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });

  const save = flag('save');
  if (save && save[0]) {
    const cap = await capture(browser, port);
    writeCapture(path.join(ART, save[0]), cap);
    console.log('INFO  :', JSON.stringify(cap.info));
    if (cap.errors.length) console.log('ERRORS:\n' + cap.errors.join('\n'));
    console.log(`SAVED : ${path.join(ART, save[0])}`);
    await browser.close(); server.close();
    process.exit(cap.errors.length ? 1 : 0);
  }

  // default: two independent captures in one run. Zero diff proves the harness
  // itself is deterministic, which is what makes a before/after run meaningful.
  const a = await capture(browser, port);
  const b = await capture(browser, port);
  console.log('INFO  :', JSON.stringify(a.info));
  const errors = a.errors.concat(b.errors);
  const bad = report(a, b, 'self-a', 'self-b');
  if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
  const ok = bad === 0 && errors.length === 0;
  // clean pass leaves no artifacts behind; a failure keeps both for inspection
  if (!ok) {
    writeCapture(path.join(ART, 'self-a'), a);
    writeCapture(path.join(ART, 'self-b'), b);
    console.log(`SHOTS : ${path.join(ART, 'self-a')} | ${path.join(ART, 'self-b')}`);
  }
  console.log(ok ? 'PASS' : 'FAIL');
  await browser.close(); server.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('FAIL (harness):', e && e.stack || e); process.exit(2); });
