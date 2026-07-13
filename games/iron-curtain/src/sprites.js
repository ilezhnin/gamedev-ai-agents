// All in-game art, generated at boot: terrain tiles, buildings, vehicles,
// infantry, effects and sidebar cameo icons. Original pixel work in a
// 16-bit console spirit — chunky shapes, hard ink outlines, dithered shading.

import {
  PAL, HOUSE, makeCanvas, px, drawMap, dither, bevelRect, outlineRect,
  rotatedCopy, houseRecolor, makeRng, shadeColor, hexToRgb,
} from './palette.js';

export const TILE = 24;          // world pixels per map cell
export const FACINGS = 16;       // rotation steps for vehicles/turrets

// ---------------------------------------------------------------- terrain --
// Three biomes share the same tile grammar with different dressing:
//   forest — temperate greens · taiga — snowfields and pines ·
//   desert — sun-baked wasteland with acacias

export const BIOMES = {
  forest: {
    ground: ['#4e7a34', '#46702e', '#568540', '#679a4b'],
    dirt: ['#8a6f42', '#7c6339', '#98804f'],
    fringe: ['#c2a366', '#b3945a'],
    rock: ['#6f6a62', '#5a564f', '#87817a', '#a09a90'],
    waterTint: null,
  },
  taiga: {
    ground: ['#cfdce4', '#c0cfd9', '#dde8ee', '#f0f7fb'],
    dirt: ['#7d8790', '#6d7680', '#8f99a2'],
    fringe: ['#eef5f9', '#d7e4ec'],
    rock: ['#5e6670', '#4c545e', '#788089', '#eef5f9'],
    waterTint: '#2a5f8e',
  },
  desert: {
    ground: ['#d3b878', '#c4a768', '#e0c78c', '#b99b5e'],
    dirt: ['#a98e58', '#987e4c', '#b89c66'],
    fringe: ['#8f7448', '#7d653e'],
    rock: ['#8a6a52', '#745642', '#a08066', '#bd9b80'],
    waterTint: null,
  },
};

function groundTile(seed, biome) {
  const B = BIOMES[biome];
  const [c, g] = makeCanvas(TILE, TILE);
  const rng = makeRng(seed);
  px(g, 0, 0, B.ground[0], TILE, TILE);
  for (let i = 0; i < 46; i++) {
    const x = (rng() * TILE) | 0, y = (rng() * TILE) | 0;
    const r = rng();
    px(g, x, y, r < 0.42 ? B.ground[1] : r < 0.8 ? B.ground[2] : B.ground[3]);
  }
  // sparse blades / tufts / pebbles
  for (let i = 0; i < 5; i++) {
    const x = (rng() * (TILE - 2)) | 0, y = (rng() * (TILE - 3)) | 0;
    px(g, x, y + 1, B.ground[3]); px(g, x, y, B.ground[2]);
  }
  return c;
}

function dirtTile(seed, biome) {
  const B = BIOMES[biome];
  const [c, g] = makeCanvas(TILE, TILE);
  const rng = makeRng(seed);
  px(g, 0, 0, B.dirt[0], TILE, TILE);
  for (let i = 0; i < 40; i++) {
    const x = (rng() * TILE) | 0, y = (rng() * TILE) | 0;
    const r = rng();
    px(g, x, y, r < 0.5 ? B.dirt[1] : B.dirt[2], 1 + (r < .2 ? 1 : 0), 1);
  }
  if (biome === 'desert') {
    // cracked-earth lines
    for (let i = 0; i < 4; i++) {
      let x = (rng() * TILE) | 0, y = (rng() * TILE) | 0;
      for (let s = 0; s < 6; s++) {
        px(g, x, y, B.dirt[1]);
        x += rng() < 0.5 ? 1 : -1; y += 1;
        if (x < 0 || x >= TILE || y >= TILE) break;
      }
    }
  }
  return c;
}

