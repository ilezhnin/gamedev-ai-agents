// Boot + render loop. Three.js draws the world: terrain baked to a canvas
// texture, entities as textured quads with per-facing pixel art, fog of war
// as an overlay texture. DOM handles the sidebar; input.js drives orders.

import * as THREE from '../lib/three.module.min.js';
import { buildSprites, drawTitleLogo, TILE, FACINGS } from './sprites.js';
import { GameMap, T } from './map.js';
import { Game, facingIndex } from './game.js';
import { AI } from './ai.js';
import { UI } from './ui.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { loadSettings, saveSettings } from './settings.js';
import { BUILDINGS, ECONOMY } from './rules.js';

const MAP_SIZE = 64;

// ---------------------------------------------------------------- helpers --

function texFromCanvas(c) {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class SpriteQuad {
  // billboard quad in world units (cells)
  constructor(scene, canvas, wCells, hCells, z) {
    this.tex = texFromCanvas(canvas);
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(wCells, hCells), this.mat);
    this.mesh.position.z = z;
    scene.add(this.mesh);
  }
  setCanvas(c) {
    if (this.tex.image !== c) { this.tex.image = c; }
    this.tex.needsUpdate = true;
  }
  set(x, y, z) { this.mesh.position.set(x, y, z ?? this.mesh.position.z); }
  dispose(scene) {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.tex.dispose();
  }
}

// ------------------------------------------------------------------- boot --

const audio = new AudioSys();
const settings = loadSettings();
audio.setMaster(settings.master);
audio.setMusicVol(settings.musicVol);
audio.voiceOn = settings.voice;
const sprites = buildSprites();
drawTitleLogo(document.getElementById('title-logo'));

const viewEl = document.getElementById('viewport');
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(1); // chunky pixels, CSS upscales

const scene = new THREE.Scene();
scene.background = new THREE.Color('#101010');
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);

// camera state in cell units
const cam = { x: 12, y: MAP_SIZE - 14, zoom: 2.0 };

let map, game, ui, input;
let ais = [];
let terrainQuad, oreQuad, fogQuad;
let oreCanvas, oreG, fogCanvas, fogG;
const entityViews = new Map();     // entity id -> view objects
const fxViews = [];
let state = 'title';               // title | setup | brief | play | end
let speedFactor = 1;

// -------------------------------------------------------- operation setup --

const SIZES = { small: 48, medium: 64, large: 96 };
const SIZE_LABEL = { small: 'SMALL 48×48', medium: 'MEDIUM 64×64', large: 'LARGE 96×96' };
const BIOME_LABEL = { forest: 'GREEN FOREST', taiga: 'SNOW TAIGA', desert: 'DESERT WASTE' };
const DIFF_ORDER = ['easy', 'normal', 'hard'];
const ENEMY_HOUSES = ['enemy', 'enemy2', 'enemy3'];

function loadSetup() {
  const def = { opponents: 1, diffs: ['normal', 'normal', 'normal'], size: 'medium', biome: 'forest' };
  try {
    const raw = localStorage.getItem('iron-curtain-setup');
    return raw ? { ...def, ...JSON.parse(raw) } : def;
  } catch { return def; }
}
const setup = loadSetup();
function saveSetup() {
  try { localStorage.setItem('iron-curtain-setup', JSON.stringify(setup)); } catch { /* ok */ }
}

// spawn corners as map fractions: human SW, then NE / NW / SE for CPUs
const START_SPOTS = [
  { x: 0.14, y: 0.82 },  // player
  { x: 0.82, y: 0.10 },  // cpu 1
  { x: 0.12, y: 0.10 },  // cpu 2
  { x: 0.84, y: 0.80 },  // cpu 3
];

function briefingText() {
  const foes = setup.opponents;
  return (
    `COMMANDER. ${foes} HOSTILE ${foes > 1 ? 'ARMIES HAVE' : 'ARMY HAS'} DUG IN ` +
    `ACROSS THE ${BIOME_LABEL[setup.biome]}.\n` +
    'ESTABLISH A FORWARD BASE, SECURE THE ORE FIELDS AND CRUSH\n' +
    'ALL HOSTILE STRUCTURES. THE WEATHER IS TURNING - MOVE FAST.\n\n' +
    'OBJECTIVE: DESTROY ALL ENEMY FORCES AND STRUCTURES.\n' +
    'SUPPORT: FORWARD BASE, STARTING PLATOON, 5000 CREDITS.'
  );
}

