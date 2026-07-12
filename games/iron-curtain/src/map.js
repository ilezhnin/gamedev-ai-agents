// Tile map: procedural skirmish terrain (grass plains, a river, rock
// outcrops, forests and two ore fields near the start locations).

import { makeRng } from './palette.js';

export const T = { GRASS: 0, DIRT: 1, WATER: 2, ROCK: 3, TREE: 4 };

export class GameMap {
  constructor(size = 64, seed = 7, biome = 'forest', starts = null) {
    this.size = size;
    this.seed = seed;
    this.biome = biome;
    // start locations (cell coords); default: classic SW vs NE duel
    this.starts = starts || [
      { x: Math.round(size * 0.14), y: Math.round(size * 0.82) },
      { x: Math.round(size * 0.82), y: Math.round(size * 0.10) },
    ];
    this.terrain = new Uint8Array(size * size);     // T.*
    this.variant = new Uint8Array(size * size);     // art variant per cell
    this.ore = new Uint16Array(size * size);        // remaining ore value
    this.gem = new Uint8Array(size * size);         // 1 = gem cell (pays double, no regrowth)
    this.oreMax = 280;
    this.blocked = new Uint8Array(size * size);     // 1 = building/static blocker
    this.occupant = new Array(size * size).fill(null); // moving unit reservation
    this.generate();
  }

