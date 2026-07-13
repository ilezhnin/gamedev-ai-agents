// Tile map: procedural skirmish terrain (grass plains, a river, rock
// outcrops, forests and two ore fields near the start locations).

import { makeRng, b64ToU8 } from './palette.js';

export const T = { GRASS: 0, DIRT: 1, WATER: 2, ROCK: 3, TREE: 4, RUIN: 5 };

// selectable layout templates; 'random' resolves to one of these per seed
export const LAYOUTS = ['river', 'lakes', 'ridges', 'islands', 'open', 'maze'];
// variant sentinel: near-shore water rendered as ice (taiga flavour)
export const V_ICE = 7;

export class GameMap {
  constructor(size = 64, seed = 7, biome = 'forest', starts = null, layout = 'river') {
    this.size = size;
    this.seed = seed;
    this.biome = biome;
    this.layoutReq = layout;    // requested ('random' resolves at gen time)
    this.layout = layout;       // resolved layout name (set in generate)
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

  // rebuild a map from a serialized snapshot (see Game.serialize). Terrain,
  // ore, gem and variant come straight from the save; blocked/occupant are
  // rebuilt from the entities by Game.load, so we start them empty here.
  static restore(md) {
    const m = Object.create(GameMap.prototype);
    m.size = md.size;
    m.seed = md.seed;
    m.biome = md.biome;
    m.layoutReq = md.layoutReq || md.layout;
    m.layout = md.layout;
    m.starts = (md.starts || []).map((s) => ({ x: s.x, y: s.y }));
    m.oreMax = md.oreMax;
    m.terrain = b64ToU8(md.terrain);
    m.variant = b64ToU8(md.variant);
    const oreBytes = b64ToU8(md.ore);
    m.ore = new Uint16Array(oreBytes.buffer, oreBytes.byteOffset, oreBytes.byteLength / 2);
    m.gem = b64ToU8(md.gem);
    m.blocked = new Uint8Array(m.size * m.size);
    m.occupant = new Array(m.size * m.size).fill(null);
    return m;
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

    // resolve the layout template (seeded when 'random')
    let layout = this.layoutReq;
    if (layout === 'random' || !LAYOUTS.includes(layout)) {
      layout = LAYOUTS[(rng() * LAYOUTS.length) | 0];
    }
    this.layout = layout;

    // lay down the template terrain, then scatter biome dressing on top
    if (layout === 'river') { this.genRiver(rng); this.scatterDressing(rng, density, area, 1); }
    else if (layout === 'lakes') { this.genLakes(rng, area); this.scatterDressing(rng, density, area, 1); }
    else if (layout === 'ridges') { this.genRidges(rng); this.scatterDressing(rng, density, area, 0.55); }
    else if (layout === 'islands') { this.genIslands(rng); this.scatterDressing(rng, density, area, 0.7); }
    else if (layout === 'open') { this.scatterDressing(rng, density, area, 0.3); }
    else if (layout === 'maze') { this.genMaze(rng, area); this.scatterDressing(rng, density, area, 0.15); }

    // biome flavour: canyons / frozen lakes / extra rock
    this.applyBiome(rng, area);
    // scattered ruins (placed before clear zones so bases stay clean)
    this.scatterRuins(rng, area);

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

    // safety net: carve a passable path to any start walled off by terrain
    this.ensureConnectivity();
  }

  // ------------------------------------------------------ layout templates --

  // classic winding river across the middle with two fords
  genRiver(rng) {
    const s = this.size;
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
  }

  // 3-6 irregular seeded lakes, no river
  genLakes(rng, area) {
    const s = this.size;
    const n = 3 + ((rng() * 4) | 0);
    for (let k = 0; k < n; k++) {
      const cx = s * 0.18 + rng() * s * 0.64;
      const cy = s * 0.18 + rng() * s * 0.64;
      const r = 4 + rng() * (5 + area);
      const lobes = 2 + ((rng() * 3) | 0);
      for (let l = 0; l < lobes; l++) {
        const ox = cx + (rng() - 0.5) * r, oy = cy + (rng() - 0.5) * r;
        this.blob(ox, oy, r * (0.5 + rng() * 0.6), (i) => {
          this.terrain[i] = T.WATER;
        }, rng);
      }
    }
  }

  // 2-3 long rock ridges crossing the map, each with 2-3 gaps (chokepoints)
  genRidges(rng) {
    const s = this.size;
    const chains = 2 + ((rng() * 2) | 0);
    for (let c = 0; c < chains; c++) {
      const horiz = rng() < 0.5;
      let p = s * (0.28 + rng() * 0.44);
      const gapCount = 2 + ((rng() * 2) | 0);
      const gaps = [];
      for (let gi = 0; gi < gapCount; gi++) gaps.push(s * (0.12 + rng() * 0.76));
      for (let a = 0; a < s; a++) {
        p += (rng() - 0.5) * 1.6;
        p = Math.max(5, Math.min(s - 5, p));
        if (gaps.some((gp) => Math.abs(a - gp) < 3)) continue;   // leave a chokepoint
        const w = 2 + ((rng() * 2) | 0);
        for (let d = -w; d <= w; d++) {
          const x = horiz ? a : ((p + d) | 0);
          const y = horiz ? ((p + d) | 0) : a;
          if (this.inBounds(x, y)) this.terrain[this.idx(x, y)] = T.ROCK;
        }
      }
    }
  }

  // big central lake with dirt ford causeways connecting the four quadrants
  genIslands(rng) {
    const s = this.size, cx = s / 2, cy = s / 2;
    const R = s * (0.3 + rng() * 0.05);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const d = Math.hypot(x - cx, y - cy) + (rng() - 0.5) * 2;
        if (d < R) this.terrain[this.idx(x, y)] = T.WATER;
      }
    }
    // plus-shaped fords across the lake (dirt bridges)
    const bw = 2;
    for (let a = 0; a < s; a++) {
      for (let d = -bw; d <= bw; d++) {
        const yy = (cy + d) | 0, xx = (cx + d) | 0;
        if (this.inBounds(a, yy) && Math.hypot(a - cx, yy - cy) < R + 2) this.terrain[this.idx(a, yy)] = T.DIRT;
        if (this.inBounds(xx, a) && Math.hypot(xx - cx, a - cy) < R + 2) this.terrain[this.idx(xx, a)] = T.DIRT;
      }
    }
  }

  // dense woodland with carved winding corridors between the starts + centre
  genMaze(rng, area) {
    const s = this.size;
    for (let y = 2; y < s - 2; y++)
      for (let x = 2; x < s - 2; x++) this.terrain[this.idx(x, y)] = T.TREE;
    // hub-and-spoke corridors keep the base reachable before the safety net
    const cx = (s / 2) | 0, cy = (s / 2) | 0;
    for (const st of this.starts) this.carveCorridor(st.x, st.y, cx, cy, rng);
    // a few extra loops for tactical variety
    const extra = 2 + Math.round(2 * area);
    for (let n = 0; n < extra; n++) {
      const ax = (4 + rng() * (s - 8)) | 0, ay = (4 + rng() * (s - 8)) | 0;
      const bx = (4 + rng() * (s - 8)) | 0, by = (4 + rng() * (s - 8)) | 0;
      this.carveCorridor(ax, ay, bx, by, rng);
    }
  }

  // 2-wide meandering grass corridor from (x0,y0) toward (x1,y1)
  carveCorridor(x0, y0, x1, y1, rng) {
    const s = this.size;
    let x = x0 | 0, y = y0 | 0, guard = 0;
    const clear = (cx, cy) => {
      for (let dy = 0; dy <= 1; dy++)
        for (let dx = 0; dx <= 1; dx++) {
          const nx = cx + dx, ny = cy + dy;
          if (this.inBounds(nx, ny) && this.terrain[this.idx(nx, ny)] === T.TREE)
            this.terrain[this.idx(nx, ny)] = T.GRASS;
        }
    };
    while ((x !== (x1 | 0) || y !== (y1 | 0)) && guard++ < s * s) {
      clear(x, y);
      const dirx = Math.sign((x1 | 0) - x), diry = Math.sign((y1 | 0) - y);
      if (rng() < 0.55) { if (dirx) x += dirx; else if (diry) y += diry; }
      else { if (diry) y += diry; else if (dirx) x += dirx; }
      if (rng() < 0.3) x += rng() < 0.5 ? -1 : 1;   // wander
      if (rng() < 0.3) y += rng() < 0.5 ? -1 : 1;
      x = Math.max(1, Math.min(s - 2, x));
      y = Math.max(1, Math.min(s - 2, y));
    }
    clear(x, y);
  }

  // dirt/rock/tree dressing shared by most layouts (mult scales density)
  scatterDressing(rng, density, area, mult = 1) {
    for (let n = 0; n < Math.round(density.dirt * area * mult); n++) {
      const cx = rng() * this.size, cy = rng() * this.size, r = 2 + rng() * 4;
      this.blob(cx, cy, r, (i) => {
        if (this.terrain[i] === T.GRASS) this.terrain[i] = T.DIRT;
      }, rng);
    }
    for (let n = 0; n < Math.round(density.rocks * area * mult); n++) {
      const cx = rng() * this.size, cy = rng() * this.size, r = 1 + rng() * 2.2;
      this.blob(cx, cy, r, (i) => {
        if (this.terrain[i] === T.GRASS || this.terrain[i] === T.DIRT) this.terrain[i] = T.ROCK;
      }, rng);
    }
    for (let n = 0; n < Math.round(density.woods * area * mult); n++) {
      const cx = rng() * this.size, cy = rng() * this.size, r = 1.5 + rng() * 3;
      this.blob(cx, cy, r, (i) => {
        if (this.terrain[i] === T.GRASS && rng() < 0.8) this.terrain[i] = T.TREE;
      }, rng);
    }
  }

  // ---------------------------------------------------------- biome flavour --

  applyBiome(rng, area) {
    const s = this.size;
    if (this.biome === 'desert' && this.layout !== 'lakes') {
      // dry canyons: riverbeds/lakes turn to impassable rock (fords stay dirt)
      for (let i = 0; i < s * s; i++) if (this.terrain[i] === T.WATER) this.terrain[i] = T.ROCK;
    }
    if (this.biome === 'taiga') {
      // extra rock outcrops
      for (let n = 0; n < Math.round(6 * area); n++) {
        const cx = rng() * s, cy = rng() * s, r = 1 + rng() * 2;
        this.blob(cx, cy, r, (i) => {
          if (this.terrain[i] === T.GRASS || this.terrain[i] === T.DIRT) this.terrain[i] = T.ROCK;
        }, rng);
      }
      // frozen shores: mark water cells touching land as ice (variant sentinel)
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          const i = this.idx(x, y);
          if (this.terrain[i] !== T.WATER) continue;
          if (this.terrainAt(x - 1, y) !== T.WATER || this.terrainAt(x + 1, y) !== T.WATER ||
              this.terrainAt(x, y - 1) !== T.WATER || this.terrainAt(x, y + 1) !== T.WATER) {
            this.variant[i] = V_ICE;
          }
        }
      }
    }
  }

  // impassable ruined-structure doodads: a few small clusters, off the bases
  scatterRuins(rng, area) {
    const s = this.size;
    const spots = Math.max(2, Math.round(3 * area));
    for (let n = 0; n < spots; n++) {
      for (let tries = 0; tries < 20; tries++) {
        const x = (6 + rng() * (s - 12)) | 0, y = (6 + rng() * (s - 12)) | 0;
        if (!this.starts.every((st) => Math.hypot(st.x - x, st.y - y) > 12)) continue;
        const w = 1 + ((rng() * 2) | 0), h = 1 + ((rng() * 2) | 0);
        for (let dy = 0; dy <= h; dy++) {
          for (let dx = 0; dx <= w; dx++) {
            const i = this.idx(x + dx, y + dy);
            if (this.inBounds(x + dx, y + dy) &&
                (this.terrain[i] === T.GRASS || this.terrain[i] === T.DIRT)) {
              this.terrain[i] = T.RUIN;
            }
          }
        }
        break;
      }
    }
  }

  // -------------------------------------------------------- connectivity ----

  // flood-fill reachability over passable terrain (8-connected)
  reachableSet(sx, sy) {
    const s = this.size;
    const seen = new Uint8Array(s * s);
    if (!this.inBounds(sx, sy)) return seen;
    const stack = [(sy | 0) * s + (sx | 0)];
    seen[stack[0]] = 1;
    const dirs = [1, -1, s, -s, s + 1, s - 1, -s + 1, -s - 1];
    while (stack.length) {
      const i = stack.pop();
      const x = i % s, y = (i / s) | 0;
      for (const d of dirs) {
        const j = i + d;
        if (j < 0 || j >= s * s) continue;
        const nx = j % s, ny = (j / s) | 0;
        if (Math.abs(nx - x) > 1 || Math.abs(ny - y) > 1) continue;   // wrap guard
        if (seen[j] || !this.isPassableTerrain(nx, ny)) continue;
        seen[j] = 1; stack.push(j);
      }
    }
    return seen;
  }

  // every start reachable from starts[0]?
  connectivityOK() {
    if (this.starts.length < 2) return true;
    const s0 = this.starts[0];
    const seen = this.reachableSet(s0.x, s0.y);
    return this.starts.every((st) => seen[this.idx(st.x | 0, st.y | 0)] === 1);
  }

  ensureConnectivity() {
    if (this.starts.length < 2) return;
    const s0 = this.starts[0];
    let seen = this.reachableSet(s0.x, s0.y);
    for (const st of this.starts.slice(1)) {
      if (seen[this.idx(st.x | 0, st.y | 0)]) continue;
      this.carveLine(s0.x, s0.y, st.x, st.y);
      seen = this.reachableSet(s0.x, s0.y);   // re-flood after carving
    }
  }

  // straight 2-wide passable carve between two cells (Bresenham)
  carveLine(x0, y0, x1, y1) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, x = x0, y = y0;
    const paint = (cx, cy) => {
      for (let ay = 0; ay <= 1; ay++)
        for (let ax = 0; ax <= 1; ax++) {
          const nx = cx + ax, ny = cy + ay;
          if (!this.inBounds(nx, ny)) continue;
          const i = this.idx(nx, ny);
          if (this.terrain[i] !== T.GRASS) this.terrain[i] = T.DIRT;
        }
    };
    for (let guard = 0; guard < this.size * 4; guard++) {
      paint(x, y);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
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
