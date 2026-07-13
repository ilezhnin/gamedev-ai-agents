// Boot + render loop. Three.js draws the world: terrain baked to a canvas
// texture, entities as textured quads with per-facing pixel art, fog of war
// as an overlay texture. DOM handles the sidebar; input.js drives orders.

import * as THREE from '../lib/three.module.min.js';
import { buildSprites, drawTitleLogo, TILE, FACINGS } from './sprites.js';
import { GameMap, T, V_ICE, LAYOUTS } from './map.js';
import { Game, facingIndex, SAVE_VERSION } from './game.js';
import { findPath } from './pathfind.js';
import { AI } from './ai.js';
import { UI } from './ui.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { loadSettings, saveSettings } from './settings.js';
import { BUILDINGS, ECONOMY } from './rules.js';
import { makeCanvas, HOUSE_UI } from './palette.js';

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

// -------------------------------------------------------------- cursors ----

// 16x16 crosshair cursors baked to data-URIs at boot. Hot spot at the centre
// (8,8). Kept subtle: thin strokes, muted colours matching the retro palette.
function makeCursor(draw) {
  const [c, g] = makeCanvas(16, 16);
  draw(g);
  return `url(${c.toDataURL('image/png')}) 8 8, crosshair`;
}
const CURSORS = {
  default: 'crosshair',
  move: makeCursor((g) => {
    g.fillStyle = '#7fe08a';
    g.fillRect(7, 2, 2, 12); g.fillRect(2, 7, 12, 2);
    g.fillStyle = '#0a0a0a';
    g.fillRect(7, 1, 2, 1); g.fillRect(7, 14, 2, 1);
    g.fillRect(1, 7, 1, 2); g.fillRect(14, 7, 1, 2);
  }),
  attack: makeCursor((g) => {
    g.strokeStyle = '#e04a3a'; g.lineWidth = 2;
    g.beginPath(); g.arc(8, 8, 5, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#e04a3a';
    g.fillRect(7, 0, 2, 4); g.fillRect(7, 12, 2, 4);
    g.fillRect(0, 7, 4, 2); g.fillRect(12, 7, 4, 2);
    g.fillStyle = '#ffdd55'; g.fillRect(7, 7, 2, 2);
  }),
  noentry: makeCursor((g) => {
    g.strokeStyle = '#e04a3a'; g.lineWidth = 2;
    g.beginPath(); g.arc(8, 8, 6, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(4, 4); g.lineTo(12, 12); g.stroke();
  }),
};

// ------------------------------------------------------------ title anim ----

// The title logo canvas doubles as a slow animated sky: drifting cloud bands
// with the occasional lightning flicker, redrawn ~10fps only while visible.
let titleRaf = 0, titleT0 = 0, titleLastDraw = 0;
function startTitleAnim() {
  if (titleRaf) return;
  const el = document.getElementById('title-logo');
  titleT0 = performance.now();
  titleLastDraw = 0;
  const step = (now) => {
    if (state !== 'title') { titleRaf = 0; return; }
    if (now - titleLastDraw >= 100) {
      titleLastDraw = now;
      drawTitleLogo(el, (now - titleT0) / 1000);
    }
    titleRaf = requestAnimationFrame(step);
  };
  titleRaf = requestAnimationFrame(step);
}

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
let speedFactor = settings.gameSpeed || 1;
let previewSeed = (Math.random() * 1e9) | 0;   // seed shared by preview + match

// -------------------------------------------------------- operation setup --

const SIZES = { small: 48, medium: 64, large: 96 };
const SIZE_LABEL = { small: 'SMALL 48×48', medium: 'MEDIUM 64×64', large: 'LARGE 96×96' };
const BIOME_LABEL = { forest: 'GREEN FOREST', taiga: 'SNOW TAIGA', desert: 'DESERT WASTE' };
// layout templates offered on the setup screen (RANDOM first, then LAYOUTS)
const LAYOUT_KEYS = ['random', ...LAYOUTS];
const LAYOUT_LABEL = {
  random: 'RANDOM', river: 'RIVER', lakes: 'LAKES', ridges: 'RIDGES',
  islands: 'ISLANDS', open: 'OPEN STEPPE', maze: 'DEEP WOODS',
};
const DIFF_ORDER = ['easy', 'normal', 'hard'];
const ENEMY_HOUSES = ['enemy', 'enemy2', 'enemy3'];

function loadSetup() {
  const def = { opponents: 1, diffs: ['normal', 'normal', 'normal'], size: 'medium', biome: 'forest', layout: 'random' };
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
  for (const q of rallyFlags.splice(0)) q.dispose(scene);
  while (scene.children.length) scene.remove(scene.children[0]);

  const size = SIZES[setup.size] || 64;
  const seed = previewSeed;   // what the setup preview showed is what we play
  const starts = START_SPOTS.slice(0, 1 + setup.opponents)
    .map((f) => ({ x: Math.round(f.x * size), y: Math.round(f.y * size) }));
  const houses = ENEMY_HOUSES.slice(0, setup.opponents);

  map = new GameMap(size, seed, setup.biome, starts, setup.layout || 'random');
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

// ------------------------------------------------------------ save / load --

const SAVE_KEY = 'iron-curtain-save';
const SAVE_MAX_BYTES = 3.5 * 1024 * 1024;   // skip autosave past this (safety)

// full snapshot: sim state (game.serialize) + opponent AI plans
function serializeSave() {
  const data = game.serialize();
  data.ais = ais.map((a) => a.serialize());
  return data;
}

function autosave() {
  if (!game || game.over || state !== 'play') return;
  try {
    const str = JSON.stringify(serializeSave());
    if (str.length > SAVE_MAX_BYTES) return;   // too large: skip silently
    localStorage.setItem(SAVE_KEY, str);
  } catch { /* quota exceeded or serialize error: leave the old save be */ }
}

function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ok */ }
}

// parse + validate the stored save; a corrupt/version-mismatched blob is
// deleted and treated as "no save"
function readSave() {
  let raw;
  try { raw = localStorage.getItem(SAVE_KEY); } catch { return null; }
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!data || data.version !== SAVE_VERSION || !data.map) { clearSave(); return null; }
    return data;
  } catch { clearSave(); return null; }
}