function newGame() {
  // tear down old views
  for (const [, v] of entityViews) disposeEntityView(v);
  entityViews.clear();
  for (const v of fxViews.splice(0)) v.quad.dispose(scene);
  while (scene.children.length) scene.remove(scene.children[0]);

  const size = SIZES[setup.size] || 64;
  const seed = (Math.random() * 1e9) | 0;
  const starts = START_SPOTS.slice(0, 1 + setup.opponents)
    .map((f) => ({ x: Math.round(f.x * size), y: Math.round(f.y * size) }));
  const houses = ENEMY_HOUSES.slice(0, setup.opponents);

  map = new GameMap(size, seed, setup.biome, starts);
  game = new Game(map, audio, seed ^ 0x9e37, houses);
  ais = houses.map((h, i) => new AI(game, game.players[h], setup.diffs[i] || 'normal'));
  if (!ui) {
    ui = new UI(game, sprites, audio);
    input = new Input(game, cam, ui, audio, viewEl);
    input.settings = settings;
  } else {
    ui.reset(game);
    input.reset(game);
  }

  buildTerrain();
  buildOreLayer();
  buildFog();

  // player start
  const [ps, ...es] = starts;
  const p = game.players.player;
  game.addBuilding(p, 'conyard', ps.x - 4, ps.y - 2, { instant: true, noFreeUnit: true });
  game.addUnit(p, 'rifle', ps.x + 1, ps.y + 2);
  game.addUnit(p, 'rifle', ps.x + 2, ps.y + 2);
  game.addUnit(p, 'rocket', ps.x + 1, ps.y + 3);
  game.addUnit(p, 'lightTank', ps.x + 3, ps.y);

  // CPU starts
  es.forEach((st, i) => {
    const e = game.players[houses[i]];
    game.addBuilding(e, 'conyard', st.x - 1, st.y - 2, { instant: true, noFreeUnit: true });
    game.addBuilding(e, 'power', st.x - 4, st.y - 2, { instant: true });
    game.addUnit(e, 'rifle', st.x - 2, st.y + 3);
    game.addUnit(e, 'rifle', st.x - 1, st.y + 3);
    game.addUnit(e, 'heavyTank', st.x + 2, st.y + 4);
  });

  cam.x = ps.x; cam.y = ps.y; cam.zoom = 2.0;
  game.recomputeVision();
  ui.setMode('normal');
}

// ------------------------------------------------------------- terrain ----

function buildTerrain() {
  const s = map.size;
  const c = document.createElement('canvas');
  c.width = s * TILE; c.height = s * TILE;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const tiles = sprites.tiles[map.biome] || sprites.tiles.forest;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const i = map.idx(x, y);
      const t = map.terrain[i], v = map.variant[i];
      let tile;
      if (t === T.GRASS) tile = tiles.ground[v % tiles.ground.length];
      else if (t === T.DIRT) tile = tiles.dirt[v % tiles.dirt.length];
      else if (t === T.WATER) tile = tiles.water[v % tiles.water.length];
      else if (t === T.ROCK) tile = tiles.rock[v % tiles.rock.length];
      else tile = tiles.tree[v % tiles.tree.length];
      g.drawImage(tile, x * TILE, y * TILE);
      // shore fringe on land next to water
      if (t !== T.WATER) {
        let mask = 0;
        if (map.terrainAt(x, y - 1) === T.WATER) mask |= 1;
        if (map.terrainAt(x + 1, y) === T.WATER) mask |= 2;
        if (map.terrainAt(x, y + 1) === T.WATER) mask |= 4;
        if (map.terrainAt(x - 1, y) === T.WATER) mask |= 8;
        if (mask) g.drawImage(sprites.shore(tile, mask, map.biome), x * TILE, y * TILE);
      }
    }
  }
  terrainQuad = new SpriteQuad(scene, c, s, s, 0);
  terrainQuad.mesh.position.set(s / 2, -s / 2, 0);
}

function buildOreLayer() {
  const s = map.size;
  oreCanvas = document.createElement('canvas');
  oreCanvas.width = s * TILE; oreCanvas.height = s * TILE;
  oreG = oreCanvas.getContext('2d');
  oreG.imageSmoothingEnabled = false;
  redrawOre();
  oreQuad = new SpriteQuad(scene, oreCanvas, s, s, 0.05);
  oreQuad.mesh.position.set(s / 2, -s / 2, 0.05);
}

function redrawOre() {
  const s = map.size;
  oreG.clearRect(0, 0, oreCanvas.width, oreCanvas.height);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const d = map.oreDensity(x, y);
      if (d > 0) {
        const set = map.gem[map.idx(x, y)] ? sprites.gem : sprites.ore;
        oreG.drawImage(set[d - 1], x * TILE, y * TILE);
      }
    }
  }
  if (oreQuad) oreQuad.setCanvas(oreCanvas);
}