function waterTile(seed, frame, biome) {
  const B = BIOMES[biome];
  const [c, g] = makeCanvas(TILE, TILE);
  const rng = makeRng(seed + frame * 977);
  px(g, 0, 0, B.waterTint || PAL.water1, TILE, TILE);
  for (let i = 0; i < 26; i++) {
    const x = (rng() * TILE) | 0, y = (rng() * TILE) | 0;
    px(g, x, y, rng() < 0.6 ? PAL.water2 : PAL.water3, 2, 1);
  }
  for (let i = 0; i < 6; i++) {
    const x = (rng() * (TILE - 3)) | 0, y = (rng() * TILE) | 0;
    px(g, x + ((frame + i) % 2), y, PAL.waterHi, 2, 1);
  }
  if (biome === 'taiga') {
    // drifting ice floes
    for (let i = 0; i < 4; i++) {
      const x = (rng() * (TILE - 5)) | 0, y = (rng() * (TILE - 3)) | 0;
      px(g, x, y, '#dbe8f0', 3 + (rng() * 3 | 0), 2);
      px(g, x, y, '#f2f9fd', 2, 1);
    }
  }
  return c;
}

function shoreTile(base, mask, biome) {
  // mask bits: 1=N,2=E,4=S,8=W water neighbour -> fringe on that edge
  const [f1, f2] = BIOMES[biome].fringe;
  const [c, g] = makeCanvas(TILE, TILE);
  g.drawImage(base, 0, 0);
  const w = TILE;
  if (mask & 1) { dither(g, 0, 0, w, 2, f1, f2); px(g, 0, 2, f2, w, 1); }
  if (mask & 4) { dither(g, 0, w - 2, w, 2, f1, f2); px(g, 0, w - 3, f2, w, 1); }
  if (mask & 8) { dither(g, 0, 0, 2, w, f1, f2); px(g, 2, 0, f2, 1, w); }
  if (mask & 2) { dither(g, w - 2, 0, 2, w, f1, f2); px(g, w - 3, 0, f2, 1, w); }
  return c;
}

// Grass<->dirt auto-edge: a 2px scuffed-dirt fringe drawn on a GRASS tile
// wherever it borders DIRT, so the biome floor reads as a blended surface
// instead of hard seams. Same mask convention as shoreTile.
function edgeTile(base, mask, biome) {
  const B = BIOMES[biome];
  const a = B.dirt[0], b = B.dirt[1];
  const [c, g] = makeCanvas(TILE, TILE);
  g.drawImage(base, 0, 0);
  const w = TILE;
  // sparse checker melts the inner row into the grass beneath
  const checker = (x, y, ww, hh) => {
    for (let j = 0; j < hh; j++)
      for (let i = 0; i < ww; i++)
        if ((x + i + y + j) & 1) px(g, x + i, y + j, b);
  };
  if (mask & 1) { dither(g, 0, 0, w, 1, a, b); checker(0, 1, w, 1); }
  if (mask & 4) { dither(g, 0, w - 1, w, 1, a, b); checker(0, w - 2, w, 1); }
  if (mask & 8) { dither(g, 0, 0, 1, w, a, b); checker(1, 0, 1, w); }
  if (mask & 2) { dither(g, w - 1, 0, 1, w, a, b); checker(w - 2, 0, 1, w); }
  return c;
}

function rockTile(seed, biome) {
  const B = BIOMES[biome];
  const [c, g] = makeCanvas(TILE, TILE);
  g.drawImage(groundTile(seed ^ 0x5f5, biome), 0, 0);
  const rng = makeRng(seed);
  const n = 2 + (rng() * 2 | 0);
  for (let i = 0; i < n; i++) {
    const cx = 4 + rng() * (TILE - 9), cy = 4 + rng() * (TILE - 9);
    const r = 3 + rng() * 4;
    g.fillStyle = B.rock[1];
    g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
    g.fillStyle = B.rock[0];
    g.beginPath(); g.arc(cx - 1, cy - 1, r - 1, 0, 7); g.fill();
    px(g, cx - r * 0.5, cy - r * 0.6, B.rock[3], 2, 1);
    px(g, cx + 1, cy - 1, B.rock[2], 2, 2);
  }
  return c;
}