function hasValidSave() { return !!readSave(); }

// tear down all renderer views (safe for both quad- and line-based fx)
function teardownScene() {
  for (const [, v] of entityViews) disposeEntityView(v);
  entityViews.clear();
  for (const v of fxViews.splice(0)) {
    if (v.quad) v.quad.dispose(scene);
    if (v.line) { scene.remove(v.line); v.geo.dispose(); v.mat.dispose(); }
  }
  for (const p of game ? game.projectiles : []) if (p.view) p.view.dispose(scene);
  if (syncFx.live) syncFx.live.clear();
  for (const q of rallyFlags.splice(0)) q.dispose(scene);
  while (scene.children.length) scene.remove(scene.children[0]);
}

function centerCamOnPlayer() {
  let sx = 0, sy = 0, n = 0;
  for (const b of game.buildings) {
    if (b.dead || b.house !== 'player') continue;
    const [cx, cy] = b.centre(); sx += cx; sy += cy; n++;
  }
  if (n === 0) {
    for (const u of game.units) {
      if (u.dead || u.house !== 'player') continue;
      sx += u.x; sy += u.y; n++;
    }
  }
  if (n) { cam.x = sx / n; cam.y = sy / n; }
  cam.zoom = 2.0;
}

// rebuild a live match from localStorage; returns false if nothing loadable
function loadSavedGame() {
  const data = readSave();
  if (!data) return false;
  try {
    teardownScene();
    game = Game.load(data, audio);
    map = game.map;
    ais = (data.ais || []).map((s) => {
      const ai = new AI(game, game.players[s.house], s.level);
      ai.restore(s);
      return ai;
    }).filter((a) => a.p);
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
    game.recomputeVision();
    redrawFog();
    ui.setMode('normal');
    centerCamOnPlayer();
    state = 'play';
    endShown = false;
    return true;
  } catch (e) {
    console.error('save load failed:', e);
    clearSave();
    return false;
  }
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
      else if (t === T.WATER) {
        tile = (v === V_ICE && tiles.ice) ? tiles.ice[(x + y) % tiles.ice.length]
          : tiles.water[v % tiles.water.length];
      } else if (t === T.ROCK) tile = tiles.rock[v % tiles.rock.length];
      else if (t === T.RUIN) tile = tiles.ruin[v % tiles.ruin.length];
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
  v = { kind: 'building', house: b.house, quads: {} };
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
    // a captured building changed colour — rebuild its view with new tint
    let ev = entityViews.get(b.id);
    if (ev && ev.kind === 'building' && ev.house !== b.house) {
      disposeEntityView(ev); entityViews.delete(b.id);
    }
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
      const c = p.kind === 'rocket' ? sprites.rocket : p.kind === 'flame' ? sprites.flame[0] : sprites.shell;
      const sz = p.kind === 'flame' ? 0.6 : 0.35;
      p.view = new SpriteQuad(scene, c, sz, sz, 2.0);
    }
    if (p.kind === 'flame') p.view.setCanvas(sprites.flame[Math.floor(game.time * 15) % 3]);
    p.view.set(p.x + 0.5, mapY(p.y + 0.5), 2.0);
    p.view.mesh.rotation.z = p.kind === 'flame' ? 0 : -(p.angle + Math.PI / 2);
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

