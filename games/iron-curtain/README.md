# IRON CURTAIN — a retro cold-war RTS (Three.js)

A browser RTS in the spirit of the classic mid-90s cold-war strategy games,
rendered with Three.js in a 16-bit-console pixel-art style. Every sprite,
tile, icon, sound effect and the chiptune march are **generated in code at
boot** — there are no asset files and no borrowed art or audio.

![genre](https://img.shields.io/badge/genre-RTS-red) ![tech](https://img.shields.io/badge/tech-three.js-black) ![deps](https://img.shields.io/badge/assets-0%20files-green)

## Run it

Any static file server works (ES modules don't load from `file://`):

```bash
cd games/iron-curtain
python3 -m http.server 8080
# open http://localhost:8080
```

Three.js is vendored in `lib/` (MIT, see `lib/THREE-LICENSE`), so the game
runs fully offline.

## What's in the game

- **Main menu & skirmish setup**: NEW OPERATION opens a setup screen —
  1–3 CPU opponents (each with its own colour and EASY/NORMAL/HARD
  brain), map size (48/64/96) and biome (green forest, snow taiga,
  desert waste). CONTINUE OPERATION returns to a match you left via the
  pause menu; the last used setup is remembered.

- **Base building**, classic sidebar flow: one structure at a time, radial
  build clock on the cameo, `READY` → click the map to place (adjacency
  rules apply), free ore truck with every refinery.
- **Ore economy**: harvesters chew ore cells, haul it to the refinery dock,
  ore slowly regrows and spreads. Credits drain *while* things build.
- **Power**: low power halves production speed, kills the radar minimap and
  switches tesla coils off.
- **Units**: riflemen, rocket troopers, light/heavy tanks (rotating
  turrets), ore truck, MCV that deploys into a new construction yard (`D`).
- **Defenses**: guard tower, tesla coil.
- **Radar dome** enables the minimap (click it to navigate).
- **Fog of war** with explored-but-stale dimming.
- **Repair & sell** buildings; factory rally points (select factory,
  right-click the ground).
- **Skirmish AI** that expands, rebuilds losses, keeps its power up,
  replaces harvesters and sends growing attack waves; difficulty tunes
  its thinking speed, army caps and wave pacing (never its prices or
  income). Multiple CPUs fight each other too — it's a free-for-all.
- **Synthesized audio**: WebAudio sfx, an original chiptune march (M to
  toggle) and a robotic tactical-advisor voice via the browser speech API.
- Victory/defeat screens with a score sheet; every match generates a fresh
  procedural map (river, fords, forests, rock outcrops, three ore fields).

## Controls

| Input | Action |
|---|---|
| LMB / drag | select / marquee select |
| RMB | move · attack · set rally (factory selected) |
| `F` + click | attack-move |
| `X` | stop |
| `B` | deploy MCV |
| `Ctrl+1..9` / `1..9` | set / recall control group |
| WASD, arrows, wheel | scroll & zoom camera |
| `H` `P` `M` | help · pause · music |
| `Esc` | cancel mode / clear selection, then pause menu (resume · settings · main menu) |

Settings (audio volumes, advisor voice, camera speed, edge scroll) persist
in `localStorage`.

## Code map

| File | Role |
|---|---|
| `src/palette.js` | SNES-flavoured palette, pixel-drawing toolkit, house-colour remap |
| `src/sprites.js` | all procedural art: tiles, buildings, vehicles (16 facings), infantry, fx, cameos |
| `src/rules.js` | unit/building/weapon stats, armour model, tech tree, economy tuning |
| `src/map.js` | procedural terrain + ore fields |
| `src/pathfind.js` | A* (8-dir, corner-cut safe, traffic-aware costs) |
| `src/game.js` | simulation: movement, combat, harvesting, production, power, fog |
| `src/ai.js` | skirmish opponent |
| `src/ui.js` | sidebar, cameo strips, radar, banners, end screens |
| `src/input.js` | selection, orders, placement, control groups, scrolling |
| `src/audio.js` | WebAudio sfx synth, chiptune sequencer, speech advisor |
| `src/main.js` | Three.js renderer (ortho camera, canvas-texture layers) + game loop |

This is an original homage: game rules and art were written for this
project and no assets, names, or content from any commercial game are used.
