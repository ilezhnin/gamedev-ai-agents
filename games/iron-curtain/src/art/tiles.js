// Terrain art: the biome tile sets and everything stamped onto the ground —
// ore/gem overlays, shore and grass<->dirt fringes, ruins and scorch decals.
//
// Three biomes share the same tile grammar with different dressing:
//   forest — temperate greens · taiga — snowfields and pines ·
//   desert — sun-baked wasteland with acacias

import { PAL, makeCanvas, px, drawMap, dither, makeRng } from '../palette.js';
import { TILE } from './consts.js';

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

export function groundTile(seed, biome) {
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

export function dirtTile(seed, biome) {
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

export function waterTile(seed, frame, biome) {
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

export function shoreTile(base, mask, biome) {
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
export function edgeTile(base, mask, biome) {
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

export function rockTile(seed, biome) {
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

export function treeTile(seed, biome) {
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
export function ruinTile(seed, biome) {
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
export function iceTile(seed, frame) {
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

export function oreOverlay(density) { // density 1..3
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

export function gemOverlay(density) { // density 1..3
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

export function scorchDecal() {
  const [c, g] = makeCanvas(TILE, TILE);
  const rng = makeRng(4242);
  g.fillStyle = 'rgba(25,24,20,0.75)';
  g.beginPath(); g.ellipse(12, 12, 8, 6, 0, 0, 7); g.fill();
  for (let i = 0; i < 14; i++) {
    px(g, 4 + rng() * 16, 5 + rng() * 13, rng() < .5 ? PAL.scorch : '#33302a');
  }
  return c;
}

// Road overlay: a graded track drawn ON TOP of whatever ground tile is
// underneath, autotiled from its neighbours so segments join up. Mask bits
// match shoreTile (1=N, 2=E, 4=S, 8=W road neighbour). A cell with no
// neighbours reads as a lone patch of hardpack rather than a floating stub.
const ROAD_TONE = {
  forest: { bed: '#8a7f68', worn: '#9c9078', rut: '#6f6551', edge: '#5d5545' },
  taiga:  { bed: '#8d8f92', worn: '#a3a5a8', rut: '#70737a', edge: '#5c5f66' },
  // desert sand is already pale, so its road is packed DARK earth or it
  // vanishes into the ground
  desert: { bed: '#9a8153', worn: '#ab9163', rut: '#786139', edge: '#63502f' },
};

export function roadTile(base, mask, biome) {
  const t = ROAD_TONE[biome] || ROAD_TONE.forest;
  const [c, g] = makeCanvas(TILE, TILE);
  g.drawImage(base, 0, 0);
  const w = TILE, half = w / 2, band = 10, lo = half - band / 2;

  // the surface: a band toward every connected neighbour, plus the junction
  const paveH = (x0, x1) => { px(g, x0, lo, t.bed, x1 - x0, band); };
  const paveV = (y0, y1) => { px(g, lo, y0, t.bed, band, y1 - y0); };
  paveH(lo, lo + band);                        // junction square (always)
  if (mask & 1) paveV(0, half);
  if (mask & 4) paveV(half, w);
  if (mask & 8) paveH(0, half);
  if (mask & 2) paveH(half, w);

  // worn crown + wheel ruts along whichever axes carry traffic
  const rutH = (x0, x1) => {
    px(g, x0, lo + 2, t.rut, x1 - x0, 1);
    px(g, x0, lo + band - 3, t.rut, x1 - x0, 1);
    for (let x = x0; x < x1; x += 2) px(g, x, half - 1, t.worn, 1, 1);
  };
  const rutV = (y0, y1) => {
    px(g, lo + 2, y0, t.rut, 1, y1 - y0);
    px(g, lo + band - 3, y0, t.rut, 1, y1 - y0);
    for (let y = y0; y < y1; y += 2) px(g, half - 1, y, t.worn, 1, 1);
  };
  if (mask & 8) rutH(0, half + 1);
  if (mask & 2) rutH(half - 1, w);
  if (mask & 1) rutV(0, half + 1);
  if (mask & 4) rutV(half - 1, w);
  if (!mask) { rutH(lo, lo + band); }           // isolated patch still reads as road

  // packed shoulders where the surface meets open ground
  if (!(mask & 1)) px(g, lo, lo, t.edge, band, 1);
  if (!(mask & 4)) px(g, lo, lo + band - 1, t.edge, band, 1);
  if (!(mask & 8)) px(g, lo, lo, t.edge, 1, band);
  if (!(mask & 2)) px(g, lo + band - 1, lo, t.edge, 1, band);
  return c;
}
