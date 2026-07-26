// Vehicle art: hulls and turrets, drawn once facing NORTH, plus the machinery
// that turns one drawing into a usable set — facingsOf() bakes the FACINGS
// rotation steps and treadShift() derives the second tread frame.

import {
  PAL, makeCanvas, px, drawMap, bevelRect, outlineRect, rotatedCopy, hexToRgb,
} from '../palette.js';
import { FACINGS, HN } from './consts.js';

export function lightTankHull() {
  const [c, g] = makeCanvas(24, 24);
  const L = {
    k: PAL.ink, t: PAL.tread, T: PAL.treadHi,
    a: PAL.camo1, b: PAL.camo2, c: PAL.camo3, h: PAL.camoHi,
    H: HN[2], d: HN[1],
  };
  drawMap(g, [
    '........................',
    '........................',
    '....kkk..........kkk....',
    '...ktttk........ktttk...',
    '...kTttk.kkkkkk.kTttk...',
    '...ktttkkabbbbakktttk...',
    '...ktttkabbbbbbaktttk...',
    '...kTttkabhhbbbakTttk...',
    '...ktttkabbbbbbaktttk...',
    '...ktttkabbccbbaktttk...',
    '...kTttkabbccbbakTttk...',
    '...ktttkabbbbbbaktttk...',
    '...ktttkabbbbbbaktttk...',
    '...kTttkaHddddHakTttk...',
    '...ktttkabbbbbbaktttk...',
    '...ktttkabbbbbbaktttk...',
    '...kTttkacbbbbcakTttk...',
    '...ktttk.kkkkkk.ktttk...',
    '...ktttk........ktttk...',
    '....kkk..........kkk....',
    '........................',
    '........................',
    '........................',
    '........................',
  ], L);
  return c;
}

export function lightTankTurret() {
  const [c, g] = makeCanvas(24, 24);
  const L = {
    k: PAL.ink, a: PAL.camo1, b: PAL.camo2, h: PAL.camoHi,
    g: PAL.gun1, G: PAL.gun2, H: HN[2],
  };
  drawMap(g, [
    '........................',
    '...........kk...........',
    '..........kggk..........',
    '..........kgGk..........',
    '..........kggk..........',
    '..........kgGk..........',
    '..........kggk..........',
    '..........kggk..........',
    '.........kkggkk.........',
    '........kaabbaak........',
    '.......kabbbbbbak.......',
    '.......kabhhbbbak.......',
    '.......kabhbbbHak.......',
    '.......kabbbbbbak.......',
    '.......kabbbbbbak.......',
    '........kaabbaak........',
    '.........kkkkkk.........',
    '........................',
  ], L);
  return c;
}

export function heavyTankHull() {
  const [c, g] = makeCanvas(26, 26);
  const L = {
    k: PAL.ink, t: PAL.tread, T: PAL.treadHi,
    a: PAL.steel3, b: PAL.steel2, c: PAL.steel4, h: PAL.steel1,
    H: HN[2], d: HN[1],
  };
  drawMap(g, [
    '..........................',
    '...kkkk............kkkk...',
    '..kttttk..........kttttk..',
    '..ktTttk.kkkkkkkk.ktTttk..',
    '..kttttkkabbbbbbakkttttk..',
    '..ktTttkabbbbbbbbaktTttk..',
    '..kttttkabhhbbbbbakttttk..',
    '..ktTttkabbbbbbbbaktTttk..',
    '..kttttkabbccccbbakttttk..',
    '..ktTttkabbccccbbaktTttk..',
    '..kttttkabbbbbbbbakttttk..',
    '..ktTttkabbbbbbbbaktTttk..',
    '..kttttkabbbbbbbbakttttk..',
    '..ktTttkaHddddddHaktTttk..',
    '..kttttkabbbbbbbbakttttk..',
    '..ktTttkabbbbbbbbaktTttk..',
    '..kttttkacbbbbbbcakttttk..',
    '..ktTttk.kkkkkkkk.ktTttk..',
    '..kttttk..........kttttk..',
    '...kkkk............kkkk...',
    '..........................',
    '..........................',
    '..........................',
    '..........................',
    '..........................',
    '..........................',
  ], L);
  return c;
}

