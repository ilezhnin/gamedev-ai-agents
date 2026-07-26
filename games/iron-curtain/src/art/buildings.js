// Building art: every structure sprite, drawn straight top-down on a
// footprint of w×h tiles. A subtle drop shadow + hard outline + house-colour
// trim keep them readable at play zoom. Also here: the two overlays that ride
// on top of a structure — the rotating radar dish and the battle-damage
// cracks.

import {
  PAL, makeCanvas, px, drawMap, dither, bevelRect, outlineRect, makeRng,
} from '../palette.js';
import { TILE, HN } from './consts.js';

function bldBase(g, W, H, opts = {}) {
  const m = 2;
  g.fillStyle = PAL.shadow;
  g.fillRect(m + 2, m + 3, W - m * 2, H - m * 2);
  bevelRect(g, m, m, W - m * 2, H - m * 2,
    opts.mid || PAL.wall2, opts.light || PAL.wallHi, opts.dark || PAL.wall3);
  outlineRect(g, m - 1, m - 1, W - m * 2 + 2, H - m * 2 + 2, PAL.ink);
}

function conYardSprite() {
  const W = TILE * 3, H = TILE * 3;
  const [c, g] = makeCanvas(W, H);
  bldBase(g, W, H, { mid: PAL.concrete, light: PAL.wallHi, dark: PAL.concreteD });
  // central crane pad
  bevelRect(g, 14, 14, W - 28, H - 28, PAL.roof2, PAL.roofHi, PAL.roof3);
  outlineRect(g, 13, 13, W - 26, H - 26, PAL.ink);
  dither(g, 18, 18, W - 36, 8, PAL.roof2, PAL.roof1);
  // crane arm
  px(g, W / 2 - 2, 18, PAL.steel4, 4, H - 44);
  px(g, W / 2 - 10, 24, PAL.steel1, 20, 3);
  px(g, W / 2 - 10, 24, PAL.steelHi, 20, 1);
  px(g, W / 2 + 8, 27, PAL.gun2, 2, 8);
  // corner service bays
  for (const [bx, by] of [[6, 6], [W - 20, 6], [6, H - 20], [W - 20, H - 20]]) {
    bevelRect(g, bx, by, 14, 14, PAL.wall1, PAL.wallHi, PAL.wall3);
    outlineRect(g, bx, by, 14, 14, PAL.ink);
    px(g, bx + 3, by + 3, HN[2], 8, 2);
    px(g, bx + 3, by + 9, PAL.roof3, 8, 3);
  }
  // hazard chevrons
  for (let i = 0; i < 6; i++) {
    px(g, 20 + i * 6, H - 12, i % 2 ? PAL.ore1 : PAL.ink, 4, 3);
  }
  return c;
}

function powerPlantSprite() {
  const W = TILE * 2, H = TILE * 2;
  const [c, g] = makeCanvas(W, H);
  bldBase(g, W, H, { mid: PAL.wall2 });
  // twin stacks
  for (const sx of [12, W - 22]) {
    g.fillStyle = PAL.ink; g.beginPath(); g.arc(sx + 5, 17, 8, 0, 7); g.fill();
    g.fillStyle = PAL.steel3; g.beginPath(); g.arc(sx + 5, 17, 7, 0, 7); g.fill();
    g.fillStyle = PAL.steel2; g.beginPath(); g.arc(sx + 5, 17, 5, 0, 7); g.fill();
    g.fillStyle = PAL.gun2; g.beginPath(); g.arc(sx + 5, 17, 2, 0, 7); g.fill();
    px(g, sx + 1, 12, PAL.steelHi, 3, 1);
  }
  // generator hall
  bevelRect(g, 8, 28, W - 16, 14, PAL.roof2, PAL.roofHi, PAL.roof3);
  outlineRect(g, 8, 28, W - 16, 14, PAL.ink);
  px(g, 12, 32, HN[2], W - 24, 2);
  px(g, 12, 34, PAL.ink, W - 24, 1);                 // crisp trim underline
  dither(g, 12, 36, W - 24, 4, PAL.roof2, PAL.roof3); // shaded metal roof face
  px(g, 12, 37, PAL.ore1, 3, 3); px(g, W - 15, 37, PAL.ore1, 3, 3);
  return c;
}

