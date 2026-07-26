// Composition root: boots the subsystems, builds a match out of them and runs
// the frame loop. The world is drawn by src/render (a Three.js scene of
// textured quads), screen flow lives in screens.js, orders in input.js.

import { buildSprites, drawTitleLogo } from './sprites.js';
import { GameMap } from './map.js';
import { Game } from './game.js';
import { AI } from './ai.js';
import { UI } from './ui.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { loadSettings } from './settings.js';
import { Renderer } from './render/scene.js';
import { Cursors } from './cursors.js';
import { Screens } from './screens.js';
import { installTestHooks } from './testhooks.js';
import { writeSave, readSave, clearSave, hasValidSave } from './save.js';
import { setup, seed, mapSize, startCells, ENEMY_HOUSES } from './setup.js';

const MAP_SIZE = 64;

// ------------------------------------------------------------------- boot --

const audio = new AudioSys();
const settings = loadSettings();
audio.setMaster(settings.master);
audio.setMusicVol(settings.musicVol);
audio.setSfxVol(settings.sfxVol);
audio.voiceOn = settings.voice;
const sprites = buildSprites();
drawTitleLogo(document.getElementById('title-logo'));

const viewEl = document.getElementById('viewport');
const canvas = document.getElementById('game-canvas');
const renderer = new Renderer(canvas, viewEl, sprites);
const cursors = new Cursors(viewEl);

// camera state in cell units
const cam = { x: 12, y: MAP_SIZE - 14, zoom: 2.0 };

let map, game, ui, input;
let ais = [];

// The sim clock. Speed and the AI freeze are knobs the test hooks turn, and
// stepping is shared by the frame loop and the deterministic headless runs.
const sim = {
  speed: settings.gameSpeed || 1,
  aiHalted: false,          // test hook: freeze AI thinking (duel arenas)
  step(dt, steps) {
    for (let i = 0; i < steps; i++) {
      if (game.over) break;
      game.tick(dt);
      if (!this.aiHalted) for (const a of ais) a.tick(dt);
    }
    return Math.round(game.time * 10) / 10;
  },
};

// ------------------------------------------------------------- new match --

// UI and input outlive individual matches: build them once, then re-point them
// at the new Game.
function bindMatch() {
  if (!ui) {
    ui = new UI(game, sprites, audio);
    input = new Input(game, cam, ui, audio, viewEl);
    input.settings = settings;
  } else {
    ui.reset(game);
    input.reset(game);
  }
}

function newGame() {
  renderer.teardown(game);

  const size = mapSize();
  const mapSeed = seed();   // what the setup preview showed is what we play
  const starts = startCells(size);
  const houses = ENEMY_HOUSES.slice(0, setup.opponents);

  map = new GameMap(size, mapSeed, setup.biome, starts, setup.layout || 'random');
  game = new Game(map, audio, mapSeed ^ 0x9e37, houses);
  ais = houses.map((h, i) => new AI(game, game.players[h], setup.diffs[i] || 'normal'));
  bindMatch();

  renderer.build(map, game);

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

  // neutral supply depots in the contested middle
  game.spawnDepots();

  cam.x = ps.x; cam.y = ps.y; cam.zoom = 2.0;
  game.recomputeVision();
  ui.setMode('normal');
}

// ------------------------------------------------------------ save / load --

// full snapshot: sim state (game.serialize) + opponent AI plans
function autosave() {
  if (!game || game.over || screens.state !== 'play') return;
  const data = game.serialize();
  data.ais = ais.map((a) => a.serialize());
  writeSave(data);
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
    renderer.teardown(game);
    game = Game.load(data, audio);
    map = game.map;
    ais = (data.ais || []).map((s) => {
      const ai = new AI(game, game.players[s.house], s.level);
      ai.restore(s);
      return ai;
    }).filter((a) => a.p);
    bindMatch();
    renderer.build(map, game);
    game.recomputeVision();
    renderer.redrawFog(game);
    ui.setMode('normal');
    centerCamOnPlayer();
    screens.enterPlay();
    return true;
  } catch (e) {
    console.error('save load failed:', e);
    clearSave();
    return false;
  }
}

// ---------------------------------------------------------------- screens --

const screens = new Screens(audio, settings, {
  getGame: () => game,
  getUI: () => ui,
  getInput: () => input,
  buildMatch: newGame,
  loadSavedGame,
  hasValidSave,
  autosave,
  clearSave,
  resize: () => renderer.resize(),
  setSpeed: (n) => { sim.speed = n; },
});
screens.wire();

// ------------------------------------------------------------------ loop --

window.addEventListener('resize', () => renderer.resize());
renderer.resize();

let last = performance.now();
let saveT = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (screens.state !== 'play') { renderer.clear(); return; }

  const halted = screens.halted;
  if (!halted && !game.over) {
    sim.step(dt * sim.speed, 1);
    // periodic autosave (wall-clock, so it's independent of game speed)
    saveT += dt;
    if (saveT >= 30) { saveT = 0; autosave(); }
  }

  input.tickScroll(dt);
  ui.update(dt, input.selection);

  renderer.sync(dt, { game, map, input, halted });
  cursors.update(dt, { game, ui, input });

  const { cellsW, cellsH } = renderer.render(cam);

  ui.drawRadarViewRect(cam.x - cellsW / 2, cam.y - cellsH / 2, cam.x + cellsW / 2, cam.y + cellsH / 2);

  screens.checkMatchEnd();
}

// persist the match if the tab is closed/reloaded mid-battle
window.addEventListener('beforeunload', () => {
  if (screens.state === 'play' && game && !game.over) autosave();
});

// a hidden tab must fall silent: rAF already freezes the sim in background,
// but WebAudio timers keep playing — suspend the whole context until we're
// visible again (and cut any in-flight advisor speech)
document.addEventListener('visibilitychange', () => {
  if (!audio.ctx) return;
  if (document.hidden) {
    audio.ctx.suspend();
    try { speechSynthesis.cancel(); } catch { /* not available */ }
  } else {
    audio.ctx.resume();
  }
});

installTestHooks({
  audio, cam, sim, screens, renderer,
  game: () => game,
  ais: () => ais,
  input: () => input,
  autosave,
  hasValidSave,
});

requestAnimationFrame(frame);
screens.showTitle();   // sets the CONTINUE button state (also starts title sky)