function treeTile(seed, biome) {
  const [c, g] = makeCanvas(TILE, TILE);
  g.drawImage(groundTile(seed ^ 0xabc, biome), 0, 0);
  const rng = makeRng(seed);
  const cx = 11 + (rng() * 3 | 0), cy = 12 + (rng() * 2 | 0);
  g.fillStyle = PAL.shadow;
  g.beginPath(); g.ellipse(cx + 1, cy + 6, 7, 3, 0, 0, 7); g.fill();

  if (biome === 'taiga') {
    // snow-dusted pine: stacked triangles
    px(g, cx - 1, cy + 4, PAL.trunk, 2, 3);
    const layer = (w, y, col) => {
      for (let i = 0; i < w; i++) px(g, cx - (w >> 1) + i, y, col);
    };
    for (let l = 0; l < 5; l++) {
      const w = 11 - l * 2, y = cy + 3 - l * 2;
      layer(w + 2, y + 1, PAL.ink);
      layer(w, y, l % 2 ? '#1d3b2a' : '#2a523a');
      layer(Math.max(1, w - 4), y - 1, '#e8f2f8'); // snow line
    }
    px(g, cx, cy - 7, '#f4fafd', 1, 2);
  } else if (biome === 'desert') {
    // flat-top acacia
    px(g, cx - 1, cy, PAL.trunk, 1, 7);
    px(g, cx + 1, cy + 2, PAL.trunk, 1, 5);
    px(g, cx, cy + 1, '#4a3620', 1, 6);
    g.fillStyle = PAL.ink;
    g.beginPath(); g.ellipse(cx, cy - 2, 9, 4, 0, 0, 7); g.fill();
    g.fillStyle = '#6a7a3a';
    g.beginPath(); g.ellipse(cx, cy - 2, 8, 3, 0, 0, 7); g.fill();
    g.fillStyle = '#7e9048';
    g.beginPath(); g.ellipse(cx - 2, cy - 3, 5, 2, 0, 0, 7); g.fill();
    px(g, cx - 4, cy - 4, '#93a659', 3, 1);
  } else {
    // temperate leafy canopy
    px(g, cx - 1, cy + 3, PAL.trunk, 2, 4);
    const blob = (bx, by, r, col) => {
      g.fillStyle = col; g.beginPath(); g.arc(bx, by, r, 0, 7); g.fill();
    };
    blob(cx, cy, 8, PAL.ink);
    blob(cx, cy, 7, PAL.tree2);
    blob(cx - 2, cy - 2, 5, PAL.tree1);
    blob(cx - 3, cy - 3, 3, PAL.tree3);
    px(g, cx - 4, cy - 5, PAL.treeHi, 2, 1);
    px(g, cx + 2, cy - 2, PAL.tree3, 2, 2);
  }
  return c;
}

// crumbled ruin doodad: a broken stone hut, biome-tinted, sits on ground
function ruinTile(seed, biome) {
  const [c, g] = makeCanvas(TILE, TILE);
  g.drawImage(groundTile(seed ^ 0x9e1, biome), 0, 0);
  const rng = makeRng(seed);
  const B = BIOMES[biome];
  const wall = B.rock[2], wallHi = B.rock[3], wallD = B.rock[1], ink = PAL.ink;
  const x0 = 4 + (rng() * 2 | 0), y0 = 4 + (rng() * 2 | 0);
  const w = 12 + (rng() * 4 | 0), h = 12 + (rng() * 4 | 0);
  // rubble-strewn floor
  g.fillStyle = PAL.shadow; g.fillRect(x0 + 1, y0 + 2, w, h);
  // broken perimeter: stone blocks with random missing chunks
  const seg = (x, y) => {
    if (rng() < 0.32) return;
    px(g, x, y, ink, 3, 3);
    px(g, x, y, wall, 2, 2);
    px(g, x, y, wallHi, 1, 1);
  };
  for (let x = x0; x < x0 + w; x += 3) { seg(x, y0); seg(x, y0 + h - 2); }
  for (let y = y0; y < y0 + h; y += 3) { seg(x0, y); seg(x0 + w - 2, y); }
  // toppled interior rubble
  for (let i = 0; i < 4; i++) {
    const rx = (x0 + 3 + rng() * (w - 6)) | 0, ry = (y0 + 3 + rng() * (h - 6)) | 0;
    px(g, rx, ry, ink, 3, 2);
    px(g, rx, ry, wallD, 2, 1);
    px(g, rx + 1, ry, wallHi);
  }
  return c;
}

