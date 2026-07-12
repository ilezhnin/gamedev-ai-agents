// All in-game art, generated at boot: terrain tiles, buildings, vehicles,
// infantry, effects and sidebar cameo icons. Original pixel work in a
// 16-bit console spirit — chunky shapes, hard ink outlines, dithered shading.

import {
  PAL, HOUSE, makeCanvas, px, drawMap, dither, bevelRect, outlineRect,
  rotatedCopy, houseRecolor, makeRng, shadeColor,
} from './palette.js';

export const TILE = 24;          // world pixels per map cell
export const FACINGS = 16;       // rotation steps for vehicles/turrets

// ---------------------------------------------------------------- terrain --

function grassTile(seed) {
  const [c, g] = makeCanvas(TILE, TILE);
  const rng = makeRng(seed);
  px(g, 0, 0, PAL.grass1, TILE, TILE);
  for (let i = 0; i < 46; i++) {
    const x = (rng() * TILE) | 0, y = (rng() * TILE) | 0;
    const r = rng();
    px(g, x, y, r < 0.42 ? PAL.grass2 : r < 0.8 ? PAL.grass3 : PAL.grassHi);
  }
  // sparse blades
  for (let i = 0; i < 5; i++) {
    const x = (rng() * (TILE - 2)) | 0, y = (rng() * (TILE - 3)) | 0;
    px(g, x, y + 1, PAL.grassHi); px(g, x, y, PAL.grass3);
  }
  return c;
}

function dirtTile(seed) {
  const [c, g] = makeCanvas(TILE, TILE);
  const rng = makeRng(seed);
  px(g, 0, 0, PAL.dirt1, TILE, TILE);
  for (let i = 0; i < 40; i++) {
    const x = (rng() * TILE) | 0, y = (rng() * TILE) | 0;
    const r = rng();
    px(g, x, y, r < 0.5 ? PAL.dirt2 : PAL.dirt3, 1 + (r < .2 ? 1 : 0), 1);
  }
  return c;
}

function waterTile(seed, frame) {
  const [c, g] = makeCanvas(TILE, TILE);
  const rng = makeRng(seed + frame * 977);
  px(g, 0, 0, PAL.water1, TILE, TILE);
  for (let i = 0; i < 26; i++) {
    const x = (rng() * TILE) | 0, y = (rng() * TILE) | 0;
    px(g, x, y, rng() < 0.6 ? PAL.water2 : PAL.water3, 2, 1);
  }
  for (let i = 0; i < 6; i++) {
    const x = (rng() * (TILE - 3)) | 0, y = (rng() * TILE) | 0;
    px(g, x + ((frame + i) % 2), y, PAL.waterHi, 2, 1);
  }
  return c;
}

function shoreTile(base, mask) {
  // mask bits: 1=N,2=E,4=S,8=W water neighbour -> sandy fringe on that edge
  const [c, g] = makeCanvas(TILE, TILE);
  g.drawImage(base, 0, 0);
  const w = TILE;
  if (mask & 1) { dither(g, 0, 0, w, 2, PAL.sand1, PAL.sand2); px(g, 0, 2, PAL.sand2, w, 1); }
  if (mask & 4) { dither(g, 0, w - 2, w, 2, PAL.sand1, PAL.sand2); px(g, 0, w - 3, PAL.sand2, w, 1); }
  if (mask & 8) { dither(g, 0, 0, 2, w, PAL.sand1, PAL.sand2); px(g, 2, 0, PAL.sand2, 1, w); }
  if (mask & 2) { dither(g, w - 2, 0, 2, w, PAL.sand1, PAL.sand2); px(g, w - 3, 0, PAL.sand2, 1, w); }
  return c;
}

function rockTile(seed) {
  const [c, g] = makeCanvas(TILE, TILE);
  g.drawImage(grassTile(seed ^ 0x5f5), 0, 0);
  const rng = makeRng(seed);
  const n = 2 + (rng() * 2 | 0);
  for (let i = 0; i < n; i++) {
    const cx = 4 + rng() * (TILE - 9), cy = 4 + rng() * (TILE - 9);
    const r = 3 + rng() * 4;
    g.fillStyle = PAL.rock2;
    g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
    g.fillStyle = PAL.rock1;
    g.beginPath(); g.arc(cx - 1, cy - 1, r - 1, 0, 7); g.fill();
    px(g, cx - r * 0.5, cy - r * 0.6, PAL.rockHi, 2, 1);
    px(g, cx + 1, cy - 1, PAL.rock3, 2, 2);
  }
  return c;
}