// ---------------------------------------------------------- rally flags ----

// A pooled little flag marker at each selected factory/barracks rally point.
const rallyFlags = [];
function syncRallyFlags() {
  const wanted = input
    ? input.selection.filter((s) => s.isBuilding && !s.dead && s.house === 'player'
        && s.def.factoryFor && s.rally)
    : [];
  while (rallyFlags.length < wanted.length) {
    rallyFlags.push(new SpriteQuad(scene, sprites.flag, 0.55, 0.72, 1.55));
  }
  for (let i = 0; i < rallyFlags.length; i++) {
    const q = rallyFlags[i];
    if (i < wanted.length) {
      const [rx, ry] = wanted[i].rally;
      q.mesh.visible = true;
      q.set(rx + 0.5, mapY(ry + 0.5) + 0.3, 1.55);
    } else q.mesh.visible = false;
  }
}

// -------------------------------------------------------------- cursors ----

// hovered world cell (fractional) or null when the pointer is off-viewport
function hoveredCell() {
  if (!input || !input.mouse.seen) return null;
  const r = viewEl.getBoundingClientRect();
  const mx = input.mouse.x, my = input.mouse.y;
  if (mx < r.left || mx > r.right || my < r.top || my > r.bottom) return null;
  return input.screenToWorld(mx - r.left, my - r.top, r);
}

// is there a visible enemy under (wx,wy)? used to pick the attack cursor
function enemyAtCursor(wx, wy) {
  for (const u of game.units) {
    if (u.dead || u.house === 'player') continue;
    if (Math.hypot(u.x - wx, u.y - wy) < 0.8 && game.isVisibleToPlayer(u)) return true;
  }
  const cx = Math.floor(wx), cy = Math.floor(wy);
  for (const b of game.buildings) {
    if (b.dead || b.house === 'player') continue;
    if (b.containsCell(cx, cy) && (b.seen || game.isVisibleToPlayer(b))) return true;
  }
  return false;
}

let cursorT = 0;
function updateCursor(dt) {
  cursorT -= dt;
  if (cursorT > 0) return;
  cursorT = 0.06;
  // sell / repair modes own the cursor via ui.setMode — leave them be
  if (ui.mode === 'sell' || ui.mode === 'repair') return;
  const p = game.players.player;
  const hv = hoveredCell();
  let cur = CURSORS.default;
  if (p.readyBuilding) {
    if (hv) {
      const cx = Math.floor(hv[0]), cy = Math.floor(hv[1]);
      if (!game.map.inBounds(cx, cy) || !game.explored[game.map.idx(cx, cy)]) cur = CURSORS.noentry;
    }
  } else if (hv) {
    const units = input.selectedUnits();
    if (units.length) {
      const hasWeapon = units.some((u) => u.def.weapon);
      cur = (hasWeapon && enemyAtCursor(hv[0], hv[1])) ? CURSORS.attack : CURSORS.move;
    }
  }
  if (viewEl.style.cursor !== cur) viewEl.style.cursor = cur;
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
  const canContinue = !!(game && !game.over && !endShown) || hasValidSave();
  document.getElementById('tb-continue').classList.toggle('disabled', !canContinue);
  elTitle.classList.remove('hidden');
  startTitleAnim();
}

