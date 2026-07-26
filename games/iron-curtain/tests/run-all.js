// Runs every headless suite in tests/ sequentially and prints a summary.
// Each suite is its own child process, so a crash or a hang in one suite
// cannot take the runner down with it.
//
//   node games/iron-curtain/tests/run-all.js            # everything
//   node games/iron-curtain/tests/run-all.js save duels # only matching suites
//
// Suites inherit the environment, so PW_MODULE / PW_BROWSER overrides still
// apply. Exit 0 = every suite passed.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// The runner itself and characterize.js are not suites: characterize is a
// baseline-fingerprint tool for the refactor, it asserts nothing about balance.
const EXCLUDE = new Set(['run-all.js', 'characterize.js']);
// Generous: duels is the long pole at ~2 min, the rest land under a minute.
const TIMEOUT_MS = Number(process.env.SUITE_TIMEOUT_MS || 600000);
// How much of a failing suite's output to echo (its own PASS/FAIL detail lines).
const TAIL_LINES = 25;

// A leading underscore marks a shared helper module rather than a suite.
const suites = fs.readdirSync(__dirname)
  .filter((f) => f.endsWith('.js') && !f.startsWith('_') && !EXCLUDE.has(f))
  .sort();

const filters = process.argv.slice(2).map((s) => s.toLowerCase());
const picked = filters.length
  ? suites.filter((f) => filters.some((q) => f.toLowerCase().includes(q)))
  : suites;

if (!picked.length) {
  console.error(`no suites matched ${JSON.stringify(filters)} (have: ${suites.join(', ')})`);
  process.exit(2);
}

const fmt = (ms) => `${(ms / 1000).toFixed(1)}s`;
const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);

function runSuite(file) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    // detached: the suite leads its own process group, so a timeout kill takes
    // its chromium down with it instead of leaving a browser burning CPU
    // through the rest of the run.
    const child = spawn(process.execPath, [path.join(__dirname, file)], {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    let out = '';
    const grab = (buf) => { out += buf.toString(); };
    child.stdout.on('data', grab);
    child.stderr.on('data', grab);

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
    }, TIMEOUT_MS);

    const done = (code, note) => {
      clearTimeout(timer);
      resolve({ file, ok: code === 0 && !timedOut, ms: Date.now() - t0, out, note });
    };
    // 'error' fires when the child never starts; 'close' waits for the pipes.
    child.on('error', (e) => done(1, e.message));
    child.on('close', (code, signal) => done(
      code === 0 ? 0 : 1,
      timedOut ? `timeout after ${fmt(TIMEOUT_MS)}` : (signal ? `killed by ${signal}` : `exit ${code}`),
    ));
  });
}

(async () => {
  console.log(`running ${picked.length} suite(s): ${picked.map((f) => f.replace('.js', '')).join(', ')}\n`);
  const results = [];
  const t0 = Date.now();

  for (const file of picked) {
    const name = file.replace('.js', '');
    process.stdout.write(`  ${pad(name, 12)} ... `);
    const r = await runSuite(file);
    results.push(r);
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${fmt(r.ms)}${r.ok || !r.note ? '' : `  (${r.note})`}`);
    if (!r.ok) {
      const tail = r.out.trimEnd().split('\n').slice(-TAIL_LINES);
      console.log(tail.map((l) => `      | ${l}`).join('\n'));
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log('\n--- summary -------------------------------------');
  for (const r of results) {
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${pad(r.file.replace('.js', ''), 12)} ${fmt(r.ms)}`);
  }
  console.log(`  ${results.length - failed.length}/${results.length} passed in ${fmt(Date.now() - t0)}`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  // The summary above is the point of this script, so a runner-level fault is
  // reported loudly rather than swallowed into a bare stack trace.
  console.error('run-all harness error:', e && e.stack ? e.stack : e);
  process.exit(2);
});