function refinerySprite() {
  const W = TILE * 3, H = TILE * 3;
  const [c, g] = makeCanvas(W, H);
  bldBase(g, W, H, { mid: PAL.wall3 });
  // big silo drum
  g.fillStyle = PAL.ink; g.beginPath(); g.arc(22, 24, 15, 0, 7); g.fill();
  g.fillStyle = PAL.steel2; g.beginPath(); g.arc(22, 24, 14, 0, 7); g.fill();
  g.fillStyle = PAL.steel1; g.beginPath(); g.arc(19, 21, 9, 0, 7); g.fill();
  g.fillStyle = PAL.ore2; g.beginPath(); g.arc(22, 24, 5, 0, 7); g.fill();
  px(g, 14, 13, PAL.steelHi, 5, 2);
  // processing block
  bevelRect(g, 42, 8, 24, 30, PAL.roof2, PAL.roofHi, PAL.roof3);
  outlineRect(g, 42, 8, 24, 30, PAL.ink);
  px(g, 46, 12, HN[2], 16, 3);
  dither(g, 46, 18, 16, 6, PAL.roof1, PAL.roof3);
  px(g, 46, 28, PAL.ore1, 4, 4); px(g, 54, 28, PAL.ore3, 4, 4);
  // unload dock (bottom-centre tile is the harvester slot)
  bevelRect(g, 26, H - 26, 22, 20, PAL.concreteD, PAL.concrete, PAL.gun2);
  outlineRect(g, 26, H - 26, 22, 20, PAL.ink);
  for (let i = 0; i < 4; i++) px(g, 28 + i * 5, H - 22, i % 2 ? PAL.ore1 : PAL.ink, 4, 2);
  px(g, 30, H - 16, PAL.ore2, 14, 6);
  px(g, 32, H - 14, PAL.ore3, 4, 2);
  // pipe from dock to drum
  px(g, 24, 38, PAL.steel4, 4, 12);
  return c;
}

function barracksSprite() {
  const W = TILE * 2, H = TILE * 2;
  const [c, g] = makeCanvas(W, H);
  bldBase(g, W, H, { mid: PAL.wall1 });
  // pitched roof reading: two shaded halves with an ordered-dither mid-band
  // so the ridge falls off across four tones instead of a hard two-tone seam
  px(g, 6, 6, PAL.roof1, W - 12, (H - 12) / 2);
  px(g, 6, H / 2, PAL.roof3, W - 12, (H - 12) / 2);
  dither(g, 6, H / 2 - 3, W - 12, 2, PAL.roof1, PAL.roof2);
  dither(g, 6, H / 2 + 1, W - 12, 2, PAL.roof2, PAL.roof3);
  px(g, 6, H / 2 - 1, PAL.roofHi, W - 12, 1);
  outlineRect(g, 5, 5, W - 10, H - 10, PAL.ink);
  // house-colour banner + door
  px(g, 10, 10, HN[2], 10, 6); px(g, 10, 10, HN[3], 10, 2);
  px(g, W / 2 - 4, H - 12, PAL.gun2, 8, 7);
  px(g, W / 2 - 4, H - 12, PAL.steel1, 8, 1);
  // windows
  for (let i = 0; i < 3; i++) px(g, 12 + i * 9, H / 2 + 5, PAL.zap, 4, 3);
  return c;
}