function treeTile(seed) {
  const [c, g] = makeCanvas(TILE, TILE);
  g.drawImage(grassTile(seed ^ 0xabc), 0, 0);
  const rng = makeRng(seed);
  const cx = 11 + (rng() * 3 | 0), cy = 12 + (rng() * 2 | 0);
  // shadow + trunk
  g.fillStyle = PAL.shadow;
  g.beginPath(); g.ellipse(cx + 1, cy + 6, 7, 3, 0, 0, 7); g.fill();
  px(g, cx - 1, cy + 3, PAL.trunk, 2, 4);
  // canopy: stacked blobs
  const blob = (bx, by, r, col) => {
    g.fillStyle = col; g.beginPath(); g.arc(bx, by, r, 0, 7); g.fill();
  };
  blob(cx, cy, 8, PAL.ink);
  blob(cx, cy, 7, PAL.tree2);
  blob(cx - 2, cy - 2, 5, PAL.tree1);
  blob(cx - 3, cy - 3, 3, PAL.tree3);
  px(g, cx - 4, cy - 5, PAL.treeHi, 2, 1);
  px(g, cx + 2, cy - 2, PAL.tree3, 2, 2);
  return c;
}

function oreOverlay(density) { // density 1..3
  const [c, g] = makeCanvas(TILE, TILE);
  const rng = makeRng(1000 + density * 77);
  const n = 5 + density * 5;
  for (let i = 0; i < n; i++) {
    const x = 1 + (rng() * (TILE - 4)) | 0, y = 1 + (rng() * (TILE - 4)) | 0;
    px(g, x, y + 1, PAL.ore2, 3, 1);
    px(g, x, y, PAL.ore1, 3, 1);
    px(g, x + 1, y, PAL.ore3, 1, 1);
    if (rng() < 0.4) px(g, x + 1, y - 1, PAL.oreHi);
  }
  return c;
}

function scorchDecal() {
  const [c, g] = makeCanvas(TILE, TILE);
  const rng = makeRng(4242);
  g.fillStyle = 'rgba(25,24,20,0.75)';
  g.beginPath(); g.ellipse(12, 12, 8, 6, 0, 0, 7); g.fill();
  for (let i = 0; i < 14; i++) {
    px(g, 4 + rng() * 16, 5 + rng() * 13, rng() < .5 ? PAL.scorch : '#33302a');
  }
  return c;
}

// --------------------------------------------------------------- vehicles --

// Tanks are drawn facing NORTH (up), then rotated into FACINGS steps.
// House-colour placeholders (PAL.houseNone) are remapped per faction.
const HN = PAL.houseNone;