function buildFog() {
  const s = map.size;
  fogCanvas = document.createElement('canvas');
  fogCanvas.width = s * 4; fogCanvas.height = s * 4;
  fogG = fogCanvas.getContext('2d');
  fogQuad = new SpriteQuad(scene, fogCanvas, s, s, 3);
  fogQuad.mesh.position.set(s / 2, -s / 2, 3);
  fogQuad.tex.magFilter = THREE.LinearFilter; // soft-ish shroud edges
  redrawFog();
}

function redrawFog() {
  const s = map.size;
  fogG.clearRect(0, 0, fogCanvas.width, fogCanvas.height);
  fogG.fillStyle = '#000';
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const i = map.idx(x, y);
      if (!game.explored[i]) {
        fogG.globalAlpha = 1;
        fogG.fillRect(x * 4 - 1, y * 4 - 1, 6, 6);
      } else if (!game.visible[i]) {
        fogG.globalAlpha = 0.45;
        fogG.fillRect(x * 4, y * 4, 4, 4);
      }
    }
  }
  fogG.globalAlpha = 1;
  fogQuad.setCanvas(fogCanvas);
}

// -------------------------------------------------------------- entities --

function disposeEntityView(v) {
  for (const q of Object.values(v.quads)) q.dispose(scene);
}

function healthBarCanvas(frac) {
  const [c, g] = [document.createElement('canvas'), null];
  c.width = 26; c.height = 4;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#111'; ctx.fillRect(0, 0, 26, 4);
  const w = Math.max(1, Math.round(24 * frac));
  ctx.fillStyle = frac > 0.6 ? '#3fbf4d' : frac > 0.3 ? '#e0c53a' : '#d64f2a';
  ctx.fillRect(1, 1, w, 2);
  return c;
}

function selBoxCanvas(sizePx) {
  const c = document.createElement('canvas');
  c.width = sizePx; c.height = sizePx;
  const g = c.getContext('2d');
  g.strokeStyle = '#eaeaea';
  const L = Math.max(3, sizePx / 5);
  g.lineWidth = 1;
  for (const [x0, y0, dx, dy] of [[0.5, 0.5, 1, 1], [sizePx - 0.5, 0.5, -1, 1], [0.5, sizePx - 0.5, 1, -1], [sizePx - 0.5, sizePx - 0.5, -1, -1]]) {
    g.beginPath();
    g.moveTo(x0 + dx * L, y0); g.lineTo(x0, y0); g.lineTo(x0, y0 + dy * L);
    g.stroke();
  }
  return c;
}
const SELBOX_UNIT = selBoxCanvas(28);
const SELBOX_BIG = selBoxCanvas(48);

function ensureUnitView(u) {
  let v = entityViews.get(u.id);
  if (v) return v;
  const set = sprites.units[u.house][u.key];
  const scale = (u.def.size + 4) / TILE;
  v = { kind: 'unit', quads: {} };
  const body = set.hull ? set.hull[0] : set.frames[0][0];
  v.quads.body = new SpriteQuad(scene, body, scale, scale, 1);
  if (set.turret) v.quads.turret = new SpriteQuad(scene, set.turret[0], scale, scale, 1.1);
  v.quads.health = new SpriteQuad(scene, healthBarCanvas(1), 1.0, 0.16, 1.6);
  v.quads.sel = new SpriteQuad(scene, SELBOX_UNIT, scale + 0.25, scale + 0.25, 1.5);
  entityViews.set(u.id, v);
  return v;
}

function ensureBuildingView(b) {
  let v = entityViews.get(b.id);
  if (v) return v;
  const spr = sprites.buildings[b.house][b.key];
  v = { kind: 'building', quads: {} };
  v.quads.body = new SpriteQuad(scene, spr, b.def.w, b.def.h, 0.5);
  if (b.def.weapon && b.key === 'guard') {
    v.quads.turret = new SpriteQuad(scene, sprites.guardGun[b.house][0], 1, 1, 0.7);
  }
  v.quads.health = new SpriteQuad(scene, healthBarCanvas(1), Math.max(1, b.def.w * 0.8), 0.16, 1.6);
  v.quads.sel = new SpriteQuad(scene, SELBOX_BIG, b.def.w + 0.2, b.def.h + 0.2, 1.5);
  entityViews.set(b.id, v);
  return v;
}