function factorySprite() {
  const W = TILE * 3, H = TILE * 2;
  const [c, g] = makeCanvas(W, H);
  bldBase(g, W, H, { mid: PAL.wall2 });
  // sawtooth roof
  for (let i = 0; i < 4; i++) {
    const rx = 8 + i * 15;
    px(g, rx, 7, PAL.roof1, 13, 12);
    px(g, rx, 7, PAL.roofHi, 13, 2);
    px(g, rx, 16, PAL.roof3, 13, 3);
    outlineRect(g, rx, 7, 13, 12, PAL.ink);
  }
  // big rolling door (exit at bottom middle)
  bevelRect(g, W / 2 - 12, H - 22, 24, 16, PAL.steel3, PAL.steel1, PAL.steel4);
  outlineRect(g, W / 2 - 12, H - 22, 24, 16, PAL.ink);
  for (let i = 1; i < 4; i++) px(g, W / 2 - 10, H - 22 + i * 4, PAL.steel4, 20, 1);
  // hazard strip + trim
  for (let i = 0; i < 5; i++) px(g, W / 2 - 12 + i * 5, H - 5, i % 2 ? PAL.ore1 : PAL.ink, 4, 2);
  px(g, 8, H - 18, HN[2], 8, 10);
  px(g, W - 16, H - 18, HN[1], 8, 10);
  return c;
}

function radarSprite() {
  const W = TILE * 2, H = TILE * 2;
  const [c, g] = makeCanvas(W, H);
  bldBase(g, W, H, { mid: PAL.wall3 });
  bevelRect(g, 8, H - 18, W - 16, 12, PAL.roof2, PAL.roofHi, PAL.roof3);
  outlineRect(g, 8, H - 18, W - 16, 12, PAL.ink);
  px(g, 12, H - 15, HN[2], 6, 3);
  // dish mount pedestal — the spinning dish itself is a separate overlay
  // (radarDishFrames) so it can rotate without a per-house canvas rebuild
  g.fillStyle = PAL.ink; g.beginPath(); g.arc(W / 2, 18, 5, 0, 7); g.fill();
  g.fillStyle = PAL.steel3; g.beginPath(); g.arc(W / 2, 18, 4, 0, 7); g.fill();
  px(g, W / 2 - 1, 14, PAL.steel4, 2, 5);
  return c;
}

// The radar dish as a set of 4 overlay frames. A bright feed horn orbits the
// dish and the reflector rocks slightly, reading as a slow radar sweep when
// the frames cycle ~1s. House-independent (steel), sized to the 2x2 footprint.
export function radarDishFrames() {
  const W = TILE * 2;
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const [c, g] = makeCanvas(W, W);
    const ang = f * (Math.PI * 2 / 4);
    g.save();
    g.translate(W / 2, 18);
    g.rotate(Math.sin(ang) * 0.18);   // gentle rock, not a full tumble
    g.fillStyle = PAL.ink; g.beginPath(); g.ellipse(0, 0, 13, 10, -0.5, 0, 7); g.fill();
    g.fillStyle = PAL.steel1; g.beginPath(); g.ellipse(0, 0, 12, 9, -0.5, 0, 7); g.fill();
    g.fillStyle = PAL.steel2; g.beginPath(); g.ellipse(2, 1, 8, 6, -0.5, 0, 7); g.fill();
    g.restore();
    px(g, W / 2 - 8, 11, PAL.steelHi, 4, 1);
    // orbiting feed horn: the visible "sweep" cue
    const sx = W / 2 + Math.cos(ang) * 6, sy = 18 + Math.sin(ang) * 4;
    px(g, (sx | 0) - 1, (sy | 0) - 1, PAL.ink, 3, 3);
    px(g, (sx | 0) - 1, (sy | 0) - 1, PAL.zapCore, 2, 2);
    frames.push(c);
  }
  return frames;
}