export function heavyTankTurret() {
  const [c, g] = makeCanvas(26, 26);
  const L = {
    k: PAL.ink, a: PAL.steel3, b: PAL.steel2, h: PAL.steel1,
    g: PAL.gun1, G: PAL.gun2, H: HN[2],
  };
  drawMap(g, [
    '..........................',
    '.........kk..kk...........',
    '........kggkkgGk..........',
    '........kgGkkggk..........',
    '........kggkkgGk..........',
    '........kgGkkggk..........',
    '........kggkkggk..........',
    '.......kkggkkggkk.........',
    '......kaabbbbbbaak........',
    '......kabbbbbbbbak........',
    '.....kabbhhbbbbbbak.......',
    '.....kabhbbbbbbbHak.......',
    '.....kabbbbbbbbbbak.......',
    '.....kabbbbbbbbbbak.......',
    '......kabbbbbbbbak........',
    '......kaabbbbbbaak........',
    '.......kkkkkkkkkk.........',
    '..........................',
  ], L);
  return c;
}

export function harvesterHull() {
  const [c, g] = makeCanvas(26, 26);
  const L = {
    k: PAL.ink, t: PAL.tread, T: PAL.treadHi,
    a: PAL.steel3, b: PAL.steel2, h: PAL.steel1, c: PAL.steel4,
    o: PAL.ore1, O: PAL.ore3, H: HN[2], d: HN[1], w: PAL.gun2,
  };
  drawMap(g, [
    '..........................',
    '..........................',
    '.....kkkk........kkkk.....',
    '....kttttk......kttttk....',
    '....ktTttkkkkkkkktTttk....',
    '....kttttkabbbbakttttk....',
    '....ktTttkawwbbaktTttk....',
    '....kttttkabbbbakttttk....',
    '....ktTttkaHddHaktTttk....',
    '....kttttkkkkkkkkttttk....',
    '....ktTttkabbbbbaktTttk...',
    '....kttttabbbbbbbakttttk..',
    '....ktTtkaboooObbaktTttk..',
    '....ktttkaboOoobbakttttk..',
    '....ktTtkabooOobbaktTttk..',
    '....ktttkabbooobbakttttk..',
    '....ktTtkabbbbbbbaktTttk..',
    '....ktttk.akkkkka.kttttk..',
    '....kkkk...........kkkk...',
    '..........................',
    '..........................',
    '..........................',
    '..........................',
    '..........................',
    '..........................',
    '..........................',
  ], L);
  return c;
}

export function mcvHull() {
  const [c, g] = makeCanvas(26, 26);
  const L = {
    k: PAL.ink, t: PAL.tread, T: PAL.treadHi,
    a: PAL.steel3, b: PAL.steel2, h: PAL.steel1, c: PAL.steel4,
    H: HN[2], d: HN[1], w: PAL.gun2, r: PAL.roof2,
  };
  drawMap(g, [
    '..........................',
    '..........................',
    '....kkkk..........kkkk....',
    '...kttttk........kttttk...',
    '...ktTttkkkkkkkkkktTttk...',
    '...kttttkabbbbbbakttttk...',
    '...ktTttkawwbbwwaktTttk...',
    '...kttttkabbbbbbakttttk...',
    '...ktTttkkkkkkkkkktTttk...',
    '...kttttkarrrrrrakttttk...',
    '...ktTttkarhhhrraktTttk...',
    '...kttttkarhrrrrakttttk...',
    '...ktTttkarrrrrraktTttk...',
    '...kttttkaHddddHakttttk...',
    '...ktTttkarrrrrraktTttk...',
    '...kttttkarrrrrrakttttk...',
    '...ktTttkacrrrrcaktTttk...',
    '...kttttk.kkkkkk.kttttk...',
    '...kkkk............kkkk...',
    '..........................',
    '..........................',
    '..........................',
    '..........................',
    '..........................',
    '..........................',
    '..........................',
  ], L);
  return c;
}