function syncEntities(dt) {
  const seen = new Set();

  for (const b of game.buildings) {
    if (b.dead) continue;
    seen.add(b.id);
    const v = ensureBuildingView(b);
    const [cx, cy] = b.centre();
    // enemy buildings stay on the map once scouted (classic "last seen" rule)
    if (b.house !== 'player' && game.isVisibleToPlayer(b)) b.seen = true;
    const vis = b.house === 'player' || b.seen;
    for (const q of Object.values(v.quads)) q.mesh.visible = false;
    if (!vis) continue;
    v.quads.body.mesh.visible = true;
    const rise = b.buildRise;
    v.quads.body.set(cx, mapY(cy), 0.5);
    const bs = rise < 1 ? 0.6 + rise * 0.4 : 1;
    v.quads.body.mesh.scale.set(bs, bs, 1);
    v.quads.body.mat.opacity = rise < 1 ? 0.55 + rise * 0.45 : 1;
    if (v.quads.turret) {
      v.quads.turret.mesh.visible = true;
      const set = sprites.guardGun[b.house];
      v.quads.turret.setCanvas(set[facingIndex(b.turretFacing)]);
      v.quads.turret.set(cx, mapY(cy), 0.7);
    }
    const selected = input.selection.includes(b);
    const hurt = b.hp < b.maxHp;
    if (selected || hurt || b.repairing) {
      v.quads.health.mesh.visible = true;
      v.quads.health.setCanvas(healthBarCanvas(Math.max(0, b.hp / b.maxHp)));
      v.quads.health.set(cx, mapY(cy - b.def.h / 2 - 0.25), 1.6);
    }
    if (selected) {
      v.quads.sel.mesh.visible = true;
      v.quads.sel.set(cx, mapY(cy), 1.5);
    }
    // repair wrench blink
    if (b.repairing && Math.floor(game.time * 3) % 2 === 0) {
      spawnFloater('🔧', cx, cy);
    }
  }

  for (const u of game.units) {
    if (u.dead) continue;
    seen.add(u.id);
    const v = ensureUnitView(u);
    const vis = u.house === 'player' || game.isVisibleToPlayer(u);
    for (const q of Object.values(v.quads)) q.mesh.visible = false;
    if (!vis) continue;

    const set = sprites.units[u.house][u.key];
    const f = facingIndex(u.facing);
    let bodyCanvas;
    if (set.hull) bodyCanvas = set.hull[f];
    else {
      // infantry: walk cycle / fire pose
      let pose = 0;
      if (u.fireFlash && u.fireFlash > 0) pose = 2;
      else if (u.moving) pose = Math.floor(u.animT * 6) % 2;
      bodyCanvas = set.frames[pose][f];
    }
    v.quads.body.mesh.visible = true;
    v.quads.body.setCanvas(bodyCanvas);
    v.quads.body.set(u.x + 0.5, mapY(u.y + 0.5), 1);
    if (v.quads.turret) {
      v.quads.turret.mesh.visible = true;
      v.quads.turret.setCanvas(set.turret[facingIndex(u.turretFacing)]);
      v.quads.turret.set(u.x + 0.5, mapY(u.y + 0.5), 1.1);
    }
    if (u.fireFlash > 0) u.fireFlash -= dt;

    const selected = input.selection.includes(u);
    if (selected || u.hp < u.maxHp) {
      v.quads.health.mesh.visible = true;
      v.quads.health.setCanvas(healthBarCanvas(Math.max(0, u.hp / u.maxHp)));
      v.quads.health.set(u.x + 0.5, mapY(u.y + 0.5 - 0.75), 1.6);
    }
    if (selected) {
      v.quads.sel.mesh.visible = true;
      v.quads.sel.set(u.x + 0.5, mapY(u.y + 0.5), 1.5);
    }
  }

  // remove views for gone entities
  for (const [id, v] of entityViews) {
    if (!seen.has(id)) {
      disposeEntityView(v);
      entityViews.delete(id);
    }
  }
}

function mapY(y) { return -y; } // map y grows down; scene y grows up

// ---------------------------------------------------------------- fx ------

const floaters = [];
function spawnFloater(_txt, _x, _y) { /* emoji floaters disabled — retro purity */ }

