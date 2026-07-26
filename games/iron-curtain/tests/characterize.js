// Characterization harness for the refactor: boots a match on a FIXED seed,
// advances the sim a fixed number of sim-seconds with the AI thinking, and
// prints a compact JSON fingerprint of the resulting world. Run it before and
// after a structural move; a diff in the STABLE block means behaviour changed.
//
//   node games/iron-curtain/tests/characterize.js
//   node games/iron-curtain/tests/characterize.js --seed 1337 --secs 120 --out fp.json
//   node games/iron-curtain/tests/characterize.js --once     # skip the repeat run
//   node games/iron-curtain/tests/characterize.js --rebaseline   # intentional change
//
// tests/artifacts/characterize-baseline.json holds the STABLE block of a known
// build. Comparing two runs of the SAME build only proves determinism — it goes
// green after any reproducible behaviour change — so the committed baseline is
// what actually pins behaviour across a refactor. Rewrite it only when a
// behaviour change is deliberate.
//
// Determinism: the map, the AI and every in-sim roll go through the seeded
// game.rng, BUT Unit's constructor takes its initial facing from Math.random()
// (src/sim/entities.js), and facing gates both firing (angleDiff > 0.3 blocks
// a shot) and vehicle departure (> 0.6 blocks a move). So two runs on the same
// seed drift: units in transit land 1-2 cells apart, and once shooting starts
// that drift decides who dies. Measured on seed 1337 / 64 'open' forest:
//
//   <= 120s sim  economy + build order reproducible run-to-run and across
//                processes; only in-transit positions wobble.
//   >= 180s sim  the first wave has made contact and kill/loss counts diverge.
//   >= 240s sim  the idle player is overrun at a different time each run, so
//                even `over` and the end time move.
//
// That is why the default horizon is 120s and why the pass/fail assertion
// covers only the STABLE block (economy, counts, power, map). Positions are
// printed separately as advisory.
//
// Exit 0 = the stable block reproduced run-to-run AND matched the stored
// baseline. Exit 1 = either moved (a real regression signal). Exit 2 = harness
// fault.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PW_MODULE = process.env.PW_MODULE ||
  '/tmp/claude-0/-home-user-gamedev-ai-agents/ecb1fb3a-7691-5507-8de2-c6c2317308fb/scratchpad/node_modules/playwright-core';
const PW_BROWSER = process.env.PW_BROWSER || '/opt/pw-browsers/chromium';
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const { chromium } = require(PW_MODULE);

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const SEED = Number(flag('seed', 1337));
const SECS = Number(flag('secs', 120));
const OUT = flag('out', null);
const ONCE = argv.includes('--once');
const REBASELINE = argv.includes('--rebaseline');
const BASELINE = path.resolve(flag('baseline', path.join(__dirname, 'artifacts', 'characterize-baseline.json')));

// Same fixed timestep the duel harness uses, so combat resolves identically
// regardless of headless frame pacing.
const DT = 0.05;
const CHUNK_SECS = 10;   // sim seconds per evaluate, keeps each call short
// Longest horizon whose stable block still reproduces (see the note above).
const STABLE_HORIZON = 120;
const SETUP = { opponents: 1, size: 64, biome: 'forest', layout: 'open' };

const server = http.createServer((req, res) => {
  const url = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  fs.readFile(path.join(ROOT, url), (err, data) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(url)] || 'application/octet-stream' });
    res.end(data);
  });
});

// Entity ids come from a module-level counter that never resets, so the second
// match in a page starts numbering where the first stopped. Rebase every id on
// the lowest id alive at t=0 to make the two runs comparable.
function collect(idBase) {
  const t = window.__game_test, d = window.__game_debug();
  // No hook enumerates the unit array, so probe ids: a long run of misses past
  // the last hit means we are off the end of this match's id block.
  const ids = [];
  let miss = 0;
  for (let id = 1; miss < 4000 && id < 200000; id++) {
    if (t.unitField(id, 'hp') != null) { ids.push(id); miss = 0; } else miss++;
  }
  const units = ids.map((id) => ({
    id: id - idBase,
    house: t.unitField(id, 'house'),
    key: t.unitField(id, 'key'),
    x: Math.round(t.unitField(id, 'x')),
    y: Math.round(t.unitField(id, 'y')),
    boarded: t.unitField(id, 'boarded') ? 1 : 0,
  }));
  const players = {};
  for (const h of ['player', 'enemy']) {
    const s = t.stats(h), p = t.power(h);
    const byKey = {};
    for (const u of units) if (u.house === h) byKey[u.key] = (byKey[u.key] || 0) + 1;
    players[h] = {
      credits: s.credits, buildings: s.buildings, army: s.army, harvesters: s.harvesters,
      built: s.built, armyBuilt: s.armyBuilt, killed: s.killed, lost: s.lost,
      powerMade: p.made, powerUsed: p.used, radar: p.radar ? 1 : 0,
      units: Object.keys(byKey).sort().reduce((a, k) => (a[k] = byKey[k], a), {}),
    };
  }
  return {
    time: d.time, over: d.over,
    map: { size: d.mapSize, biome: d.biome, layout: d.layout, oreTotal: Math.round(d.oreTotal), gemCells: d.gemCells },
    totals: { units: d.units, buildings: d.buildings, conyards: t.conyards() },
    players,
    unitList: units
      .map((u) => `${String(u.id).padStart(4, '0')}:${u.house}:${u.key}:${u.x},${u.y}${u.boarded ? ':b' : ''}`)
      .sort(),
  };
}