function guardTowerSprite() {
  const W = TILE, H = TILE;
  const [c, g] = makeCanvas(W, H);
  g.fillStyle = PAL.shadow; g.fillRect(4, 5, W - 6, H - 6);
  g.fillStyle = PAL.ink; g.beginPath(); g.arc(W / 2, H / 2, 10, 0, 7); g.fill();
  g.fillStyle = PAL.wall2; g.beginPath(); g.arc(W / 2, H / 2, 9, 0, 7); g.fill();
  g.fillStyle = PAL.wall1; g.beginPath(); g.arc(W / 2 - 1, H / 2 - 1, 6, 0, 7); g.fill();
  // sandbag ring
  for (let a = 0; a < 8; a++) {
    const x = W / 2 + Math.cos(a * 0.785) * 9 - 1, y = H / 2 + Math.sin(a * 0.785) * 9 - 1;
    px(g, x, y, PAL.sand1, 2, 2);
  }
  px(g, W / 2 - 1, H / 2 - 1, HN[2], 3, 3);
  return c;
}

export function guardTowerGun() {
  const [c, g] = makeCanvas(TILE, TILE);
  const L = { k: PAL.ink, g: PAL.gun1, G: PAL.gun2, s: PAL.steel2, h: PAL.steel1 };
  drawMap(g, [
    '........................',
    '..........kk............',
    '..........kgk...........',
    '..........kGk...........',
    '..........kgk...........',
    '..........kGk...........',
    '.........kkgkk..........',
    '.........ksshk..........',
    '.........ksssk..........',
    '.........kkkkk..........',
    '........................',
  ], L);
  return c;
}

function teslaSprite() {
  const W = TILE, H = TILE;
  const [c, g] = makeCanvas(W, H);
  g.fillStyle = PAL.shadow; g.fillRect(5, 6, W - 8, H - 8);
  // base
  bevelRect(g, 5, 12, 14, 9, PAL.steel3, PAL.steel1, PAL.steel4);
  outlineRect(g, 5, 12, 14, 9, PAL.ink);
  px(g, 7, 14, HN[2], 4, 3);
  // column
  px(g, 10, 4, PAL.ink, 5, 9);
  px(g, 11, 4, PAL.steel2, 3, 9);
  px(g, 11, 4, PAL.steelHi, 1, 9);
  // coil head
  g.fillStyle = PAL.ink; g.beginPath(); g.arc(12, 4, 5, 0, 7); g.fill();
  g.fillStyle = PAL.steel1; g.beginPath(); g.arc(12, 4, 4, 0, 7); g.fill();
  g.fillStyle = PAL.zap; g.beginPath(); g.arc(11, 3, 2, 0, 7); g.fill();
  px(g, 11, 2, PAL.zapCore, 1, 1);
  return c;
}

function siloSprite() {
  const W = TILE, H = TILE;
  const [c, g] = makeCanvas(W, H);
  g.fillStyle = PAL.shadow; g.fillRect(4, 5, W - 6, H - 6);
  g.fillStyle = PAL.ink; g.beginPath(); g.arc(W / 2, H / 2, 10, 0, 7); g.fill();
  g.fillStyle = PAL.steel2; g.beginPath(); g.arc(W / 2, H / 2, 9, 0, 7); g.fill();
  g.fillStyle = PAL.steel1; g.beginPath(); g.arc(W / 2 - 2, H / 2 - 2, 6, 0, 7); g.fill();
  g.fillStyle = PAL.ore1; g.beginPath(); g.arc(W / 2, H / 2, 3, 0, 7); g.fill();
  px(g, W / 2 - 4, H / 2 - 6, PAL.steelHi, 3, 1);
  px(g, W / 2 + 4, H / 2 + 3, HN[2], 2, 2);
  return c;
}