function syncFx(dt) {
  // consume newly spawned effects from the sim
  for (const e of game.effects.splice(0)) {
    if (e.kind === 'explosion') {
      fxViews.push({ e, quad: new SpriteQuad(scene, sprites.explosion[0], e.big ? 1.6 : 1.1, e.big ? 1.6 : 1.1, 2.2) });
    } else if (e.kind === 'puff') {
      fxViews.push({ e, quad: new SpriteQuad(scene, sprites.puff[0], 0.6, 0.6, 2.1) });
    } else if (e.kind === 'tracer' || e.kind === 'zap') {
      const pts = [];
      const n = e.kind === 'zap' ? 7 : 2;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        let x = e.x0 + (e.x1 - e.x0) * t + 0.5;
        let y = e.y0 + (e.y1 - e.y0) * t + 0.5;
        if (e.kind === 'zap' && i > 0 && i < n) {
          x += (Math.random() - 0.5) * 0.7;
          y += (Math.random() - 0.5) * 0.7;
        }
        pts.push(new THREE.Vector3(x, -y, 2.3));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: e.kind === 'zap' ? 0xbfe8ff : 0xfff2b0, transparent: true });
      const line = new THREE.Line(geo, mat);
      scene.add(line);
      fxViews.push({ e, line, mat, geo });
    } else if (e.kind === 'scorch') {
      const q = new SpriteQuad(scene, sprites.scorch, 1, 1, 0.08);
      q.set(e.x + 0.5, mapY(e.y + 0.5), 0.08);
      fxViews.push({ e, quad: q });
    } else if (e.kind === 'smoke') {
      fxViews.push({ e, quad: new SpriteQuad(scene, sprites.smoke[0], 0.7, 0.7, 2.05) });
    } else if (e.kind === 'muzzle') {
      const q = new SpriteQuad(scene, sprites.muzzle, 0.42, 0.42, 2.25);
      q.set(e.x + 0.5, mapY(e.y + 0.5), 2.25);
      fxViews.push({ e, quad: q });
    }
  }

  for (const v of fxViews) {
    const e = v.e;
    e.t += dt;
    if (e.kind === 'explosion') {
      if (e.t < 0) { v.quad.mesh.visible = false; continue; }
      const frame = Math.min(sprites.explosion.length - 1, Math.floor(e.t / 0.09));
      v.quad.mesh.visible = true;
      v.quad.setCanvas(sprites.explosion[frame]);
      v.quad.set(e.x + 0.5, mapY(e.y + 0.5), 2.2);
      if (e.t > 0.09 * sprites.explosion.length) e.done = true;
    } else if (e.kind === 'puff') {
      const frame = Math.min(sprites.puff.length - 1, Math.floor(e.t / 0.07));
      v.quad.setCanvas(sprites.puff[frame]);
      v.quad.set(e.x + 0.5, mapY(e.y + 0.5), 2.1);
      if (e.t > 0.07 * 3 + 0.05) e.done = true;
    } else if (e.kind === 'tracer' || e.kind === 'zap') {
      v.mat.opacity = Math.max(0, 1 - e.t / (e.kind === 'zap' ? 0.35 : 0.08));
      if (v.mat.opacity <= 0) e.done = true;
    } else if (e.kind === 'scorch') {
      if (e.t > 20) { v.quad.mat.opacity = Math.max(0, 1 - (e.t - 20) / 5); }
      if (e.t > 25) e.done = true;
    } else if (e.kind === 'smoke') {
      const frame = Math.min(sprites.smoke.length - 1, Math.floor(e.t / 0.22));
      v.quad.setCanvas(sprites.smoke[frame]);
      v.quad.set(e.x + 0.5, mapY(e.y + 0.5 - e.t * 0.25), 2.05);
      v.quad.mat.opacity = Math.max(0, 1 - e.t / 0.9);
      if (e.t > 0.9) e.done = true;
    } else if (e.kind === 'muzzle') {
      if (e.t > 0.08) e.done = true;
    }
  }
  // cleanup
  for (let i = fxViews.length - 1; i >= 0; i--) {
    const v = fxViews[i];
    if (v.e.done) {
      if (v.quad) v.quad.dispose(scene);
      if (v.line) { scene.remove(v.line); v.geo.dispose(); v.mat.dispose(); }
      fxViews.splice(i, 1);
    }
  }

  // projectiles as quads (pooled per projectile object)
  for (const p of game.projectiles) {
    if (!p.view) {
      const c = p.kind === 'rocket' ? sprites.rocket : sprites.shell;
      p.view = new SpriteQuad(scene, c, 0.35, 0.35, 2.0);
    }
    p.view.set(p.x + 0.5, mapY(p.y + 0.5), 2.0);
    p.view.mesh.rotation.z = -(p.angle + Math.PI / 2);
    p.viewAlive = true;
  }
  // dispose views for finished projectiles: track via marker
  if (!syncFx.live) syncFx.live = new Set();
  const liveNow = new Set(game.projectiles);
  for (const old of syncFx.live) {
    if (!liveNow.has(old) && old.view) old.view.dispose(scene);
  }
  syncFx.live = liveNow;
}

// ------------------------------------------------------- placement ghost --

let ghostGroup = null;
function syncPlacementGhost() {
  if (ghostGroup) {
    scene.remove(ghostGroup);
    ghostGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    ghostGroup = null;
  }
  const p = game.players.player;
  if (!p.readyBuilding || !input.placeCursor) return;
  const def = BUILDINGS[p.readyBuilding.key];
  const [cx, cy] = input.placeCursor;
  ghostGroup = new THREE.Group();
  for (let y = 0; y < def.h; y++) {
    for (let x = 0; x < def.w; x++) {
      const ok = map.isBuildable(cx + x, cy + y);
      const mat = new THREE.MeshBasicMaterial({
        color: ok ? 0x3fdf4d : 0xdf3f2a, transparent: true, opacity: 0.4, depthWrite: false,
      });
      const cell = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 0.94), mat);
      cell.position.set(cx + x + 0.5, -(cy + y + 0.5), 2.6);
      ghostGroup.add(cell);
    }
  }
  const valid = game.placementValid(p, p.readyBuilding.key, cx, cy);
  if (!valid) {
    // tint all cells red-ish if adjacency fails
    ghostGroup.children.forEach((m) => m.material.color.setHex(0xdf3f2a));
  }
  scene.add(ghostGroup);
}