// One full run: fresh match on `seed`, sim advanced `SECS` seconds, fingerprint.
async function runOnce(page, seed) {
  await page.evaluate(({ setup, seed }) => {
    window.__game_test.startWith({ ...setup, seed });
    // Freeze the rAF sim loop in the same task as startWith, so not a single
    // wall-clock frame ticks the world: from here on stepSim is the only
    // thing that advances time, which is what makes the run repeatable.
    // P toggles and startWith does not clear it, so read the PAUSED overlay
    // rather than blindly pressing it (the second run would un-pause).
    if (document.getElementById('paused').style.display !== 'flex') {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyP' }));
    }
    window.__game_test.aiPause(false);
  }, { setup: SETUP, seed });

  const idBase = await page.evaluate(() => {
    const t = window.__game_test;
    for (let id = 1; id < 200000; id++) if (t.unitField(id, 'hp') != null) return id;
    return 0;
  });

  for (let done = 0; done < SECS; done += CHUNK_SECS) {
    const secs = Math.min(CHUNK_SECS, SECS - done);
    await page.evaluate(([dt, n]) => window.__game_test.stepSim(dt, n), [DT, Math.round(secs / DT)]);
  }

  const fp = await page.evaluate(collect, idBase);
  return { seed, simSecs: SECS, dt: DT, setup: SETUP, ...fp };
}

// The stable half: everything the refactor must preserve exactly. Excludes the
// per-unit position list, which drifts with the unseeded initial facing.
const stable = (fp) => ({
  time: fp.time, over: fp.over, map: fp.map, totals: fp.totals, players: fp.players,
});

// First divergent line between two JSON blobs, for a readable diff.
function firstDiff(a, b) {
  const la = JSON.stringify(a, null, 1).split('\n');
  const lb = JSON.stringify(b, null, 1).split('\n');
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) return `line ${i + 1}: ${la[i] || '(end)'}  vs  ${lb[i] || '(end)'}`;
  }
  return null;
}

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

  const a = await runOnce(page, SEED);
  const b = ONCE ? null : await runOnce(page, SEED);

  const { unitList, ...head } = a;
  console.log(`=== STABLE (seed ${SEED}, ${SECS}s sim, dt ${DT}) - diff THIS across refactors ===`);
  console.log(JSON.stringify(head));
  console.log('\n=== POSITIONS (advisory: in-transit units drift 1-2 cells) ===');
  console.log(JSON.stringify(unitList));
  if (SECS > STABLE_HORIZON || a.over) {
    console.log(`\nWARNING: past the reproducible horizon (${STABLE_HORIZON}s sim` +
      `${a.over ? ', and the match already ended' : ''}) - combat outcomes vary run to run.`);
  }

  let stableOK = true;
  if (b) {
    const full = JSON.stringify(a) === JSON.stringify(b);
    stableOK = JSON.stringify(stable(a)) === JSON.stringify(stable(b));
    const posSame = JSON.stringify(a.unitList) === JSON.stringify(b.unitList);
    console.log('\n=== DETERMINISM (same seed, two runs, one process) ===');
    console.log('  full fingerprint identical : ' + full);
    console.log('  stable subset identical    : ' + stableOK);
    console.log('  unit positions identical   : ' + posSame);
    if (!stableOK) console.log('  first stable diff: ' + firstDiff(stable(a), stable(b)));
    if (!posSame) console.log('  run B unitList: ' + JSON.stringify(b.unitList));
  }

  // The real drift guard: this build against a stored one. Only comparable when
  // the stored run used the same seed/horizon/setup, so mismatched knobs are
  // reported rather than silently "passing".
  let baseOK = true;
  const bl = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : null;
  console.log('\n=== BASELINE (' + path.relative(process.cwd(), BASELINE) + ') ===');
  if (REBASELINE) {
    fs.writeFileSync(BASELINE, JSON.stringify({
      note: bl && bl.note ? bl.note : 'Regenerate ONLY when a behaviour change is intended.',
      seed: SEED, simSecs: SECS, dt: DT, setup: SETUP, stable: stable(a),
    }, null, 2) + '\n');
    console.log('  rewritten from this run (--rebaseline)');
  } else if (!bl) {
    console.log('  none stored - run with --rebaseline to pin the current behaviour');
  } else if (bl.seed !== SEED || bl.simSecs !== SECS || bl.dt !== DT ||
             JSON.stringify(bl.setup) !== JSON.stringify(SETUP)) {
    console.log(`  SKIPPED: stored run is seed ${bl.seed}/${bl.simSecs}s/dt ${bl.dt}, this one is ` +
      `seed ${SEED}/${SECS}s/dt ${DT} - not comparable`);
  } else {
    baseOK = JSON.stringify(stable(a)) === JSON.stringify(bl.stable);
    console.log('  stable block matches baseline : ' + baseOK);
    if (!baseOK) console.log('  first baseline diff: ' + firstDiff(bl.stable, stable(a)));
  }

  if (OUT) {
    fs.writeFileSync(path.resolve(OUT), JSON.stringify({ a, b }, null, 2));
    console.log('\nwrote ' + path.resolve(OUT));
  }
  if (errors.length) console.log('\nERRORS:\n' + errors.slice(0, 6).join('\n'));
  const ok = stableOK && baseOK && !errors.length;
  console.log('\n' + (ok ? 'PASS' : 'FAIL'));

  await browser.close();
  server.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('FAIL (harness):', e.message); process.exit(2); });
