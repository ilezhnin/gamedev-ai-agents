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
  brain), map size (48/64/96), biome (green forest, snow taiga,
  desert waste) and map layout (RANDOM / river / lakes / rock ridges /
  central-lake islands / open steppe / deep-woods maze). A live
  **battlefield preview** minimap shows the exact map you'll play (terrain,
  ore and start positions); REGENERATE rerolls the seed — what you see is
  what you get. CONTINUE OPERATION returns to a match you left via the pause
  menu; the last used setup is remembered.

- **Save & continue**: a match in progress is autosaved to the browser
  (localStorage) every 30 seconds, when you quit to the title, and if you
  close or reload the tab. CONTINUE OPERATION resumes it — first from the
  warm in-memory match, otherwise by reloading the saved one — so a battle
  survives a page refresh. The save is cleared when the match ends, and a
  corrupt or outdated save is discarded (CONTINUE simply greys out).

- **Base building**, classic sidebar flow: one structure at a time, radial
  build clock on the cameo, `READY` → click the map to place (adjacency
  rules apply), free ore truck with every refinery.
- **Ore economy**: harvesters chew ore cells, haul it to the refinery dock,
  ore regrows and spreads so fields sustain mining. Every base gets two
  ore fields plus neutral fields scattered around the map; trucks prefer
  fields near their own refinery. Credits drain *while* things build.
- **Gems**: rare blue crystal patches pay double per scoop and never grow
  back — worth fighting over.
- **Crushing**: tracked vehicles (tanks, ore trucks, MCV) flatten enemy
  infantry that stands in their path, classic style.
- **Return fire on the march**: units with a plain move order engage
  enemies they meet (and shooters that hit them), then resume the trip.
- **Power**: low power halves production speed, kills the radar minimap and
  switches tesla coils off.
- **Units**: riflemen, rocket troopers, light/heavy tanks (rotating
  turrets), ore truck, MCV that deploys into a new construction yard (`D`),
  plus a mid/late-game tier:
  - **Engineer** — unarmed sapper; right-click an enemy structure to walk in
    and **capture** it (the engineer is spent, the building changes hands).
  - **Artillery** — long-range siege gun (range 8) firing slow area-blast
    shells. A glass cannon: fragile, no turret, and near-sighted, so it wants
    a spotter and a screen of armour.
  - **Rocket Truck** — fast launcher that looses a staggered salvo of four
    splash rockets.
  - **APC** — a boxy armoured transport with a light MG. Carries up to **4
    infantry**: right-click it with foot soldiers selected to load them
    (they climb aboard and leave the map), then `B` — or right-click the
    ground — to unload them onto the cells around it. The cargo dies with the
    APC, so escort it.
  - **Behemoth Tank** — super-heavy twin-cannon monster; needs a **Tech
    Center** to build.