// ---------------------------------------------------------------- screens --

const elTitle = document.getElementById('screen-title');
const elSetup = document.getElementById('screen-setup');
const elBrief = document.getElementById('screen-brief');
const elEnd = document.getElementById('screen-end');
const elPaused = document.getElementById('paused');
let paused = false;
let endShown = false;

function hideScreens() {
  for (const el of [elTitle, elSetup, elBrief, elEnd]) el.classList.add('hidden');
}

// the command sidebar exists only inside a running match
function setSidebar(visible) {
  document.getElementById('sidebar').classList.toggle('hidden', !visible);
  resize(); // viewport width changed — rescale the render buffer
}

function showTitle() {
  hideScreens();
  state = 'title';
  setSidebar(false);
  const canContinue = !!(game && !game.over && !endShown);
  document.getElementById('tb-continue').classList.toggle('disabled', !canContinue);
  elTitle.classList.remove('hidden');
}

function showSetup() {
  hideScreens();
  state = 'setup';
  syncSetupWidgets();
  elSetup.classList.remove('hidden');
  audio.ensure(); audio.resume();
  audio.sfx('select');
}

function showBrief() {
  hideScreens();
  state = 'brief';
  elBrief.classList.remove('hidden');
  typeBriefing();
  audio.sfx('ready');
}

function startMatch() {
  hideScreens();
  state = 'play';
  setSidebar(true);
  newGame();
  endShown = false;
  if (audio.musicOn) audio.startMusic();
  audio.say('Battle control online', true);
}

function continueMatch() {
  if (!game || game.over) return;
  hideScreens();
  state = 'play';
  setSidebar(true);
  if (audio.musicOn) audio.startMusic();
}

// --- setup screen wiring ---

function syncSetupWidgets() {
  for (let n = 1; n <= 3; n++) {
    document.getElementById(`su-n${n}`).classList.toggle('on', setup.opponents === n);
    document.getElementById(`su-cpu${n}`).classList.toggle('su-hidden', n > setup.opponents);
    document.getElementById(`su-diff${n}`).textContent = (setup.diffs[n - 1] || 'normal').toUpperCase();
  }
  document.getElementById('su-size').textContent = SIZE_LABEL[setup.size];
  document.getElementById('su-biome').textContent = BIOME_LABEL[setup.biome];
}

{
  for (let n = 1; n <= 3; n++) {
    document.getElementById(`su-n${n}`).addEventListener('click', () => {
      setup.opponents = n;
      saveSetup(); syncSetupWidgets(); audio.sfx('select');
    });
    document.getElementById(`su-diff${n}`).addEventListener('click', () => {
      const cur = DIFF_ORDER.indexOf(setup.diffs[n - 1] || 'normal');
      setup.diffs[n - 1] = DIFF_ORDER[(cur + 1) % DIFF_ORDER.length];
      saveSetup(); syncSetupWidgets(); audio.sfx('select');
    });
  }
  document.getElementById('su-size').addEventListener('click', () => {
    const keys = Object.keys(SIZES);
    setup.size = keys[(keys.indexOf(setup.size) + 1) % keys.length];
    saveSetup(); syncSetupWidgets(); audio.sfx('select');
  });
  document.getElementById('su-biome').addEventListener('click', () => {
    const keys = Object.keys(BIOME_LABEL);
    setup.biome = keys[(keys.indexOf(setup.biome) + 1) % keys.length];
    saveSetup(); syncSetupWidgets(); audio.sfx('select');
  });
  document.getElementById('su-start').addEventListener('click', () => { audio.sfx('ack'); showBrief(); });
  document.getElementById('su-back').addEventListener('click', () => { audio.sfx('select'); showTitle(); });

  document.getElementById('tb-new').addEventListener('click', showSetup);
  document.getElementById('tb-continue').addEventListener('click', () => {
    audio.ensure(); audio.resume();
    continueMatch();
  });
  document.getElementById('tb-settings').addEventListener('click', () => {
    audio.ensure(); audio.resume();
    openMenu('title');
  });
}

// ------------------------------------------------------------ pause menu --

const elMenu = document.getElementById('menu');
const elMenuMain = document.getElementById('menu-main');
const elMenuSettings = document.getElementById('menu-settings');
let menuOpen = false;
let menuContext = 'pause';         // 'pause' (in-game) | 'title' (settings only)

