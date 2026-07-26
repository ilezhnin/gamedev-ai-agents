// Operation setup: the persisted match options (opponents, difficulties, map
// size, biome, layout), the seed shared between the preview and the match, and
// the radar-style battlefield preview drawn on the setup screen.

import { GameMap, T, LAYOUTS } from './map.js';
import { HOUSE_UI } from './palette.js';

export const SIZES = { small: 48, medium: 64, large: 96 };
const SIZE_LABEL = { small: 'SMALL 48×48', medium: 'MEDIUM 64×64', large: 'LARGE 96×96' };
const BIOME_LABEL = { forest: 'GREEN FOREST', taiga: 'SNOW TAIGA', desert: 'DESERT WASTE' };
// layout templates offered on the setup screen (RANDOM first, then LAYOUTS)
const LAYOUT_KEYS = ['random', ...LAYOUTS];
const LAYOUT_LABEL = {
  random: 'RANDOM', river: 'RIVER', lakes: 'LAKES', ridges: 'RIDGES',
  islands: 'ISLANDS', open: 'OPEN STEPPE', maze: 'DEEP WOODS',
};
const DIFF_ORDER = ['easy', 'normal', 'hard'];
export const ENEMY_HOUSES = ['enemy', 'enemy2', 'enemy3'];

// spawn corners as map fractions: human SW, then NE / NW / SE for CPUs
const START_SPOTS = [
  { x: 0.14, y: 0.82 },  // player
  { x: 0.82, y: 0.10 },  // cpu 1
  { x: 0.12, y: 0.10 },  // cpu 2
  { x: 0.84, y: 0.80 },  // cpu 3
];

function loadSetup() {
  const def = { opponents: 1, diffs: ['normal', 'normal', 'normal'], size: 'medium', biome: 'forest', layout: 'random' };
  try {
    const raw = localStorage.getItem('iron-curtain-setup');
    return raw ? { ...def, ...JSON.parse(raw) } : def;
  } catch { return def; }
}
export const setup = loadSetup();

export function saveSetup() {
  try { localStorage.setItem('iron-curtain-setup', JSON.stringify(setup)); } catch { /* ok */ }
}

// The seed lives outside `setup` so it never lands in the persisted options.
let previewSeed = (Math.random() * 1e9) | 0;   // seed shared by preview + match
export function seed() { return previewSeed; }
export function setSeed(n) { previewSeed = n | 0; }
export function rerollSeed() { previewSeed = (Math.random() * 1e9) | 0; }

export function mapSize() { return SIZES[setup.size] || 64; }

export function startCells(size) {
  return START_SPOTS.slice(0, 1 + setup.opponents)
    .map((f) => ({ x: Math.round(f.x * size), y: Math.round(f.y * size) }));
}

export function briefingText() {
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

export function drawSetupPreview() {
  const size = mapSize();
  const starts = startCells(size);
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

// ---- setup screen wiring -------------------------------------------------

export function syncSetupWidgets() {
  for (let n = 1; n <= 3; n++) {
    document.getElementById(`su-n${n}`).classList.toggle('on', setup.opponents === n);
    document.getElementById(`su-cpu${n}`).classList.toggle('su-hidden', n > setup.opponents);
    document.getElementById(`su-diff${n}`).textContent = (setup.diffs[n - 1] || 'normal').toUpperCase();
  }
  document.getElementById('su-size').textContent = SIZE_LABEL[setup.size];
  document.getElementById('su-biome').textContent = BIOME_LABEL[setup.biome];
  document.getElementById('su-layout').textContent = LAYOUT_LABEL[setup.layout] || 'RANDOM';
}

export function wireSetupScreen(audio, { onStart, onBack }) {
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
    rerollSeed();
    drawSetupPreview(); audio.sfx('select');
  });
  document.getElementById('su-start').addEventListener('click', () => { audio.sfx('ack'); onStart(); });
  document.getElementById('su-back').addEventListener('click', () => { audio.sfx('select'); onBack(); });
}