  idx(x, y) { return y * this.size + x; }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.size && y < this.size; }

  terrainAt(x, y) { return this.inBounds(x, y) ? this.terrain[this.idx(x, y)] : T.WATER; }

  isPassableTerrain(x, y) {
    const t = this.terrainAt(x, y);
    return t === T.GRASS || t === T.DIRT;
  }

  isFree(x, y, ignoreUnit = null) {
    if (!this.inBounds(x, y) || !this.isPassableTerrain(x, y)) return false;
    const i = this.idx(x, y);
    if (this.blocked[i]) return false;
    const occ = this.occupant[i];
    return !occ || occ === ignoreUnit;
  }

  isBuildable(x, y) {
    if (!this.inBounds(x, y) || !this.isPassableTerrain(x, y)) return false;
    const i = this.idx(x, y);
    return !this.blocked[i] && !this.occupant[i] && this.ore[i] === 0;
  }

  generate() {
    const s = this.size;
    const rng = makeRng(this.seed);
    const area = (s * s) / (64 * 64);   // density scale vs the classic 64 map
    // biome dressing densities
    const density = {
      forest: { dirt: 10, rocks: 12, woods: 14 },
      taiga: { dirt: 8, rocks: 16, woods: 9 },
      desert: { dirt: 16, rocks: 14, woods: 4 },
    }[this.biome];

    this.terrain.fill(T.GRASS);
    for (let i = 0; i < s * s; i++) this.variant[i] = (rng() * 4) | 0;

    // winding river across the middle with two fords
    let rx = 6 + rng() * 6;
    for (let y = 0; y < s; y++) {
      rx += (rng() - 0.5) * 2.2;
      rx = Math.max(10, Math.min(s - 10, rx));
      const w = 2 + ((rng() * 2) | 0);
      const cx = (s * 0.52 + (rx - s * 0.5) * 0.6) | 0;
      for (let dx = -w; dx <= w; dx++) {
        const x = cx + dx + ((y * 0.35) | 0) - ((s * 0.17) | 0);
        if (this.inBounds(x, y)) this.terrain[this.idx(x, y)] = T.WATER;
      }
    }
    // fords (bridge-less crossings): carve dirt through the river
    for (const fy of [Math.floor(s * 0.22), Math.floor(s * 0.74)]) {
      for (let y = fy - 2; y <= fy + 2; y++) {
        for (let x = 0; x < s; x++) {
          const i = this.idx(x, y);
          if (this.terrain[i] === T.WATER) this.terrain[i] = T.DIRT;
        }
      }
    }

    // dirt patches
    for (let n = 0; n < Math.round(density.dirt * area); n++) {
      const cx = rng() * s, cy = rng() * s, r = 2 + rng() * 4;
      this.blob(cx, cy, r, (i) => {
        if (this.terrain[i] === T.GRASS) this.terrain[i] = T.DIRT;
      }, rng);
    }

    // rock outcrops
    for (let n = 0; n < Math.round(density.rocks * area); n++) {
      const cx = rng() * s, cy = rng() * s, r = 1 + rng() * 2.2;
      this.blob(cx, cy, r, (i) => {
        if (this.terrain[i] === T.GRASS || this.terrain[i] === T.DIRT) this.terrain[i] = T.ROCK;
      }, rng);
    }

    // woods
    for (let n = 0; n < Math.round(density.woods * area); n++) {
      const cx = rng() * s, cy = rng() * s, r = 1.5 + rng() * 3;
      this.blob(cx, cy, r, (i) => {
        if (this.terrain[i] === T.GRASS && rng() < 0.8) this.terrain[i] = T.TREE;
      }, rng);
    }

    // keep every start zone clear; each base gets a main field toward the
    // centre plus a second patch off to the side
    const cx0 = s / 2, cy0 = s / 2;
    for (const st of this.starts) {
      this.clearZone(st.x - 7, st.y - 6, 15, 13);
      const dx = cx0 - st.x, dy = cy0 - st.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      this.oreField(Math.round(st.x + ux * 9), Math.round(st.y + uy * 9), 6, rng);
      this.oreField(Math.round(st.x - uy * 8 + ux * 3), Math.round(st.y + ux * 8 + uy * 3), 4, rng);
    }
    // contested middle field
    this.oreField(Math.floor(s * 0.5) - 3, Math.floor(s * 0.5), 5, rng);
    // neutral fields scattered around the map, away from the bases
    const extraFields = Math.max(1, Math.round(2 * area));
    for (let n = 0; n < extraFields; n++) {
      for (let tries = 0; tries < 24; tries++) {
        const x = 8 + rng() * (s - 16), y = 8 + rng() * (s - 16);
        if (this.starts.every((st) => Math.hypot(st.x - x, st.y - y) > 18)) {
          this.oreField(x | 0, y | 0, 4 + ((rng() * 2) | 0), rng);
          break;
        }
      }
    }
    // precious gem patches: small, rich (2x value), never regrow
    const gemPatches = Math.max(1, Math.round(1.5 * area));
    for (let n = 0; n < gemPatches; n++) {
      for (let tries = 0; tries < 24; tries++) {
        const x = 8 + rng() * (s - 16), y = 8 + rng() * (s - 16);
        if (this.starts.every((st) => Math.hypot(st.x - x, st.y - y) > 14)) {
          this.gemField(x | 0, y | 0, 2 + ((rng() * 2) | 0), rng);
          break;
        }
      }
    }

    // map edges: rocks to frame the world
    for (let x = 0; x < s; x++) {
      for (const y of [0, s - 1]) if (rng() < 0.5) this.terrain[this.idx(x, y)] = T.ROCK;
    }
    for (let y = 0; y < s; y++) {
      for (const x of [0, s - 1]) if (rng() < 0.5) this.terrain[this.idx(x, y)] = T.ROCK;
    }
  }

  blob(cx, cy, r, fn, rng) {
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) {
      for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
        if (!this.inBounds(x, y)) continue;
        const d = Math.hypot(x - cx, y - cy);
        if (d < r * (0.75 + rng() * 0.5)) fn(this.idx(x, y));
      }
    }
  }

  clearZone(x0, y0, w, h) {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        if (this.inBounds(x, y)) this.terrain[this.idx(x, y)] = T.GRASS;
      }
    }
  }

  oreField(cx, cy, r, rng) {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (!this.inBounds(x, y)) continue;
        const d = Math.hypot(x - cx, y - cy);
        if (d > r) continue;
        const i = this.idx(x, y);
        if (this.terrain[i] !== T.GRASS && this.terrain[i] !== T.DIRT) continue;
        const richness = 1 - d / (r + 1);
        this.ore[i] = Math.round(this.oreMax * (0.5 + 0.5 * richness) * (0.7 + rng() * 0.3));
      }
    }
  }

  gemField(cx, cy, r, rng) {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (!this.inBounds(x, y)) continue;
        const d = Math.hypot(x - cx, y - cy);
        if (d > r) continue;
        const i = this.idx(x, y);
        if (this.terrain[i] !== T.GRASS && this.terrain[i] !== T.DIRT) continue;
        const richness = 1 - d / (r + 1);
        this.ore[i] = Math.round(this.oreMax * (0.6 + 0.4 * richness));
        this.gem[i] = 1;
      }
    }
  }

  oreDensity(x, y) { // 0..3 for art
    const v = this.ore[this.idx(x, y)];
    if (v <= 0) return 0;
    if (v < this.oreMax * 0.34) return 1;
    if (v < this.oreMax * 0.67) return 2;
    return 3;
  }

  // ore regrows like in the classics: existing cells thicken and rich
  // cells occasionally seed a fresh neighbour, so fields sustain mining
  growOre(rng) {
    const s = this.size;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let i = 0; i < s * s; i++) {
      const v = this.ore[i];
      if (v <= 0 || this.gem[i]) continue;   // gems never grow back
      if (v < this.oreMax && rng() < 0.35) {
        this.ore[i] = Math.min(this.oreMax, v + 10);
      }
      if (v > this.oreMax * 0.5 && rng() < 0.03) {
        const [dx, dy] = dirs[(rng() * 4) | 0];
        const x = (i % s) + dx, y = ((i / s) | 0) + dy;
        if (!this.inBounds(x, y)) continue;
        const j = this.idx(x, y);
        if (this.ore[j] === 0 && this.isPassableTerrain(x, y) &&
            !this.blocked[j] && !this.occupant[j]) {
          this.ore[j] = 40;
        }
      }
    }
  }
}