function lightTankHull() {
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

function lightTankTurret() {
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

function heavyTankHull() {
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

function heavyTankTurret() {
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

function harvesterHull() {
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

function mcvHull() {
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

// -------------------------------------------------------------- infantry ---

// tiny 12x12 soldiers, drawn facing north; 2 walk frames + fire frame
function soldierFrames(kind) {
  // kind: 'rifle' | 'rocket'
  const mk = (pose) => {
    const [c, g] = makeCanvas(12, 12);
    const L = {
      k: PAL.ink, s: PAL.skin, b: PAL.boots,
      u: HN[1], U: HN[2], g: PAL.gun2, G: PAL.gun1, r: PAL.fire3,
    };
    let rows;
    if (kind === 'rifle') {
      if (pose === 0) rows = [ // stand / walk A
        '....gg......',
        '....gg......',
        '..k.kk.k....',
        '..kUssUk....',
        '...kUUk.....',
        '..kUUUUk....',
        '..kuUUuk....',
        '...kuuk.....',
        '...kuuk.....',
        '..kb..bk....',
        '............',
        '............'];
      else if (pose === 1) rows = [ // walk B
        '....gg......',
        '....gg......',
        '..k.kk.k....',
        '..kUssUk....',
        '...kUUk.....',
        '..kUUUUk....',
        '..kuUUuk....',
        '...kuuk.....',
        '..kb.uk.....',
        '.....kbk....',
        '............',
        '............'];
      else rows = [ // fire
        '....rr......',
        '....gg......',
        '....gg......',
        '..kkkk.k....',
        '..kUssUk....',
        '...kUUk.....',
        '..kUUUUk....',
        '..kuUUuk....',
        '...kuuk.....',
        '..kb..bk....',
        '............',
        '............'];
    } else { // rocket trooper: tube on shoulder
      if (pose === 0) rows = [
        '...kGGk.....',
        '...kGgk.....',
        '...kGgk.....',
        '..kkssUk....',
        '...kUUk.....',
        '..kUUUUk....',
        '..kuUUuk....',
        '...kuuk.....',
        '...kuuk.....',
        '..kb..bk....',
        '............',
        '............'];
      else if (pose === 1) rows = [
        '...kGGk.....',
        '...kGgk.....',
        '...kGgk.....',
        '..kkssUk....',
        '...kUUk.....',
        '..kUUUUk....',
        '..kuUUuk....',
        '...kuuk.....',
        '..kb.uk.....',
        '.....kbk....',
        '............',
        '............'];
      else rows = [
        '...krrk.....',
        '...kGGk.....',
        '...kGgk.....',
        '..kkssUk....',
        '...kUUk.....',
        '..kUUUUk....',
        '..kuUUuk....',
        '...kuuk.....',
        '...kuuk.....',
        '..kb..bk....',
        '............',
        '............'];
    }
    drawMap(g, rows, L);
    return c;
  };
  return [mk(0), mk(1), mk(2)];
}

// -------------------------------------------------------------- buildings --

// Buildings are drawn straight top-down on a footprint of w×h tiles.
// A subtle drop shadow + hard outline + house-colour trim keep them readable.

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
  // pitched roof reading: two shaded halves
  px(g, 6, 6, PAL.roof1, W - 12, (H - 12) / 2);
  px(g, 6, H / 2, PAL.roof3, W - 12, (H - 12) / 2);
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
  // dish
  g.fillStyle = PAL.ink; g.beginPath(); g.ellipse(W / 2, 18, 13, 10, -0.5, 0, 7); g.fill();
  g.fillStyle = PAL.steel1; g.beginPath(); g.ellipse(W / 2, 18, 12, 9, -0.5, 0, 7); g.fill();
  g.fillStyle = PAL.steel2; g.beginPath(); g.ellipse(W / 2 + 2, 19, 8, 6, -0.5, 0, 7); g.fill();
  px(g, W / 2 - 1, 16, PAL.zapCore, 3, 3);
  px(g, W / 2 - 8, 11, PAL.steelHi, 4, 1);
  return c;
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

function guardTowerGun() {
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

// ---------------------------------------------------------------- effects --

function explosionFrames() {
  const frames = [];
  const steps = 6;
  for (let f = 0; f < steps; f++) {
    const [c, g] = makeCanvas(32, 32);
    const t = f / (steps - 1);
    const r = 4 + t * 11;
    const cx = 16, cy = 16;
    const ring = (rad, col) => { g.fillStyle = col; g.beginPath(); g.arc(cx, cy, Math.max(0.5, rad), 0, 7); g.fill(); };
    if (t < 0.7) {
      ring(r, PAL.fire4); ring(r * 0.8, PAL.fire3); ring(r * 0.55, PAL.fire2); ring(r * 0.3, PAL.fire1);
      if (t < 0.3) ring(r * 0.15, '#ffffff');
    } else {
      ring(r, PAL.smoke2); ring(r * 0.7, PAL.smoke1); ring(r * 0.35, PAL.fire4);
    }
    // debris pixels
    const rng = makeRng(90 + f * 31);
    for (let i = 0; i < 10; i++) {
      const a = rng() * 6.28, d = r * (0.8 + rng() * 0.5);
      px(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d, rng() < 0.5 ? PAL.fire2 : PAL.smoke2);
    }
    frames.push(c);
  }
  return frames;
}

function puffFrames() {
  const frames = [];
  for (let f = 0; f < 3; f++) {
    const [c, g] = makeCanvas(12, 12);
    const r = 2 + f * 1.7;
    g.fillStyle = f < 2 ? PAL.fire2 : PAL.smoke1;
    g.beginPath(); g.arc(6, 6, r, 0, 7); g.fill();
    g.fillStyle = f < 1 ? PAL.fire1 : PAL.smoke2;
    g.beginPath(); g.arc(6, 5, r * 0.5, 0, 7); g.fill();
    frames.push(c);
  }
  return frames;
}

function muzzleFrame() {
  const [c, g] = makeCanvas(8, 8);
  px(g, 3, 1, PAL.fire1, 2, 5);
  px(g, 1, 3, PAL.fire1, 6, 2);
  px(g, 3, 3, '#ffffff', 2, 2);
  return c;
}

function shellSprite() {
  const [c, g] = makeCanvas(6, 6);
  px(g, 2, 1, PAL.fire1, 2, 3);
  px(g, 2, 4, PAL.fire2, 2, 1);
  return c;
}

function rocketSprite() {
  const [c, g] = makeCanvas(8, 8);
  px(g, 3, 0, PAL.steel1, 2, 4);
  px(g, 3, 4, PAL.fire2, 2, 2);
  px(g, 3, 6, PAL.fire1, 2, 1);
  return c;
}

function smokeFrames() {
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const [c, g] = makeCanvas(14, 14);
    const rng = makeRng(500 + f * 13);
    for (let i = 0; i < 6; i++) {
      const x = 3 + rng() * 7, y = 10 - f * 2.4 - rng() * 3;
      const r = 1.5 + rng() * (1 + f * 0.5);
      g.fillStyle = i % 2 ? PAL.smoke1 : PAL.smoke2;
      g.globalAlpha = 0.85 - f * 0.16;
      g.beginPath(); g.arc(x, Math.max(2, y), r, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    frames.push(c);
  }
  return frames;
}

// ------------------------------------------------------------------ logo ---

export function drawTitleLogo(canvas) {
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  const W = canvas.width, H = canvas.height;
  g.fillStyle = '#0b0b0f'; g.fillRect(0, 0, W, H);
  // storm sky bands
  for (let y = 0; y < 70; y += 2) {
    g.fillStyle = y % 4 ? '#16121c' : '#1c1524';
    g.fillRect(0, y, W, 2);
  }
  // horizon glow
  for (let i = 0; i < 8; i++) {
    g.fillStyle = `rgba(200,60,30,${0.05 + i * 0.02})`;
    g.fillRect(0, 96 - i * 3, W, 3);
  }
  g.fillStyle = '#111'; g.fillRect(0, 100, W, H - 100);
  // silhouetted skyline + tanks
  g.fillStyle = '#070709';
  for (let i = 0; i < 12; i++) {
    const bw = 12 + ((i * 37) % 24), bh = 12 + ((i * 53) % 30);
    g.fillRect(8 + i * 26, 100 - bh, bw, bh);
  }
  g.fillStyle = '#050507';
  for (const tx of [40, 150, 250]) {
    g.fillRect(tx, 112, 30, 9);
    g.fillRect(tx + 8, 106, 13, 7);
    g.fillRect(tx + 14, 102, 14, 3);
  }
  // big blocky title
  const word = (txt, x, y, size, fill, shadow) => {
    g.font = `bold ${size}px monospace`;
    g.textBaseline = 'top';
    g.fillStyle = shadow; g.fillText(txt, x + 2, y + 3);
    g.fillStyle = fill; g.fillText(txt, x, y);
  };
  word('IRON', 66, 18, 42, '#e0a83a', '#5c3612');
  word('CURTAIN', 42, 56, 42, '#c23a2a', '#4a120c');
  g.fillStyle = '#e8dcc0';
  g.font = 'bold 10px monospace';
  g.fillText('A COLD-WAR RTS HOMAGE', 84, 132);
  // lightning bolt accent
  g.fillStyle = '#bfe8ff';
  g.beginPath();
  g.moveTo(160, 4); g.lineTo(150, 26); g.lineTo(158, 26); g.lineTo(146, 50);
  g.lineTo(166, 22); g.lineTo(157, 22); g.lineTo(168, 4); g.closePath();
  g.fill();
}

// ------------------------------------------------------------ atlas build --

export function buildSprites() {
  const S = {};

  // terrain
  S.grass = [grassTile(1), grassTile(2), grassTile(3), grassTile(4)];
  S.dirt = [dirtTile(11), dirtTile(12)];
  S.water = [waterTile(21, 0), waterTile(21, 1)];
  S.rock = [rockTile(31), rockTile(32)];
  S.tree = [treeTile(41), treeTile(42), treeTile(43)];
  S.ore = [oreOverlay(1), oreOverlay(2), oreOverlay(3)];
  S.scorch = scorchDecal();
  S.shore = (base, mask) => shoreTile(base, mask);

  // faction-tinted body sets
  const factions = { player: HOUSE.player, enemy: HOUSE.enemy };
  const facingsOf = (base) => {
    const arr = [];
    for (let f = 0; f < FACINGS; f++) arr.push(rotatedCopy(base, f * Math.PI * 2 / FACINGS));
    return arr;
  };

  S.units = {};
  for (const [house, colors] of Object.entries(factions)) {
    const tint = (c) => houseRecolor(c, colors);
    S.units[house] = {
      lightTank: { hull: facingsOf(tint(lightTankHull())), turret: facingsOf(tint(lightTankTurret())) },
      heavyTank: { hull: facingsOf(tint(heavyTankHull())), turret: facingsOf(tint(heavyTankTurret())) },
      harvester: { hull: facingsOf(tint(harvesterHull())) },
      mcv: { hull: facingsOf(tint(mcvHull())) },
      rifle: { frames: soldierFrames('rifle').map((f) => facingsOf(tint(f))) },
      rocket: { frames: soldierFrames('rocket').map((f) => facingsOf(tint(f))) },
    };
  }

  S.buildings = {};
  const bsprites = {
    conyard: conYardSprite(), power: powerPlantSprite(), refinery: refinerySprite(),
    barracks: barracksSprite(), factory: factorySprite(), radar: radarSprite(),
    guard: guardTowerSprite(), tesla: teslaSprite(), silo: siloSprite(),
  };
  for (const [house, colors] of Object.entries(factions)) {
    S.buildings[house] = {};
    for (const [k, spr] of Object.entries(bsprites)) {
      S.buildings[house][k] = houseRecolor(spr, colors);
    }
  }
  S.guardGun = {};
  for (const [house, colors] of Object.entries(factions)) {
    S.guardGun[house] = facingsOf(houseRecolor(guardTowerGun(), colors));
  }

  // fx
  S.explosion = explosionFrames();
  S.puff = puffFrames();
  S.muzzle = muzzleFrame();
  S.shell = shellSprite();
  S.rocket = rocketSprite();
  S.smoke = smokeFrames();

  return S;
}

// ------------------------------------------------------------- cameo icons --

// 64x48 sidebar icons in the classic cameo proportion: sprite on a dark
// gradient plate with a caption strip (caption drawn by DOM, not here).
export function makeCameo(sprite, label, scale = 1) {
  const [c, g] = makeCanvas(64, 48);
  const grad = g.createLinearGradient(0, 0, 0, 48);
  grad.addColorStop(0, '#3a4048'); grad.addColorStop(1, '#181c22');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 48);
  // faint grid
  g.fillStyle = 'rgba(255,255,255,0.045)';
  for (let x = 0; x < 64; x += 8) g.fillRect(x, 0, 1, 48);
  for (let y = 0; y < 48; y += 8) g.fillRect(0, y, 64, 1);
  if (sprite) {
    const sw = sprite.width * scale, sh = sprite.height * scale;
    const fit = Math.min(56 / sw, 40 / sh, 2.2);
    const w = Math.max(8, Math.floor(sw * fit)), h = Math.max(8, Math.floor(sh * fit));
    g.imageSmoothingEnabled = false;
    g.drawImage(sprite, (64 - w) / 2, (44 - h) / 2, w, h);
  }
  outlineRect(g, 0, 0, 64, 48, '#0a0a0a');
  return c;
}