// armoured personnel carrier: a boxy troop hull with side tracks, a roof
// hatch and a small pintle MG poking forward. No turret — drawn facing north.
export function apcHull() {
  const [c, g] = makeCanvas(24, 24);
  const L = {
    k: PAL.ink, t: PAL.tread, T: PAL.treadHi,
    a: PAL.steel3, b: PAL.steel2, c: PAL.steel4, h: PAL.steel1,
    H: HN[2], d: HN[1], g: PAL.gun1, G: PAL.gun2,
  };
  drawMap(g, [
    '........................',
    '..........kGk...........',
    '..........kgk...........',
    '....kkk...kgk....kkk....',
    '...ktttk..kkk...ktttk...',
    '...kTttkkkkkkkkkktTttk..',
    '...ktttkabbbbbbbaktttk..',
    '...kTttkabbHHbbbaktTttk.',
    '...ktttkabbbbbbbaktttk..',
    '...kTttkabbccbbbaktTttk.',
    '...ktttkabhbbbbbaktttk..',
    '...kTttkabbbbbbbaktTttk.',
    '...ktttkabbbbbbbaktttk..',
    '...kTttkaHdddddHaktTttk.',
    '...ktttkabbbbbbbaktttk..',
    '...kTttkabbccbbbaktTttk.',
    '...ktttkabbbbbbbaktttk..',
    '...kTttkkkkkkkkkktTttk..',
    '...ktttk........ktttk...',
    '....kkk..........kkk....',
    '........................',
    '........................',
    '........................',
    '........................',
  ], L);
  return c;
}

// self-propelled gun: fixed hull with a long barrel (no turret), drawn north
export function artilleryHull() {
  const [c, g] = makeCanvas(24, 24);
  px(g, 4, 20, PAL.shadow, 16, 2);
  // two side tracks
  for (const tx of [3, 17]) {
    outlineRect(g, tx, 7, 4, 12, PAL.ink);
    px(g, tx + 1, 8, PAL.tread, 2, 10);
    for (let i = 0; i < 5; i++) px(g, tx + 1, 8 + i * 2, PAL.treadHi, 2, 1);
  }
  // hull body
  bevelRect(g, 7, 9, 10, 10, PAL.camo2, PAL.camoHi, PAL.camo3);
  outlineRect(g, 7, 9, 10, 10, PAL.ink);
  px(g, 8, 16, HN[2], 8, 2);
  px(g, 9, 11, PAL.camo1, 6, 3);
  // mantlet + long barrel up the centre
  bevelRect(g, 9, 6, 6, 5, PAL.steel3, PAL.steel1, PAL.steel4);
  outlineRect(g, 9, 6, 6, 5, PAL.ink);
  px(g, 11, 0, PAL.ink, 3, 8);
  px(g, 11, 0, PAL.gun1, 2, 8);
  px(g, 11, 0, PAL.steelHi, 1, 6);
  px(g, 10, 1, PAL.gun2, 4, 2);   // muzzle brake
  return c;
}

// rocket rack truck: body plus four launch tubes pointing north
export function rocketTruckHull() {
  const [c, g] = makeCanvas(26, 26);
  px(g, 5, 21, PAL.shadow, 16, 2);
  for (const tx of [4, 18]) {
    outlineRect(g, tx, 8, 4, 12, PAL.ink);
    px(g, tx + 1, 9, PAL.tread, 2, 10);
    for (let i = 0; i < 5; i++) px(g, tx + 1, 9 + i * 2, PAL.treadHi, 2, 1);
  }
  bevelRect(g, 8, 12, 10, 9, PAL.camo2, PAL.camoHi, PAL.camo3);
  outlineRect(g, 8, 12, 10, 9, PAL.ink);
  px(g, 9, 18, HN[2], 8, 2);
  // launch rack: four tubes with warhead tips
  bevelRect(g, 7, 3, 12, 9, PAL.steel3, PAL.steel1, PAL.steel4);
  outlineRect(g, 7, 3, 12, 9, PAL.ink);
  for (let i = 0; i < 4; i++) {
    const rx = 8 + i * 3;
    px(g, rx, 2, PAL.ink, 2, 9);
    px(g, rx, 2, PAL.gun2, 1, 9);
    px(g, rx, 2, PAL.fire3, 1, 1);
  }
  return c;
}

// super-heavy hull (bigger than the heavy tank) + twin-barrel turret
export function behemothHull() {
  const [c, g] = makeCanvas(30, 30);
  px(g, 4, 25, PAL.shadow, 22, 3);
  for (const tx of [3, 22]) {
    outlineRect(g, tx, 5, 5, 20, PAL.ink);
    px(g, tx + 1, 6, PAL.tread, 3, 18);
    for (let i = 0; i < 9; i++) px(g, tx + 1, 6 + i * 2, PAL.treadHi, 3, 1);
  }
  bevelRect(g, 8, 6, 14, 18, PAL.steel2, PAL.steel1, PAL.steel4);
  outlineRect(g, 8, 6, 14, 18, PAL.ink);
  px(g, 10, 9, PAL.steel3, 10, 2);
  px(g, 10, 20, PAL.steel4, 10, 2);
  px(g, 11, 15, HN[2], 8, 2);
  return c;
}