function flameTowerSprite() {
  const W = TILE, H = TILE;
  const [c, g] = makeCanvas(W, H);
  g.fillStyle = PAL.shadow; g.fillRect(4, 6, W - 6, H - 6);
  // fuel drum base
  g.fillStyle = PAL.ink; g.beginPath(); g.arc(W / 2, H / 2 + 2, 9, 0, 7); g.fill();
  g.fillStyle = PAL.steel3; g.beginPath(); g.arc(W / 2, H / 2 + 2, 8, 0, 7); g.fill();
  g.fillStyle = PAL.steel2; g.beginPath(); g.arc(W / 2 - 2, H / 2, 5, 0, 7); g.fill();
  px(g, W / 2 - 3, H / 2 + 4, HN[2], 6, 2);
  // nozzle head with a pilot flame
  px(g, W / 2 - 2, 3, PAL.ink, 5, 7);
  px(g, W / 2 - 1, 3, PAL.gun1, 3, 7);
  px(g, W / 2 - 1, 1, PAL.fire3, 2, 2);
  px(g, W / 2 - 1, 1, PAL.fire1, 1, 1);
  return c;
}

function techCenterSprite() {
  const W = TILE * 2, H = TILE * 2;
  const [c, g] = makeCanvas(W, H);
  bldBase(g, W, H, { mid: PAL.wall2 });
  // domed lab hall
  bevelRect(g, 8, 16, W - 16, H - 24, PAL.roof2, PAL.roofHi, PAL.roof3);
  outlineRect(g, 8, 16, W - 16, H - 24, PAL.ink);
  g.fillStyle = PAL.ink; g.beginPath(); g.arc(W / 2, 20, 10, Math.PI, 0); g.fill();
  g.fillStyle = PAL.steel2; g.beginPath(); g.arc(W / 2, 20, 9, Math.PI, 0); g.fill();
  px(g, W / 2 - 6, 18, PAL.steelHi, 3, 1);
  // antenna mast with a charged tip
  px(g, W / 2 - 1, 2, PAL.steel4, 2, 14);
  px(g, W / 2 - 1, 2, PAL.steelHi, 1, 14);
  g.fillStyle = PAL.ink; g.beginPath(); g.arc(W / 2, 4, 4, 0, 7); g.fill();
  g.fillStyle = PAL.zap; g.beginPath(); g.arc(W / 2, 4, 2, 0, 7); g.fill();
  // house trim + blinking readouts
  px(g, 12, H - 12, HN[2], W - 24, 3);
  px(g, 12, H - 8, PAL.zapCore, 2, 2);
  px(g, 18, H - 8, PAL.fire1, 2, 2);
  px(g, W - 16, H - 8, PAL.ore1, 2, 2);
  return c;
}

function wallSprite() {
  const W = TILE, H = TILE;
  const [c, g] = makeCanvas(W, H);
  g.fillStyle = PAL.shadow; g.fillRect(3, 4, W - 4, H - 4);
  bevelRect(g, 2, 3, W - 4, H - 6, PAL.concrete, PAL.wallHi, PAL.concreteD);
  outlineRect(g, 2, 3, W - 4, H - 6, PAL.ink);
  // block seams
  px(g, 2, 10, PAL.concreteD, W - 4, 1);
  px(g, W / 2 - 1, 3, PAL.concreteD, 1, 7);
  px(g, 6, 11, PAL.concreteD, 1, 9);
  px(g, W - 8, 11, PAL.concreteD, 1, 9);
  px(g, W / 2 - 2, 5, HN[2], 4, 2);   // house tag
  return c;
}