// frozen shore ice: pale cracked sheet used near taiga water edges
function iceTile(seed, frame) {
  const [c, g] = makeCanvas(TILE, TILE);
  const rng = makeRng(seed + frame * 331);
  px(g, 0, 0, '#bcd4e2', TILE, TILE);
  for (let i = 0; i < 20; i++) {
    const x = (rng() * TILE) | 0, y = (rng() * TILE) | 0;
    px(g, x, y, rng() < 0.5 ? '#a8c4d6' : '#d9ebf4', 2, 1);
  }
  for (let i = 0; i < 3; i++) {
    let x = (rng() * TILE) | 0, y = (rng() * TILE) | 0;
    for (let s = 0; s < 7; s++) {
      px(g, x, y, '#8fb0c6');
      x += rng() < 0.5 ? 1 : -1; y += 1;
      if (x < 0 || x >= TILE || y >= TILE) break;
    }
  }
  for (let i = 0; i < 4; i++) px(g, (rng() * (TILE - 3)) | 0, (rng() * TILE) | 0, '#f2f9fd', 2, 1);
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

function gemOverlay(density) { // density 1..3
  const [c, g] = makeCanvas(TILE, TILE);
  const rng = makeRng(3000 + density * 131);
  const L = { k: '#0d3644', d: '#176a86', m: '#2e98b8', l: '#6fe0e8', w: '#e8fbff' };
  const big = [
    '..k..',
    '.kmk.',
    'kmlwk',
    '.kmk.',
    '..k..'];
  const small = [
    '.k.',
    'klk',
    '.k.'];
  const n = 2 + density * 2;
  for (let i = 0; i < n; i++) {
    const useBig = rng() < 0.5 + density * 0.15;
    const rows = useBig ? big : small;
    const x = 1 + (rng() * (TILE - 6)) | 0, y = 1 + (rng() * (TILE - 6)) | 0;
    drawMap(g, rows, L, x, y);
    if (useBig && rng() < 0.6) px(g, x + 1, y + 1, L.d);
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

// armoured personnel carrier: a boxy troop hull with side tracks, a roof
// hatch and a small pintle MG poking forward. No turret — drawn facing north.
function apcHull() {
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
function artilleryHull() {
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
function rocketTruckHull() {
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
function behemothHull() {
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

function behemothTurret() {
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

// -------------------------------------------------------------- infantry ---

// tiny 12x12 soldiers, drawn facing north; 2 walk frames + fire frame
function soldierFrames(kind) {
  // kind: 'rifle' | 'rocket'
  const mk = (pose) => {
    const [c, g] = makeCanvas(12, 12);
    const L = {
      k: PAL.ink, s: PAL.skin, b: PAL.boots,
      u: HN[1], U: HN[2], g: PAL.gun2, G: PAL.gun1, r: PAL.fire3,
      y: PAL.fire1, x: PAL.steel2,   // hardhat + toolbox for engineers
    };
    let rows;
    if (kind === 'engineer') {
      // unarmed sapper: yellow hardhat, tool case at the hip
      if (pose === 1) rows = [ // walk B
        '............',
        '...yyyy.....',
        '..kyssyk....',
        '...kUUk.....',
        '..kUUUUk....',
        '..kUUUUx....',
        '..kuUUux....',
        '...kuuk.....',
        '..kb.uk.....',
        '.....kbk....',
        '............',
        '............'];
      else rows = [ // stand / work
        '............',
        '...yyyy.....',
        '..kyssyk....',
        '...kUUk.....',
        '..kUUUUk....',
        '..kUUUUx....',
        '..kuUUux....',
        '...kuuk.....',
        '...kuuk.....',
        '..kb..bk....',
        '............',
        '............'];
    } else if (kind === 'rifle') {
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
function radarDishFrames() {
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

// short-lived flame projectile: a 3-frame orange puff stream
function flameFrames() {
  const frames = [];
  for (let f = 0; f < 3; f++) {
    const [c, g] = makeCanvas(12, 12);
    const r = 3 + f * 1.2;
    g.fillStyle = PAL.fire4; g.beginPath(); g.arc(6, 6, r + 1, 0, 7); g.fill();
    g.fillStyle = PAL.fire3; g.beginPath(); g.arc(6, 6, r, 0, 7); g.fill();
    g.fillStyle = PAL.fire2; g.beginPath(); g.arc(6, 6 - f * 0.5, r * 0.6, 0, 7); g.fill();
    g.fillStyle = PAL.fire1; g.beginPath(); g.arc(6, 5, r * 0.3, 0, 7); g.fill();
    const rng = makeRng(700 + f * 17);
    for (let i = 0; i < 5; i++) px(g, 3 + rng() * 6, 2 + rng() * 7, i % 2 ? PAL.fire1 : PAL.fire2);
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

// Tiny rally-point flag: a dark pole with a gold pennant, drawn at the
// destination cell of a selected factory/barracks so the player can see
// where fresh units will muster.
function flagSprite() {
  const [c, g] = makeCanvas(12, 16);
  // shadow under the pole
  px(g, 3, 15, PAL.shadow, 5, 1);
  // pole
  px(g, 3, 1, PAL.ink, 1, 14);
  px(g, 4, 1, '#8f8065', 1, 14);
  // pennant, notched at the fly end
  const gold = PAL.ore1, goldHi = PAL.oreHi, red = '#c23a2a';
  px(g, 5, 1, PAL.ink, 6, 7);
  px(g, 5, 2, gold, 5, 5);
  px(g, 5, 2, goldHi, 5, 1);
  px(g, 5, 3, red, 4, 1);
  px(g, 9, 3, gold, 1, 3);
  // triangular notch on the flying edge
  px(g, 8, 2, PAL.ink, 1, 1);
  px(g, 7, 6, PAL.ink, 3, 1);
  return c;
}

// ------------------------------------------------------------------ logo ---

// Deterministic lightning schedule: 0 (calm) .. 1 (bright flash). A short
// double-blink recurs a few seconds apart so the title feels alive without
// ever settling into a distracting strobe.
function lightningLevel(t) {
  const period = 4.1;
  const p = ((t % period) + period) % period;
  if (p < 0.07) return 1;
  if (p > 0.13 && p < 0.19) return 0.6;
  return 0;
}

// The title logo doubles as an animated backdrop. Pass a seconds value `t`
// (default 0 for the static first paint) to drift the cloud bands and fire
// the occasional lightning flicker. Redraw at ~10fps while the title shows.
export function drawTitleLogo(canvas, t = 0) {
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  const W = canvas.width, H = canvas.height;
  const flash = lightningLevel(t);
  g.fillStyle = '#0b0b0f'; g.fillRect(0, 0, W, H);
  // storm sky bands (lift toward violet-white during a flash)
  for (let y = 0; y < 70; y += 2) {
    const base = y % 4 ? 0x16121c : 0x1c1524;
    if (flash) {
      const r = ((base >> 16) & 255) + flash * 70;
      const gg = ((base >> 8) & 255) + flash * 60;
      const b = (base & 255) + flash * 80;
      g.fillStyle = `rgb(${r | 0},${gg | 0},${b | 0})`;
    } else g.fillStyle = y % 4 ? '#16121c' : '#1c1524';
    g.fillRect(0, y, W, 2);
  }
  // slow drifting cloud bands — two layers at different speeds, wrapping
  const band = (yTop, h, speed, alpha) => {
    g.fillStyle = `rgba(60,52,74,${alpha})`;
    const off = ((t * speed) % (W + 64)) - 64;
    for (let k = -1; k < 6; k++) {
      const x = off + k * 84;
      g.fillRect(x, yTop, 52, h);
      g.fillRect(x + 14, yTop - 2, 26, h + 4);
    }
  };
  band(20, 6, 7, 0.16 + flash * 0.25);
  band(44, 5, 12, 0.12 + flash * 0.25);
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
  // lightning bolt accent — glows brighter on a flash
  g.fillStyle = flash ? '#ffffff' : '#bfe8ff';
  g.beginPath();
  g.moveTo(160, 4); g.lineTo(150, 26); g.lineTo(158, 26); g.lineTo(146, 50);
  g.lineTo(166, 22); g.lineTo(157, 22); g.lineTo(168, 4); g.closePath();
  g.fill();
  // version tag, bottom-right
  g.fillStyle = '#6d6455';
  g.font = 'bold 9px monospace';
  g.textAlign = 'right';
  g.fillText('v0.2', W - 5, H - 12);
  g.textAlign = 'left';
}

// --------------------------------------------------------- unit life fx ---

// Track/wheel shimmer: post-process a tinted hull so the tread highlights
// (PAL.treadHi over PAL.tread) shift down one row. Alternating this "B" hull
// with the base "A" hull at ~8fps while moving sells rolling treads without a
// second hand-drawn frame. Operates before rotation (tread colours are never
// house-recoloured, so they survive houseRecolor untouched).
function treadShift(src) {
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
function harvSpinFrames() {
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

// Battle-damage decal: procedural cracks + soot on a transparent footprint
// canvas, drawn as an extra quad over a building below 50% hp. Two variants
// per footprint size keep repeats from looking stamped.
function crackOverlay(wT, hT, seed) {
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

// Veterancy rank pips: 1-2 tiny gold chevrons with an ink outline, worn
// above a ranked unit's health bar. Index 0 = rank1 (one), 1 = rank2 (two).
function rankChevrons() {
  const mk = (n) => {
    const [c, g] = makeCanvas(14, 10);
    const chevron = (oy) => {
      // an ink-outlined gold "^" a few pixels wide
      for (let i = 0; i < 4; i++) {
        px(g, 3 + i, oy + i, PAL.ink);
        px(g, 10 - i, oy + i, PAL.ink);
      }
      for (let i = 0; i < 3; i++) {
        px(g, 4 + i, oy + i, PAL.ore1);
        px(g, 9 - i, oy + i, PAL.ore1);
      }
      px(g, 6, oy, PAL.oreHi, 2, 1);
    };
    if (n === 1) chevron(3);
    else { chevron(0); chevron(5); }
    return c;
  };
  return [mk(1), mk(2)];
}

// EMP shock ring: concentric electric-blue rings on transparent, scaled up
// and faded by the renderer over ~0.7s when a blast lands.
function empRingSprite() {
  const S = 64;
  const [c, g] = makeCanvas(S, S);
  const cx = S / 2, cy = S / 2;
  for (const [r, col, lw] of [[30, PAL.zap, 3], [22, PAL.zapCore, 2], [14, PAL.zap, 2]]) {
    g.strokeStyle = col; g.lineWidth = lw;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  }
  // a few radial sparks
  const rng = makeRng(8123);
  for (let i = 0; i < 10; i++) {
    const a = rng() * Math.PI * 2, d = 24 + rng() * 6;
    px(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d, PAL.zapCore, 2, 2);
  }
  return c;
}

// Commander-power cameo glyphs (48x36): recon sweep (radar arcs) + EMP bolt.
function powerIcon(kind) {
  const [c, g] = makeCanvas(48, 36);
  const grad = g.createLinearGradient(0, 0, 0, 36);
  grad.addColorStop(0, '#2a3038'); grad.addColorStop(1, '#12161c');
  g.fillStyle = grad; g.fillRect(0, 0, 48, 36);
  if (kind === 'recon') {
    // sweeping radar arcs from the bottom-left origin
    g.strokeStyle = '#7fe08a'; g.lineWidth = 2;
    for (const r of [10, 17, 24]) { g.beginPath(); g.arc(12, 28, r, -Math.PI / 2, 0); g.stroke(); }
    g.fillStyle = '#bfe8ff';
    g.beginPath(); g.moveTo(12, 28); g.lineTo(34, 12); g.lineTo(36, 16); g.closePath(); g.fill();
    px(g, 11, 27, '#eafff0', 3, 3);
  } else {
    // jagged EMP bolt inside a broken ring
    g.strokeStyle = '#5f8fd0'; g.lineWidth = 2;
    g.beginPath(); g.arc(24, 18, 13, 0.6, Math.PI * 2 - 0.6); g.stroke();
    g.fillStyle = '#bfe8ff';
    g.beginPath();
    g.moveTo(26, 6); g.lineTo(19, 19); g.lineTo(24, 19); g.lineTo(20, 30);
    g.lineTo(31, 15); g.lineTo(25, 15); g.lineTo(30, 6); g.closePath(); g.fill();
    px(g, 23, 8, '#ffffff', 2, 2);
  }
  outlineRect(g, 0, 0, 48, 36, '#0a0a0a');
  return c;
}

// A soft dark ground shadow for units — one shared ellipse, scaled per unit.
function unitShadowSprite() {
  const [c, g] = makeCanvas(24, 14);
  g.fillStyle = 'rgba(0,0,0,1)';
  g.beginPath(); g.ellipse(12, 7, 10, 5, 0, 0, 7); g.fill();
  return c;
}

// Tiny ember/debris chip flung by big explosions.
function debrisSprite() {
  const [c, g] = makeCanvas(3, 3);
  px(g, 0, 0, PAL.fire2, 2, 2);
  px(g, 0, 0, PAL.fire1);
  px(g, 1, 1, PAL.smoke2);
  return c;
}

// A large soft cloud-shadow blob that drifts over the terrain. Radial alpha
// falloff so the edges are feathered; the caller keeps opacity very low.
function cloudShadowSprite(seed) {
  const S = 128;
  const [c, g] = makeCanvas(S, S);
  const rng = makeRng(seed);
  // a few overlapping radial gradients make an organic, non-circular blob
  for (let i = 0; i < 5; i++) {
    const cx = S / 2 + (rng() - 0.5) * 46, cy = S / 2 + (rng() - 0.5) * 32;
    const r = 26 + rng() * 26;
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, 'rgba(0,0,0,0.34)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
  }
  return c;
}

// ------------------------------------------------------------ atlas build --

export function buildSprites() {
  const S = {};

  // terrain per biome
  S.tiles = {};
  for (const biome of Object.keys(BIOMES)) {
    S.tiles[biome] = {
      ground: [1, 2, 3, 4].map((s) => groundTile(s, biome)),
      dirt: [11, 12].map((s) => dirtTile(s, biome)),
      water: [0, 1, 2, 3].map((f) => waterTile(21, f, biome)),
      rock: [31, 32].map((s) => rockTile(s, biome)),
      tree: [41, 42, 43].map((s) => treeTile(s, biome)),
      ruin: [51, 52, 53].map((s) => ruinTile(s, biome)),
    };
    // frozen taiga shores get a separate ice sheet tile set
    if (biome === 'taiga') S.tiles[biome].ice = [iceTile(61, 0), iceTile(61, 1)];
  }
  S.ore = [oreOverlay(1), oreOverlay(2), oreOverlay(3)];
  S.gem = [gemOverlay(1), gemOverlay(2), gemOverlay(3)];
  S.scorch = scorchDecal();
  S.shore = (base, mask, biome) => shoreTile(base, mask, biome);
  S.edge = (base, mask, biome) => edgeTile(base, mask, biome);

  // faction-tinted body sets
  const factions = {
    player: HOUSE.player, enemy: HOUSE.enemy,
    enemy2: HOUSE.enemy2, enemy3: HOUSE.enemy3,
  };
  const facingsOf = (base) => {
    const arr = [];
    for (let f = 0; f < FACINGS; f++) arr.push(rotatedCopy(base, f * Math.PI * 2 / FACINGS));
    return arr;
  };

  S.units = {};
  for (const [house, colors] of Object.entries(factions)) {
    const tint = (c) => houseRecolor(c, colors);
    // a tracked vehicle: base facings ("hull") + a tread-shifted "hullB" set,
    // alternated at ~8fps by the renderer while the unit is moving
    const veh = (hullFn, turretFn) => {
      const t = tint(hullFn());
      const set = { hull: facingsOf(t), hullB: facingsOf(treadShift(t)) };
      if (turretFn) set.turret = facingsOf(tint(turretFn()));
      return set;
    };
    S.units[house] = {
      lightTank: veh(lightTankHull, lightTankTurret),
      heavyTank: veh(heavyTankHull, heavyTankTurret),
      behemoth: veh(behemothHull, behemothTurret),
      artillery: veh(artilleryHull),
      rocketTruck: veh(rocketTruckHull),
      apc: veh(apcHull),
      harvester: veh(harvesterHull),
      mcv: veh(mcvHull),
      rifle: { frames: soldierFrames('rifle').map((f) => facingsOf(tint(f))) },
      rocket: { frames: soldierFrames('rocket').map((f) => facingsOf(tint(f))) },
      engineer: { frames: soldierFrames('engineer').map((f) => facingsOf(tint(f))) },
    };
  }

  S.buildings = {};
  const bsprites = {
    conyard: conYardSprite(), power: powerPlantSprite(), refinery: refinerySprite(),
    barracks: barracksSprite(), factory: factorySprite(), radar: radarSprite(),
    guard: guardTowerSprite(), tesla: teslaSprite(), silo: siloSprite(),
    flametower: flameTowerSprite(), techcenter: techCenterSprite(), wall: wallSprite(),
    depot: depotSprite(),
  };
  // buildings also tint for the neutral house (supply depots start neutral)
  const bfactions = { ...factions, neutral: HOUSE.neutral };
  for (const [house, colors] of Object.entries(bfactions)) {
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
  S.flame = flameFrames();
  S.smoke = smokeFrames();
  S.flag = flagSprite();
  S.debris = debrisSprite();

  // extra render-only art: rotating radar dish, harvester spinner, unit
  // shadow, damage decals (2 variants per footprint), drifting cloud blobs
  S.radarDish = radarDishFrames();
  S.harvSpin = harvSpinFrames();
  S.unitShadow = unitShadowSprite();
  S.cracks = {};
  for (const [w, h] of [[3, 3], [2, 2], [3, 2], [1, 1]]) {
    S.cracks[`${w}x${h}`] = [
      crackOverlay(w, h, 700 + w * 31 + h * 7),
      crackOverlay(w, h, 1900 + w * 13 + h * 17),
    ];
  }
  S.clouds = [cloudShadowSprite(11), cloudShadowSprite(29), cloudShadowSprite(53)];

  // veterancy chevrons, EMP shock ring, commander-power cameo glyphs
  S.rankChevrons = rankChevrons();
  S.empRing = empRingSprite();
  S.powerIcons = { recon: powerIcon('recon'), emp: powerIcon('emp') };

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
