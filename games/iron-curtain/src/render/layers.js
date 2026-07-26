// The static world layers: terrain, ore, fog of war and drifting cloud shadows.
//
// Terrain and ore are split into CHUNK×CHUNK-cell textures so animated water
// and ore mining re-upload a few small chunks instead of one map-sized texture
// (a full 96-map texture is ~21 MP — re-uploading it twice a second was the
// main FPS killer).

import * as THREE from '../../lib/three.module.min.js';
import { TILE } from '../sprites.js';
import { makeCanvas } from '../palette.js';
import { T, V_ICE } from '../map.js';
import { SpriteQuad, Z } from './quad.js';

const CHUNK = 16;                  // cells per texture chunk
const WATER_FRAME_EVERY = 0.5;     // seconds per animated-water frame
const WATER_FRAMES = 4;
// Fog is drawn at this many texels per cell and magnified with a linear
// filter — enough to soften the shroud edges without a map-sized canvas.
const FOG_TEXELS = 4;

export class Layers {
  constructor(scene, sprites) {
    this.scene = scene;
    this.sprites = sprites;
    this.map = null;
    this.terrainChunks = [];
    this.oreChunks = [];
    this.chunksX = 0;
    this.chunksY = 0;
    this.lastOre = null;            // renderer-side copy for cheap dirty diffing
    this.fogQuad = null;
    this.fogCanvas = null;
    this.fogG = null;
    this.waterCells = [];           // {x,y} cells to re-tile each water frame
    this.waterFrame = 0;
    this.waterT = 0;                // animated-water clock
    this.cloudQuads = [];           // drifting cloud-shadow blobs
  }

  // ------------------------------------------------------------- chunks ----

  makeChunkGrid(z) {
    const s = this.map.size;
    this.chunksX = Math.ceil(s / CHUNK);
    this.chunksY = Math.ceil(s / CHUNK);
    const grid = [];
    for (let cy = 0; cy < this.chunksY; cy++) {
      for (let cx = 0; cx < this.chunksX; cx++) {
        const cw = Math.min(CHUNK, s - cx * CHUNK);
        const ch = Math.min(CHUNK, s - cy * CHUNK);
        const [canvas, g] = makeCanvas(cw * TILE, ch * TILE);
        const quad = new SpriteQuad(this.scene, canvas, cw, ch, z);
        quad.mesh.position.set(cx * CHUNK + cw / 2, -(cy * CHUNK + ch / 2), z);
        grid.push({ canvas, g, quad, dirty: false });
      }
    }
    return grid;
  }

  chunkAt(grid, x, y) {
    return grid[((y / CHUNK) | 0) * this.chunksX + ((x / CHUNK) | 0)];
  }

  flushChunks(grid) {
    for (const ch of grid) {
      if (ch.dirty) { ch.quad.touch(); ch.dirty = false; }
    }
  }

  disposeChunks(grid) {
    for (const ch of grid.splice(0)) ch.quad.dispose(this.scene);
  }

  // ------------------------------------------------------------ terrain ----