export function behemothTurret() {
  const [c, g] = makeCanvas(30, 30);
  for (const bx of [11, 16]) {
    px(g, bx, 0, PAL.ink, 3, 12);
    px(g, bx, 0, PAL.gun1, 2, 12);
    px(g, bx, 0, PAL.steelHi, 1, 9);
  }
  px(g, 10, 1, PAL.gun2, 10, 2);   // muzzle bar
  g.fillStyle = PAL.ink; g.beginPath(); g.arc(15, 16, 9, 0, 7); g.fill();
  g.fillStyle = PAL.steel2; g.beginPath(); g.arc(15, 16, 8, 0, 7); g.fill();
  g.fillStyle = PAL.steel1; g.beginPath(); g.arc(13, 14, 5, 0, 7); g.fill();
  px(g, 13, 15, HN[2], 4, 3);
  px(g, 11, 11, PAL.steelHi, 3, 1);
  return c;
}

// --------------------------------------------------------- facing sets ---

// One drawing -> FACINGS pre-rotated copies. Rotating at build time keeps the
// per-frame renderer to a plain canvas swap.
export function facingsOf(base) {
  const arr = [];
  for (let f = 0; f < FACINGS; f++) arr.push(rotatedCopy(base, f * Math.PI * 2 / FACINGS));
  return arr;
}

// Track/wheel shimmer: post-process a tinted hull so the tread highlights
// (PAL.treadHi over PAL.tread) shift down one row. Alternating this "B" hull
// with the base "A" hull at ~8fps while moving sells rolling treads without a
// second hand-drawn frame. Operates before rotation (tread colours are never
// house-recoloured, so they survive houseRecolor untouched).
export function treadShift(src) {
  const w = src.width, h = src.height;
  const [dst, g] = makeCanvas(w, h);
  g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const hi = hexToRgb(PAL.treadHi), lo = hexToRgb(PAL.tread);
  const at = (x, y) => ((y * w + x) * 4);
  const isHi = (i) => d[i] === hi[0] && d[i + 1] === hi[1] && d[i + 2] === hi[2] && d[i + 3] > 0;
  // snapshot which pixels are highlights, then rewrite: highlight moves down
  const wasHi = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (isHi(at(x, y))) wasHi[y * w + x] = 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = at(x, y);
      const here = wasHi[y * w + x];
      const above = y > 0 && wasHi[(y - 1) * w + x];
      if (here && !above) { d[i] = lo[0]; d[i + 1] = lo[1]; d[i + 2] = lo[2]; }
      else if (!here && above) { d[i] = hi[0]; d[i + 1] = hi[1]; d[i + 2] = hi[2]; d[i + 3] = 255; }
    }
  }
  g.putImageData(img, 0, 0);
  return dst;
}

// Harvester intake spinner: 2 tiny frames of a rotating auger, overlaid on
// the hull while it is actively scooping ore.
export function harvSpinFrames() {
  const mk = (rot) => {
    const [c, g] = makeCanvas(10, 10);
    g.save(); g.translate(5, 5); g.rotate(rot);
    g.fillStyle = PAL.ink; g.fillRect(-4, -1, 8, 2); g.fillRect(-1, -4, 2, 8);
    g.fillStyle = PAL.ore3; g.fillRect(-4, -1, 3, 1); g.fillRect(1, 0, 3, 1);
    g.fillStyle = PAL.oreHi; g.fillRect(0, -4, 1, 3);
    g.restore();
    return c;
  };
  return [mk(0), mk(Math.PI / 4)];
}

// Hull + optional turret per vehicle key. Insertion order is the order the
// atlas builds them in, which the art tests fingerprint.
export const VEHICLE_PARTS = {
  lightTank: [lightTankHull, lightTankTurret],
  heavyTank: [heavyTankHull, heavyTankTurret],
  behemoth: [behemothHull, behemothTurret],
  artillery: [artilleryHull],
  rocketTruck: [rocketTruckHull],
  apc: [apcHull],
  harvester: [harvesterHull],
  mcv: [mcvHull],
};