function showSetup() {
  hideScreens();
  state = 'setup';
  previewSeed = (Math.random() * 1e9) | 0;   // fresh battlefield each visit
  syncSetupWidgets();
  drawSetupPreview();
  elSetup.classList.remove('hidden');
  audio.ensure(); audio.resume();
  audio.sfx('select');
}

// ---- setup battlefield preview ------------------------------------------

// Renders a radar-style minimap of the exact map the current setup + seed
// will generate. Cheap enough to regenerate on every option change.
const PV = document.getElementById('su-preview');
const PVG = PV.getContext('2d');
function previewTerrainRGB(m, i) {
  const t = m.terrain[i];
  let r = 60, g = 92, b = 44;                 // grass
  if (t === T.WATER) { r = 26; g = 60; b = 110; }
  else if (t === T.ROCK) { r = 90; g = 86; b = 80; }
  else if (t === T.TREE) { r = 30; g = 62; b = 26; }
  else if (t === T.RUIN) { r = 78; g = 72; b = 66; }
  else if (t === T.DIRT) { r = 110; g = 88; b = 52; }
  if (m.ore[i] > 0) {
    if (m.gem[i]) { r = 90; g = 200; b = 220; }
    else { r = 190; g = 150; b = 40; }
  }
  return [r, g, b];
}
function drawSetupPreview() {
  const size = SIZES[setup.size] || 64;
  const starts = START_SPOTS.slice(0, 1 + setup.opponents)
    .map((f) => ({ x: Math.round(f.x * size), y: Math.round(f.y * size) }));
  const m = new GameMap(size, previewSeed, setup.biome, starts, setup.layout || 'random');
  const off = document.createElement('canvas');
  off.width = size; off.height = size;
  const og = off.getContext('2d');
  const img = og.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = m.idx(x, y), o = i * 4;
      const [r, g, b] = previewTerrainRGB(m, i);
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
  }
  og.putImageData(img, 0, 0);
  PVG.imageSmoothingEnabled = false;
  PVG.clearRect(0, 0, PV.width, PV.height);
  PVG.drawImage(off, 0, 0, PV.width, PV.height);
  // start markers: player then CPUs, in their house colours
  const scale = PV.width / size;
  const houses = ['player', ...ENEMY_HOUSES.slice(0, setup.opponents)];
  starts.forEach((st, i) => {
    const col = (HOUSE_UI[houses[i]] || HOUSE_UI.enemy).building;
    PVG.fillStyle = '#000';
    PVG.fillRect(st.x * scale - 3, st.y * scale - 3, 6, 6);
    PVG.fillStyle = col;
    PVG.fillRect(st.x * scale - 2, st.y * scale - 2, 4, 4);
  });
}

function showBrief() {
  hideScreens();
  state = 'brief';
  elBrief.classList.remove('hidden');
  typeBriefing();
  audio.sfx('ready');
}

const elLoading = document.getElementById('loading');

// synchronous match build — used by both the normal flow and the test hooks
function buildAndStart() {
  newGame();
  state = 'play';
  endShown = false;
}

function startMatch() {
  hideScreens();
  setSidebar(true);
  // brief loading flash — generating a 96×96 map can take a beat. Show the
  // overlay, let it paint one frame, then do the synchronous build.
  elLoading.classList.add('on');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    buildAndStart();
    elLoading.classList.remove('on');
    if (audio.musicOn) audio.startMusic();
    audio.say('Battle control online', true);
  }));
}

function continueMatch() {
  // prefer the warm in-memory match; otherwise reload the last save from disk
  if (game && !game.over && !endShown) {
    hideScreens();
    state = 'play';
    setSidebar(true);
    if (audio.musicOn) audio.startMusic();
    return;
  }
  if (!hasValidSave()) return;
  hideScreens();
  setSidebar(true);
  elLoading.classList.add('on');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const ok = loadSavedGame();
    elLoading.classList.remove('on');
    if (!ok) { showTitle(); return; }
    if (audio.musicOn) audio.startMusic();
    audio.say('Battle control online', true);
  }));
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
  document.getElementById('su-layout').textContent = LAYOUT_LABEL[setup.layout] || 'RANDOM';
}