- **Veterancy**: any unit with a weapon banks experience equal to the cost of
  what it destroys (the killing blow credits the shooter). At 1× and 3× its own
  cost it earns a rank — one then two gold chevrons over its health bar. Rank 1
  hits 15% harder; rank 2 hits 30% harder **and** carries 25% more max hp
  (healed on promotion). The selection panel flags **VETERAN**/**ELITE**.
- **Neutral supply depots**: 2–4 crate-and-fuel-drum caches sit in the
  contested middle of every map (white on the radar). Send an **engineer** to
  capture one and it trickles a modest **+6 credits/sec** while you hold it —
  and the enemy can storm in and take it back, or level it for good.
- **Commander powers**: owning a **Tech Center** unlocks two targeted
  abilities (two buttons above the sidebar strips, each with a radial
  cooldown): **RECON SWEEP** (90s) lifts the fog over a radius-8 area for 10
  seconds, and **EMP BLAST** (150s) zaps a radius-4 zone, freezing enemy
  vehicles and defence towers for 8 seconds.
- **Defenses & structures**: guard tower, tesla coil, **flame tower**
  (short-range fire jet that melts infantry), **concrete walls** (cheap
  fire-and-forget blockers that stop armour until shelled down) and the
  **Tech Center** that unlocks the behemoth and the commander powers above.
- **Splash & fire**: area-of-effect shells/rockets shred anything hostile near
  the blast (your own troops are spared, so artillery stays a clean anti-blob
  tool instead of mulching its own escort), and a dedicated fire warhead makes
  flame brutal against troops but feeble against tanks. Rocket troopers are the
  dedicated tank-hunters — cost-for-cost their bazookas out-trade light armour.
- **Radar dome** enables the minimap (click it to navigate); its dish
  visibly sweeps while online.
- **Fog of war** with explored-but-stale dimming.
- **A living battlefield**: grass/dirt tiles blend at their seams, water
  animates, faint cloud shadows drift across the map, and every unit casts a
  small ground shadow. Vehicles show rolling-tread shimmer while moving,
  turrets recoil when they fire, and harvesters spin their intake while
  scooping. Damaged buildings crack, blacken and smoke (harder the closer to
  death), and big explosions fling debris and kick the camera.
- **Repair & sell** buildings; factory rally points (select factory,
  right-click the ground) — a small flag marks the muster cell.
- **Selection readout**: a bottom-left panel names a single selection with a
  cameo icon and hp bar, or tallies a mixed group by type.
- **Cameo tooltips**: hover a sidebar cameo for name, cost, power delta and
  the tech it needs (missing structures greyed-red).
- **Contextual cursors**: crosshair to attack over enemies (armed selection),
  a move reticle otherwise, no-entry over shroud while placing.
- **Skirmish AI** with rolled **personalities** — a *rusher* (cheap early
  swarms, minimal defence), a *turtle* (rings of towers and walls, later but
  bigger waves) or a *balanced* brain — layered on top of the EASY/NORMAL/HARD
  difficulty knobs. It **beelines a war factory** off its opening bank (so its
  economy never stalls before the tanks roll), expands (a second refinery when
  its home field runs dry), rebuilds losses, **repairs** damaged key
  structures, keeps 2 ore trucks per refinery, rushes guards to a harvester
  under fire, and even redeploys a fresh MCV if its construction yard is
  destroyed. On normal/hard it also **ferries a squad in an APC** — loading
  riflemen at home and disgorging them on the objective during a push — grabs
  a neutral **supply depot** with an engineer, and (on hard) **pulls wounded
  vehicles out of a losing fight** to survive and regroup; turtles work a
  **flame tower** into their defensive rings. Attacks come as **staged waves**:
  the squad gathers at a rally point, pushes the enemy economy together, and
  retreats to rejoin the defence if it's shattered. It never cheats on prices
  or income. Multiple CPUs fight each other too — it's a free-for-all.
- **Synthesized audio**: a 16-bit-console-style soundscape built from
  2-operator **FM voices** and PSG-style square/noise blips. Three original
  compositions drive a lookahead pattern sequencer — an ominous minor menu
  march on the title/setup screens, a driving battle theme in-match, and
  short victory/defeat stingers on the end screen (M to toggle music). Sound
  effects are re-synthesized to sit under the music, with distinct
  acknowledge blips for infantry vs vehicles, plus a robotic tactical-advisor
  voice via the browser speech API.
- Victory/defeat screens with a score sheet; every match generates a fresh
  procedural map from one of six layout templates (river/fords, seeded
  lakes, gapped rock ridges, central-lake islands, open steppe or a
  carved woods maze) with biome flavour — desert dry canyons, taiga frozen
  shores and extra rock — plus scattered ruin doodads and three ore fields.
  A flood-fill pass guarantees every start stays reachable.

## Controls

| Input | Action |
|---|---|
| LMB / drag | select / marquee select |
| RMB | move · attack · capture (engineer → enemy building/depot) · load infantry (→ own APC) · set rally (factory selected) |
| `F` + click | attack-move |
| `X` | stop |
| `B` | deploy MCV · unload APC cargo |
| tech-center power buttons | click, then click the map to aim RECON SWEEP / EMP BLAST |
| `Ctrl+1..9` / `1..9` | set / recall control group |
| WASD, arrows, wheel | scroll & zoom camera |
| `H` `P` `M` | help · pause · music |
| `Esc` | cancel mode / clear selection, then pause menu (resume · settings · main menu) |

Settings (master / music / SFX volumes, advisor voice, game speed 0.5×–2×,
camera speed, edge scroll) persist in `localStorage`. Game speed scales the simulation only;
the interface stays real-time.

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

Headless tests live in `tests/` (playwright-core + chromium):
`smoke.js` (boots a match, runs the sim), `content.js` (roster/tech checks),
`layouts.js` (map layout × biome combos) and `saveload.js` (autosave, reload,
CONTINUE resume). Run e.g. `node tests/saveload.js` — each prints `PASS`.

This is an original homage: game rules and art were written for this
project and no assets, names, or content from any commercial game are used.