// neutral supply depot: a fenced 2x2 pad stacked with wooden crates and
// fuel drums. Drawn with house-colour placeholders on a corner flag so the
// tint reads neutral grey when unowned and faction colour once captured.
function depotSprite() {
  const W = TILE * 2, H = TILE * 2;
  const [c, g] = makeCanvas(W, H);
  // concrete pad
  g.fillStyle = PAL.shadow; g.fillRect(4, 5, W - 6, H - 6);
  bevelRect(g, 2, 2, W - 4, H - 4, PAL.concrete, PAL.wallHi, PAL.concreteD);
  outlineRect(g, 2, 2, W - 4, H - 4, PAL.ink);
  // hazard stripe along the top edge
  for (let i = 0; i < 8; i++) px(g, 4 + i * 5, 4, i % 2 ? PAL.ore1 : PAL.ink, 4, 2);
  // wooden crates (brown) with plank seams
  const crate = (x, y, s) => {
    px(g, x, y, PAL.ink, s, s);
    bevelRect(g, x + 1, y + 1, s - 2, s - 2, '#8a6034', '#a97a44', '#5e4020');
    px(g, x + 1, y + (s >> 1), '#5e4020', s - 2, 1);
    px(g, x + (s >> 1), y + 1, '#5e4020', 1, s - 2);
  };
  crate(8, 12, 12);
  crate(21, 10, 11);
  crate(11, 26, 11);
  // fuel drums (steel cylinders with a rim + bung)
  const drum = (cx, cy) => {
    g.fillStyle = PAL.ink; g.beginPath(); g.arc(cx, cy, 6, 0, 7); g.fill();
    g.fillStyle = PAL.steel3; g.beginPath(); g.arc(cx, cy, 5, 0, 7); g.fill();
    g.fillStyle = PAL.steel1; g.beginPath(); g.arc(cx - 1, cy - 1, 3, 0, 7); g.fill();
    px(g, cx - 3, cy, PAL.steel4, 6, 1);
    px(g, cx - 1, cy - 4, PAL.ore1, 2, 2);   // yellow bung cap
  };
  drum(W - 13, H - 15);
  drum(W - 24, H - 12);
  // corner flag: house-colour trim (tinted per owner)
  px(g, 4, H - 12, PAL.ink, 3, 10);
  px(g, 5, H - 12, HN[2], 1, 10);
  px(g, 6, H - 12, HN[2], 6, 5);
  px(g, 6, H - 12, HN[3], 6, 2);
  return c;
}

// Battle-damage decal: procedural cracks + soot on a transparent footprint
// canvas, drawn as an extra quad over a building below 50% hp. Two variants
// per footprint size keep repeats from looking stamped.
export function crackOverlay(wT, hT, seed) {
  const W = wT * TILE, H = hT * TILE;
  const [c, g] = makeCanvas(W, H);
  const rng = makeRng(seed);
  // soot smudges
  for (let i = 0; i < 2 + wT; i++) {
    const x = 4 + rng() * (W - 8), y = 4 + rng() * (H - 8), r = 3 + rng() * 5;
    g.globalAlpha = 0.35 + rng() * 0.2;
    g.fillStyle = '#14120c';
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
  // jagged cracks with a faint highlighted lip
  const nc = 2 + wT;
  for (let i = 0; i < nc; i++) {
    let x = (3 + rng() * (W - 6)) | 0, y = (3 + rng() * (H - 6)) | 0;
    const steps = 6 + (rng() * 8 | 0);
    for (let s = 0; s < steps; s++) {
      px(g, x, y, '#0c0b08');
      if ((s & 1) === 0) px(g, x + 1, y, 'rgba(200,190,170,0.22)');
      x += (rng() < 0.5 ? 1 : -1) * (1 + (rng() * 2 | 0));
      y += 1 + (rng() * 2 | 0);
      if (x < 1 || x >= W - 1 || y >= H - 1) break;
    }
  }
  return c;
}

// The atlas' structure set, in build order. Keys match rules.js building keys.
export function buildingSprites() {
  return {
    conyard: conYardSprite(), power: powerPlantSprite(), refinery: refinerySprite(),
    barracks: barracksSprite(), factory: factorySprite(), radar: radarSprite(),
    guard: guardTowerSprite(), tesla: teslaSprite(), silo: siloSprite(),
    flametower: flameTowerSprite(), techcenter: techCenterSprite(), wall: wallSprite(),
    depot: depotSprite(),
  };
}