function showMenuPane(pane) {
  elMenuMain.style.display = pane === 'main' ? 'flex' : 'none';
  elMenuSettings.style.display = pane === 'settings' ? 'flex' : 'none';
  document.querySelector('#menu-box .menu-title').textContent =
    menuContext === 'title' ? 'SETTINGS' : 'OPERATION PAUSED';
}

function openMenu(context = 'pause') {
  menuOpen = true;
  menuContext = context;
  if (input) input.blocked = true;
  if (context === 'title') { syncSettingsWidgets(); showMenuPane('settings'); }
  else showMenuPane('main');
  elMenu.classList.add('open');
  audio.sfx('select');
}

function closeMenu() {
  menuOpen = false;
  if (input) input.blocked = false;
  elMenu.classList.remove('open');
}

function quitToTitle() {
  closeMenu();
  paused = false;
  elPaused.style.display = 'none';
  audio.stopMusic();
  audio.musicOn = true; // arm music for the next match
  showTitle();          // the running match stays warm for CONTINUE
}

function syncSettingsWidgets() {
  document.getElementById('set-master').value = settings.master;
  document.getElementById('set-music').value = settings.musicVol;
  document.getElementById('set-camspeed').value = settings.camSpeed;
  const m = document.getElementById('set-musicon');
  m.textContent = audio.musicOn ? 'ON' : 'OFF';
  m.classList.toggle('on', audio.musicOn);
  const v = document.getElementById('set-voice');
  v.textContent = settings.voice ? 'ON' : 'OFF';
  v.classList.toggle('on', settings.voice);
  const eg = document.getElementById('set-edge');
  eg.textContent = settings.edgeScroll ? 'ON' : 'OFF';
  eg.classList.toggle('on', settings.edgeScroll);
}

{
  document.getElementById('mb-resume').addEventListener('click', closeMenu);
  document.getElementById('mb-quit').addEventListener('click', quitToTitle);
  document.getElementById('mb-settings').addEventListener('click', () => {
    syncSettingsWidgets();
    showMenuPane('settings');
  });
  document.getElementById('mb-back').addEventListener('click', () => {
    if (menuContext === 'title') closeMenu();
    else showMenuPane('main');
  });
  // clicking the dark backdrop resumes; clicks inside the box stay put
  elMenu.addEventListener('click', (e) => { if (e.target === elMenu) closeMenu(); });

  document.getElementById('set-master').addEventListener('input', (e) => {
    settings.master = parseFloat(e.target.value);
    audio.ensure(); audio.setMaster(settings.master);
    audio.sfx('tick');
    saveSettings(settings);
  });
  document.getElementById('set-music').addEventListener('input', (e) => {
    settings.musicVol = parseFloat(e.target.value);
    audio.ensure(); audio.setMusicVol(settings.musicVol);
    saveSettings(settings);
  });
  document.getElementById('set-musicon').addEventListener('click', () => {
    audio.ensure();
    audio.toggleMusic();
    syncSettingsWidgets();
  });
  document.getElementById('set-voice').addEventListener('click', () => {
    settings.voice = !settings.voice;
    audio.voiceOn = settings.voice;
    if (settings.voice) audio.say('Voice online', true);
    syncSettingsWidgets();
    saveSettings(settings);
  });
  document.getElementById('set-camspeed').addEventListener('input', (e) => {
    settings.camSpeed = parseFloat(e.target.value);
    saveSettings(settings);
  });
  document.getElementById('set-edge').addEventListener('click', () => {
    settings.edgeScroll = !settings.edgeScroll;
    syncSettingsWidgets();
    saveSettings(settings);
  });
}

function typeBriefing() {
  const el = document.getElementById('briefing-text');
  const text = briefingText();
  el.textContent = '';
  let i = 0;
  const tick = () => {
    if (state !== 'brief') return;
    i += 2;
    el.textContent = text.slice(0, i);
    if (i < text.length) setTimeout(tick, 16);
  };
  tick();
}

function advanceScreen() {
  audio.ensure(); audio.resume();
  if (state === 'title') showSetup();
  else if (state === 'setup') { audio.sfx('ack'); showBrief(); }
  else if (state === 'brief') startMatch();
  else if (state === 'end') showTitle();
}
// briefing/end screens also advance on click/tap (touch, embedded iframes)
for (const el of [elBrief, elEnd]) el.addEventListener('click', advanceScreen);

window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && !menuOpen) advanceScreen();
  if (e.code === 'Escape') {
    if (menuOpen) { closeMenu(); return; }
    if (state === 'play') {
      if (!input.consumeEscape()) openMenu('pause');
    } else if (state === 'setup') showTitle();
  }
  if (e.code === 'KeyP' && state === 'play' && !menuOpen) {
    paused = !paused;
    elPaused.style.display = paused ? 'flex' : 'none';
  }
  if (e.code === 'KeyM') {
    audio.ensure();
    audio.toggleMusic();
  }
});