  // paint a single terrain cell (base tile + shore/edge fringes) at its pixel
  // slot. Shared by the initial bake and the animated-water region redraws.
  paintTerrainCell(x, y) {
    const map = this.map, sprites = this.sprites;
    const ch = this.chunkAt(this.terrainChunks, x, y);
    const g = ch.g;
    const lx = (x % CHUNK) * TILE, ly = (y % CHUNK) * TILE;
    const tiles = sprites.tiles[map.biome] || sprites.tiles.forest;
    const i = map.idx(x, y);
    const t = map.terrain[i], v = map.variant[i];
    let tile;
    if (t === T.GRASS) tile = tiles.ground[v % tiles.ground.length];
    else if (t === T.DIRT) tile = tiles.dirt[v % tiles.dirt.length];
    else if (t === T.WATER) {
      tile = (v === V_ICE && tiles.ice) ? tiles.ice[(x + y) % tiles.ice.length]
        : tiles.water[this.waterFrame % tiles.water.length];
    } else if (t === T.ROCK) tile = tiles.rock[v % tiles.rock.length];
    else if (t === T.RUIN) tile = tiles.ruin[v % tiles.ruin.length];
    else tile = tiles.tree[v % tiles.tree.length];
    g.clearRect(lx, ly, TILE, TILE);
    g.drawImage(tile, lx, ly);
    if (t !== T.WATER) {
      // shore fringe on land next to water
      let wmask = 0;
      if (map.terrainAt(x, y - 1) === T.WATER) wmask |= 1;
      if (map.terrainAt(x + 1, y) === T.WATER) wmask |= 2;
      if (map.terrainAt(x, y + 1) === T.WATER) wmask |= 4;
      if (map.terrainAt(x - 1, y) === T.WATER) wmask |= 8;
      if (wmask) g.drawImage(sprites.shore(tile, wmask, map.biome), lx, ly);
      // grass<->dirt auto-edge: scuffed-dirt fringe on grass beside dirt
      if (t === T.GRASS) {
        let dmask = 0;
        if (map.terrainAt(x, y - 1) === T.DIRT) dmask |= 1;
        if (map.terrainAt(x + 1, y) === T.DIRT) dmask |= 2;
        if (map.terrainAt(x, y + 1) === T.DIRT) dmask |= 4;
        if (map.terrainAt(x - 1, y) === T.DIRT) dmask |= 8;
        if (dmask) g.drawImage(sprites.edge(tile, dmask, map.biome), lx, ly);
      }
      // roads pave over the finished ground tile, autotiled from neighbours
      if (map.road && map.road[i]) {
        let rmask = 0;
        if (map.isRoad(x, y - 1)) rmask |= 1;
        if (map.isRoad(x + 1, y)) rmask |= 2;
        if (map.isRoad(x, y + 1)) rmask |= 4;
        if (map.isRoad(x - 1, y)) rmask |= 8;
        const paved = sprites.road(tile, rmask, map.biome);
        g.clearRect(lx, ly, TILE, TILE);
        g.drawImage(paved, lx, ly);
      }
    }
    ch.dirty = true;
  }

