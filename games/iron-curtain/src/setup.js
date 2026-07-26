// Operation setup: the persisted match options (opponents, difficulties, map
// size, biome, layout), the seed shared between the preview and the match, and
// the radar-style battlefield preview drawn on the setup screen.

import { GameMap, LAYOUTS, minimapRGB } from './map.js';
import { HOUSE_UI, makeCanvas } from './palette.js';
import { readJSON, writeText, stringifyJSON } from './storage.js';
import { byId, onClick } from './dom.js';

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
// one CPU slot per enemy house, and index.html has exactly that many rows
const MAX_OPPONENTS = ENEMY_HOUSES.length;

// spawn corners as map fractions: human SW, then NE / NW / SE for CPUs
const START_SPOTS = [
  { x: 0.14, y: 0.82 },  // player
  { x: 0.82, y: 0.10 },  // cpu 1
  { x: 0.12, y: 0.10 },  // cpu 2
  { x: 0.84, y: 0.80 },  // cpu 3
];

const SETUP_KEY = 'iron-curtain-setup';

function loadSetup() {
  const def = { opponents: 1, diffs: ['normal', 'normal', 'normal'], size: 'medium', biome: 'forest', layout: 'random' };
  return { ...def, ...(readJSON(SETUP_KEY) || {}) };
}
export const setup = loadSetup();

function saveSetup() {
  const str = stringifyJSON(setup);
  if (str != null) writeText(SETUP_KEY, str);
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
const PV = byId('su-preview');
const PVG = PV.getContext('2d');

export function drawSetupPreview() {
  const size = mapSize();
  const starts = startCells(size);
  const m = new GameMap(size, previewSeed, setup.biome, starts, setup.layout || 'random');
  const [off, og] = makeCanvas(size, size);
  const img = og.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = m.idx(x, y), o = i * 4;
      const [r, g, b] = minimapRGB(m, i);
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
  for (let n = 1; n <= MAX_OPPONENTS; n++) {
    byId(`su-n${n}`).classList.toggle('on', setup.opponents === n);
    byId(`su-cpu${n}`).classList.toggle('su-hidden', n > setup.opponents);
    byId(`su-diff${n}`).textContent = (setup.diffs[n - 1] || 'normal').toUpperCase();
  }
  byId('su-size').textContent = SIZE_LABEL[setup.size];
  byId('su-biome').textContent = BIOME_LABEL[setup.biome];
  byId('su-layout').textContent = LAYOUT_LABEL[setup.layout] || 'RANDOM';
}

export function wireSetupScreen(audio, { onStart, onBack }) {
  // every option button cycles a value, then repaints; the preview only needs
  // redrawing for the options that change the generated map
  const chose = (redrawPreview) => {
    saveSetup();
    syncSetupWidgets();
    if (redrawPreview) drawSetupPreview();
    audio.sfx('select');
  };
  // cycle `setup[field]` to the next entry of `keys`
  const cycler = (field, keys) => () => {
    setup[field] = keys[(keys.indexOf(setup[field]) + 1) % keys.length];
    chose(true);
  };

  for (let n = 1; n <= MAX_OPPONENTS; n++) {
    onClick(`su-n${n}`, () => { setup.opponents = n; chose(true); });
    onClick(`su-diff${n}`, () => {
      const cur = DIFF_ORDER.indexOf(setup.diffs[n - 1] || 'normal');
      setup.diffs[n - 1] = DIFF_ORDER[(cur + 1) % DIFF_ORDER.length];
      chose(false);
    });
  }
  onClick('su-size', cycler('size', Object.keys(SIZES)));
  onClick('su-biome', cycler('biome', Object.keys(BIOME_LABEL)));
  onClick('su-layout', cycler('layout', LAYOUT_KEYS));
  onClick('su-regen', () => { rerollSeed(); drawSetupPreview(); audio.sfx('select'); });
  onClick('su-start', () => { audio.sfx('ack'); onStart(); });
  onClick('su-back', () => { audio.sfx('select'); onBack(); });
}