// ------------------------------------------------------------------ loop --

function resize() {
  const w = viewEl.clientWidth, h = viewEl.clientHeight;
  renderer.setSize(Math.floor(w / 2), Math.floor(h / 2), false);
  canvas.style.width = '100%';
  canvas.style.height = '100%';
}
window.addEventListener('resize', resize);
resize();

let last = performance.now();
let fogT = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (state !== 'play') { renderer.clear(); return; }

  const halted = paused || menuOpen;
  if (!halted && !game.over) {
    game.tick(dt * speedFactor);
    for (const a of ais) a.tick(dt * speedFactor);
  }

  input.tickScroll(dt);
  ui.update(dt);

  if (game.oreDirty) { game.oreDirty = false; redrawOre(); }
  fogT -= dt;
  if (fogT <= 0) { fogT = 0.2; redrawFog(); }

  syncEntities(dt);
  syncFx(halted ? 0 : dt);
  syncPlacementGhost();

  // camera: scene lives at y' = -mapY, camera looks down -z
  const w = viewEl.clientWidth / 2, h = viewEl.clientHeight / 2; // render px
  const cellsW = w / (TILE * cam.zoom / 2);
  const cellsH = h / (TILE * cam.zoom / 2);
  camera.position.set(cam.x, -cam.y, 5);
  camera.left = -cellsW / 2;
  camera.right = cellsW / 2;
  camera.top = cellsH / 2;
  camera.bottom = -cellsH / 2;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);

  ui.drawRadarViewRect(cam.x - cellsW / 2, cam.y - cellsH / 2, cam.x + cellsW / 2, cam.y + cellsH / 2);

  if (game.over && !endShown) {
    endShown = true;
    setTimeout(() => {
      closeMenu();
      state = 'end';
      setSidebar(false);
      ui.showEnd(game.won, game.players.player.stats);
      audio.stopMusic();
      audio.sfx(game.won ? 'ready' : 'zapdown');
    }, 1800);
  }
}
requestAnimationFrame(frame);


// smoke-test hooks: let automated checks poke the sim
window.__game_test = {
  spawn: (house, key, x, y) => game.addUnit(game.players[house], key, x, y),
  build: (house, key, x, y) => game.addBuilding(game.players[house], key, x, y, { instant: true }),
  credits: (house, n) => { game.players[house].credits = n; },
  placeReady: (x, y) => game.placeBuilding(game.players.player, x, y),
  cam: (x, y) => { cam.x = x; cam.y = y; },
  attack: () => {
    for (const u of game.units) {
      if (u.house !== 'player' || !u.def.weapon) continue;
      game.orderAttackMove(u, game.map.size - 14, 10);
    }
  },
  moveOrder: (unit, x, y) => game.orderMove(unit, x, y),
  harvestOrder: (unit, cell) => game.orderHarvest(unit, cell),
  findCells: () => {
    // first free gem cell and non-gem ore cell, for balance tests
    const m = game.map;
    let gem = null, ore = null;
    for (let y = 1; y < m.size - 1 && (!gem || !ore); y++) {
      for (let x = 1; x < m.size - 1 && (!gem || !ore); x++) {
        const i = m.idx(x, y);
        if (m.ore[i] <= 0 || m.blocked[i] || m.occupant[i]) continue;
        if (m.gem[i] && !gem) gem = [x, y];
        if (!m.gem[i] && !ore && m.ore[i] > 150) ore = [x, y];
      }
    }
    return gem && ore ? { gem, ore } : null;
  },
  wipe: (house) => {
    for (const u of game.units) if (u.house === house) u.hp = -1;
    for (const b of game.buildings) if (b.house === house) { b.hp = 0; game.destroyBuilding(b); }
    for (const u of game.units) if (u.house === house) game.destroyUnit(u);
  },
};
window.__game_debug = () => (state !== 'play' ? { state } : {
  state,
  time: Math.round(game.time * 10) / 10,
  units: game.units.length,
  buildings: game.buildings.length,
  playerCredits: Math.round(game.players.player.credits),
  enemyCredits: Math.round(game.players.enemy?.credits ?? 0),
  enemyProdB: game.players.enemy?.prod.building?.key || null,
  enemyProdU: game.players.enemy?.prod.unit?.key || null,
  opponents: Object.values(game.players).filter((p) => !p.isHuman).length,
  mapSize: game.map.size,
  biome: game.map.biome,
  oreTotal: game.map.ore.reduce((a, v) => a + v, 0),
  gemCells: game.map.gem.reduce((a, v) => a + v, 0),
  over: game.over,
});