{
  for (let n = 1; n <= 3; n++) {
    document.getElementById(`su-n${n}`).addEventListener('click', () => {
      setup.opponents = n;
      saveSetup(); syncSetupWidgets(); drawSetupPreview(); audio.sfx('select');
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
    saveSetup(); syncSetupWidgets(); drawSetupPreview(); audio.sfx('select');
  });
  document.getElementById('su-biome').addEventListener('click', () => {
    const keys = Object.keys(BIOME_LABEL);
    setup.biome = keys[(keys.indexOf(setup.biome) + 1) % keys.length];
    saveSetup(); syncSetupWidgets(); drawSetupPreview(); audio.sfx('select');
  });
  document.getElementById('su-layout').addEventListener('click', () => {
    const cur = LAYOUT_KEYS.indexOf(setup.layout);
    setup.layout = LAYOUT_KEYS[(cur + 1) % LAYOUT_KEYS.length];
    saveSetup(); syncSetupWidgets(); drawSetupPreview(); audio.sfx('select');
  });
  document.getElementById('su-regen').addEventListener('click', () => {
    previewSeed = (Math.random() * 1e9) | 0;
    drawSetupPreview(); audio.sfx('select');
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
  autosave();           // persist so CONTINUE survives even a later reload
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
  document.getElementById('set-gamespeed').value = settings.gameSpeed;
  document.getElementById('set-gamespeed-val').textContent = `${settings.gameSpeed.toFixed(1)}×`;
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
  document.getElementById('set-gamespeed').addEventListener('input', (e) => {
    settings.gameSpeed = parseFloat(e.target.value);
    speedFactor = settings.gameSpeed;
    document.getElementById('set-gamespeed-val').textContent = `${settings.gameSpeed.toFixed(1)}×`;
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
let saveT = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (state !== 'play') { renderer.clear(); return; }

  const halted = paused || menuOpen;
  if (!halted && !game.over) {
    game.tick(dt * speedFactor);
    for (const a of ais) a.tick(dt * speedFactor);
    // periodic autosave (wall-clock, so it's independent of game speed)
    saveT += dt;
    if (saveT >= 30) { saveT = 0; autosave(); }
  }

  input.tickScroll(dt);
  ui.update(dt, input.selection);

  if (game.oreDirty) { game.oreDirty = false; redrawOre(); }
  fogT -= dt;
  if (fogT <= 0) { fogT = 0.2; redrawFog(); }

  syncEntities(dt);
  syncFx(halted ? 0 : dt);
  syncPlacementGhost();
  syncRallyFlags();
  updateCursor(dt);

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
    clearSave();   // match decided — nothing left to continue
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
// persist the match if the tab is closed/reloaded mid-battle
window.addEventListener('beforeunload', () => {
  if (state === 'play' && game && !game.over) autosave();
});

requestAnimationFrame(frame);
showTitle();        // sets the CONTINUE button state (also starts title sky)


// smoke-test hooks: let automated checks poke the sim
window.__game_test = {
  spawn: (house, key, x, y) => game.addUnit(game.players[house], key, x, y),
  build: (house, key, x, y) => game.addBuilding(game.players[house], key, x, y, { instant: true }),
  credits: (house, n) => { game.players[house].credits = n; },
  placeReady: (x, y) => game.placeBuilding(game.players.player, x, y),
  // force an autosave to localStorage (drives the save/load test)
  save: () => { autosave(); return true; },
  hasSave: () => hasValidSave(),
  // order the first player unit to move (drives order-persistence checks)
  moveAnyUnit: (x, y) => {
    const u = game.units.find((u) => !u.dead && u.house === 'player');
    if (!u) return 0;
    game.orderMove(u, x, y);
    return u.id;
  },
  cam: (x, y) => { cam.x = x; cam.y = y; },
  // start a fresh match with a setup patch {opponents,size,biome,layout};
  // size accepts a key ('small') or the numeric edge (48). Returns the
  // resolved match info (map.layout is concrete even when 'random' was asked)
  startWith: (patch = {}) => {
    const p = { ...patch };
    if (typeof p.size === 'number') {
      const key = Object.keys(SIZES).find((k) => SIZES[k] === p.size);
      if (key) p.size = key; else delete p.size;
    }
    Object.assign(setup, p);
    hideScreens();
    setSidebar(true);
    buildAndStart();   // synchronous so callers can read map info immediately
    if (audio.musicOn) audio.startMusic();
    return { opponents: setup.opponents, size: map.size, biome: map.biome, layout: map.layout };
  },
  // flood-fill connectivity: every start reachable from starts[0]?
  connectivity: () => game.map.connectivityOK(),
  // lift the fog everywhere (terrain inspection / screenshots)
  revealAll: () => { game.explored.fill(1); game.visible.fill(1); redrawFog(); },
  // construction-yard count (one per living house)
  conyards: () => game.buildings.filter((b) => !b.dead && b.key === 'conyard').length,
  // accelerate the sim clock for headless soak tests (1 = real time)
  setSpeed: (n) => { speedFactor = Math.max(0.25, Math.min(8, n)); return speedFactor; },
  attack: () => {
    for (const u of game.units) {
      if (u.house !== 'player' || !u.def.weapon) continue;
      game.orderAttackMove(u, game.map.size - 14, 10);
    }
  },
  moveOrder: (unit, x, y) => game.orderMove(unit, x, y),
  harvestOrder: (unit, cell) => game.orderHarvest(unit, cell),
  // select a player building by key and give it a rally point (drives the
  // rally-flag marker); returns how many rally flags are currently visible
  selectAndRally: (key, rx, ry) => {
    const b = game.buildings.find((b) => !b.dead && b.house === 'player' && b.key === key);
    if (!b) return false;
    input.selection = [b];
    b.rally = [rx, ry];
    return true;
  },
  rallyFlagCount: () => rallyFlags.filter((q) => q.mesh.visible).length,
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
  // --- roster-content test helpers (used by tests/content.js) ---
  canProduce: (house, kind, key) => game.canProduce(game.players[house], kind, key),
  power: (house) => ({ made: game.players[house].powerMade, used: game.players[house].powerUsed, radar: game.players[house].hasRadar }),
  buildingInfo: (house, key) => {
    const b = game.buildings.find((b) => !b.dead && b.house === house && b.key === key);
    return b ? { id: b.id, hp: Math.round(b.hp), maxHp: b.maxHp, repairing: !!b.repairing, owner: b.house, cx: b.cx, cy: b.cy } : null;
  },
  // destroy a single structure by house+key (drives conyard-recovery test)
  killBuilding: (house, key) => {
    const b = game.buildings.find((b) => !b.dead && b.house === house && b.key === key);
    if (!b) return false;
    game.destroyBuilding(b, null);
    return true;
  },
  // knock a building down to a fraction of its hp (drives the AI repair test)
  hurtBuilding: (house, key, frac) => {
    const b = game.buildings.find((b) => !b.dead && b.house === house && b.key === key);
    if (!b) return null;
    b.hp = Math.max(1, Math.round(b.maxHp * frac));
    return { id: b.id, hp: Math.round(b.hp), maxHp: b.maxHp };
  },
  // drain ore around a house's refinery (drives the expansion-refinery test)
  drainOre: (house, r) => {
    const b = game.buildings.find((b) => !b.dead && b.house === house && b.key === 'refinery');
    if (!b) return 0;
    const [cx, cy] = b.centre();
    const m = game.map;
    let n = 0;
    for (let y = Math.max(0, (cy | 0) - r); y <= Math.min(m.size - 1, (cy | 0) + r); y++) {
      for (let x = Math.max(0, (cx | 0) - r); x <= Math.min(m.size - 1, (cx | 0) + r); x++) {
        const i = m.idx(x, y);
        if (m.ore[i]) { m.ore[i] = 0; m.gem[i] = 0; n++; }
      }
    }
    game.oreDirty = true;
    return n;
  },
  // per-AI snapshot: personality, difficulty and live wave state
  aiInfo: () => ais.map((a) => ({
    house: a.p.house,
    level: a.level,
    personality: a.personality,
    firstWave: Math.round(a.d.firstWave),
    waveT: Math.round(a.waveT * 10) / 10,
    wavePhase: a.wave ? a.wave.phase : null,
    waveN: a.wave ? a.wave.members.size : 0,
    needRefinery: a.needRefinery,
    buildings: game.buildings.filter((b) => !b.dead && b.owner === a.p).map((b) => b.key),
  })),
  // force a personality on an AI (isolates difficulty in comparison tests)
  setPersonality: (house, name) => {
    const a = ais.find((a) => a.p.house === house);
    if (!a) return false;
    a.applyPersonality(name);
    a.waveT = a.d.firstWave;
    return a.personality;
  },
  // count enemy combat units within r cells of the player's conyard
  enemyNearBase: (r) => {
    const c = game.buildings.find((b) => !b.dead && b.house === 'player' && b.key === 'conyard');
    if (!c) return 0;
    const [cx, cy] = c.centre();
    let n = 0;
    for (const u of game.units) {
      if (u.dead || u.house === 'player' || !u.def.weapon) continue;
      if (Math.hypot(u.x - cx, u.y - cy) <= r) n++;
    }
    return n;
  },
  unitStats: (house, key) => {
    let min = Infinity, maxHp = 0, count = 0;
    for (const u of game.units) {
      if (u.dead || u.house !== house || u.key !== key) continue;
      min = Math.min(min, u.hp); maxHp = Math.max(maxHp, u.maxHp); count++;
    }
    return count ? { minHp: Math.round(min), maxHp, count } : null;
  },
  attackAll: (uHouse, uKey, tHouse, tKey) => {
    const b = game.buildings.find((b) => !b.dead && b.house === tHouse && b.key === tKey);
    if (!b) return 0;
    let n = 0;
    for (const u of game.units) {
      if (u.dead || u.house !== uHouse || u.key !== uKey) continue;
      game.orderAttack(u, b); n++;
    }
    return n;
  },
  ownerAt: (x, y) => {
    const b = game.buildings.find((b) => !b.dead && x >= b.cx && y >= b.cy && x < b.cx + b.def.w && y < b.cy + b.def.h);
    return b ? b.house : null;
  },
  captureOrder: (uHouse, uKey, tHouse, tKey) => {
    const b = game.buildings.find((b) => !b.dead && b.house === tHouse && b.key === tKey);
    const u = game.units.find((u) => !u.dead && u.house === uHouse && u.key === uKey);
    if (!u || !b) return false;
    game.orderCapture(u, b);
    return true;
  },
  // capture the specific structure covering (tx,ty) — avoids matching the
  // wrong same-keyed building elsewhere on the map (e.g. the AI's own base)
  captureAt: (uHouse, uKey, tx, ty) => {
    const b = game.buildings.find((b) => !b.dead && tx >= b.cx && ty >= b.cy && tx < b.cx + b.def.w && ty < b.cy + b.def.h);
    const u = game.units.find((u) => !u.dead && u.house === uHouse && u.key === uKey);
    if (!u || !b) return false;
    game.orderCapture(u, b);
    return true;
  },
  // top-left of a (2r+1) square whose cells are all buildable, edge-safe
  findOpen: (r) => {
    const m = game.map;
    for (let y = r + 3; y < m.size - r - 3; y++) {
      for (let x = r + 3; x < m.size - r - 3; x++) {
        let ok = true;
        for (let dy = -r; dy <= r && ok; dy++)
          for (let dx = -r; dx <= r && ok; dx++)
            if (!m.isBuildable(x + dx, y + dy)) ok = false;
        if (ok) return [x, y];
      }
    }
    return null;
  },
  // findPath result: {len, ex, ey} end cell, or null when unreachable
  path: (sx, sy, tx, ty) => {
    const p = findPath(game.map, sx, sy, tx, ty, null);
    if (!p || p.length === 0) return null;
    const last = p[p.length - 1];
    return { len: p.length, ex: last[0], ey: last[1] };
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
  layout: game.map.layout,
  oreTotal: game.map.ore.reduce((a, v) => a + v, 0),
  gemCells: game.map.gem.reduce((a, v) => a + v, 0),
  over: game.over,
});