  buildTerrain() {
    const map = this.map;
    const s = map.size;
    this.disposeChunks(this.terrainChunks);
    this.terrainChunks = this.makeChunkGrid(Z.terrain);
    this.waterCells = [];
    this.waterFrame = 0; this.waterT = 0;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        this.paintTerrainCell(x, y);
        const i = map.idx(x, y);
        // remember open-water cells (not shore ice) so we can animate just them
        if (map.terrain[i] === T.WATER && map.variant[i] !== V_ICE) this.waterCells.push([x, y]);
      }
    }
    this.flushChunks(this.terrainChunks);
    this.buildClouds();
  }

  // redraw only the water cells for the next frame, then re-upload only the
  // chunks they live in — no full-map rebake, no map-sized texture upload
  stepWater() {
    if (!this.waterCells.length) return;
    this.waterFrame = (this.waterFrame + 1) % WATER_FRAMES;
    for (const [x, y] of this.waterCells) this.paintTerrainCell(x, y);
    this.flushChunks(this.terrainChunks);
  }

  tickWater(dt) {
    this.waterT += dt;
    if (this.waterT >= WATER_FRAME_EVERY) { this.waterT = 0; this.stepWater(); }
  }

  // -------------------------------------------------------------- ore ------

  paintOreCell(x, y) {
    const map = this.map;
    const ch = this.chunkAt(this.oreChunks, x, y);
    const lx = (x % CHUNK) * TILE, ly = (y % CHUNK) * TILE;
    ch.g.clearRect(lx, ly, TILE, TILE);
    const d = map.oreDensity(x, y);
    if (d > 0) {
      const set = map.gem[map.idx(x, y)] ? this.sprites.gem : this.sprites.ore;
      ch.g.drawImage(set[d - 1], lx, ly);
    }
    ch.dirty = true;
  }

  buildOreLayer() {
    const map = this.map;
    const s = map.size;
    this.disposeChunks(this.oreChunks);
    this.oreChunks = this.makeChunkGrid(Z.ore);
    this.lastOre = new Uint16Array(map.ore);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        if (map.ore[map.idx(x, y)] > 0) this.paintOreCell(x, y);
      }
    }
    this.flushChunks(this.oreChunks);
  }

  // repaint only the cells whose ore value changed since the last pass and
  // re-upload only their chunks — mining no longer costs a map-sized upload
  redrawOre() {
    const map = this.map;
    const s = map.size;
    for (let i = 0; i < s * s; i++) {
      if (map.ore[i] === this.lastOre[i]) continue;
      this.lastOre[i] = map.ore[i];
      this.paintOreCell(i % s, (i / s) | 0);
    }
    this.flushChunks(this.oreChunks);
  }

  // -------------------------------------------------------------- fog ------

  buildFog(game) {
    const s = this.map.size;
    const [canvas, g] = makeCanvas(s * FOG_TEXELS, s * FOG_TEXELS);
    this.fogCanvas = canvas;
    this.fogG = g;
    this.fogQuad = new SpriteQuad(this.scene, this.fogCanvas, s, s, Z.fog);
    this.fogQuad.mesh.position.set(s / 2, -s / 2, Z.fog);
    this.fogQuad.tex.magFilter = THREE.LinearFilter; // soft-ish shroud edges
    this.redrawFog(game);
  }

  redrawFog(game) {
    const map = this.map;
    const s = map.size;
    const fogG = this.fogG;
    const F = FOG_TEXELS;
    fogG.clearRect(0, 0, this.fogCanvas.width, this.fogCanvas.height);
    fogG.fillStyle = '#000';
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i = map.idx(x, y);
        if (!game.explored[i]) {
          // unexplored cells overspill by a texel each way so neighbouring
          // black squares meet with no seam under the linear filter
          fogG.globalAlpha = 1;
          fogG.fillRect(x * F - 1, y * F - 1, F + 2, F + 2);
        } else if (!game.visible[i]) {
          fogG.globalAlpha = 0.45;
          fogG.fillRect(x * F, y * F, F, F);
        }
      }
    }
    fogG.globalAlpha = 1;
    this.fogQuad.touch();
  }

  // ------------------------------------------------------------ clouds -----

  // three big soft cloud shadows drifting across the map on their own vectors,
  // wrapping at the edges. Barely-there opacity — just a hint of movement.
  buildClouds() {
    for (const q of this.cloudQuads.splice(0)) q.dispose(this.scene);
    const s = this.map.size;
    const specs = [
      { w: s * 0.6, h: s * 0.5, vx: 0.55, vy: 0.12, op: 0.12 },
      { w: s * 0.75, h: s * 0.55, vx: 0.32, vy: -0.09, op: 0.10 },
      { w: s * 0.5, h: s * 0.45, vx: 0.7, vy: 0.05, op: 0.13 },
    ];
    specs.forEach((sp, i) => {
      const q = new SpriteQuad(this.scene, this.sprites.clouds[i % this.sprites.clouds.length], sp.w, sp.h, Z.cloud);
      q.mat.opacity = sp.op;
      q.spec = sp;
      q.cx = (i * 0.31 + 0.15) * s;
      q.cy = (i * 0.27 + 0.2) * s;
      this.cloudQuads.push(q);
    });
  }

  stepClouds(dt) {
    const s = this.map.size;
    for (const q of this.cloudQuads) {
      const sp = q.spec;
      q.cx += sp.vx * dt; q.cy += sp.vy * dt;
      const margin = Math.max(sp.w, sp.h);
      if (q.cx > s + margin) q.cx = -margin;
      if (q.cx < -margin) q.cx = s + margin;
      if (q.cy > s + margin) q.cy = -margin;
      if (q.cy < -margin) q.cy = s + margin;
      q.set(q.cx, -q.cy, Z.cloud);
    }
  }

  // ------------------------------------------------------------ lifecycle --

  build(map, game) {
    this.map = map;
    this.buildTerrain();
    this.buildOreLayer();
    this.buildFog(game);
  }

  dispose() {
    for (const q of this.cloudQuads.splice(0)) q.dispose(this.scene);
    this.disposeChunks(this.terrainChunks);
    this.disposeChunks(this.oreChunks);
    if (this.fogQuad) { this.fogQuad.dispose(this.scene); this.fogQuad = null; }
  }
}
