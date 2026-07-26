# Source art slicing spec

Author's description of the hand-drawn PNG atlases, recorded here so the
importer has a spec to work from. Drop the source PNGs in `assets/raw/`
(subfolders don't matter — files are matched by name) and the manifest in
`src/art/manifest.js` slices them per the table below.

Anything the engine has no mechanic for yet is still imported and sliced, but
parked: the art registry falls back to the procedural sprite for every key
that has no real asset, so the roster can be swapped one entry at a time.

## Vehicles

**Tank atlas** (one per faction — grey/allied and red/communist are the same
layout). Three rows, 8 columns; the 8 facings run left, up-left, up, up-right,
right, down-right, down, down-left.

| Row | Content |
|---|---|
| 1 | hull (motor block), 8 facings |
| 2 | light tank turret (single gun), 8 facings |
| 3 | heavy tank turret (twin gun), 8 facings |

The sim keeps 16 logical facings; the renderer picks the nearest of the 8
drawn ones. Hull and turret stay separate quads, as today.

**Flame vehicle rotation** — partial set so far: left, up-left, up. Import what
exists; the renderer mirrors/falls back for the missing facings.

## Infantry

**Infantry atlas** (one per faction). Four rows = four facings, each row split
into blocks of three frames per soldier type:

| Row | Facing | Frames 1–3 | Frames 4–6 |
|---|---|---|---|
| 1 | up | machine-gunner: stand, walk A, walk B | grenadier: stand, walk A, walk B |
| 2 | down | same | same |
| 3 | right | same | same |
| 4 | left | same | same |

Four drawn directions (not 16): the renderer snaps facing to the nearest of
up/down/left/right, which is how the era's games did it.

## Buildings

| Building | Frames | Meaning |
|---|---|---|
| Barracks | 3 | idle loop |
| APC factory | 4 | 1 = idle; 2–4 = garage opens before a unit appears, then back to 1 |
| Tank factory | 6 | 1 = idle; 2–5 = unit release; 6 = doors slam shut, then back to 1 |
| Dog kennel | 3 | 1 = idle; 2–3 = play before a new unit appears |
| Airfield | 3 | idle loop |
| Power plant | 1 | static |
| Power plant (small) | 1 | static — red faction's small plant |
| Radio dome | 1 | red faction radar |
| Ore refinery | 1 | red faction refinery |
| Helicopter pad | 1 | no air units yet — import and park |

Building animation model: play the idle loop normally; when production
finishes, run the release frames once, then return to idle.

## Map objects and terrain

| Asset | Layout | Notes |
|---|---|---|
| Gold ingots | 3 columns × 5 frames | col 1 = 1 ingot, col 2 = 2, col 3 = 3; 5 idle frames top→bottom. One-shot loot dropped by the generator, picked up by any unit (mechanic not built yet). |
| Fog of war | 4 frames | 1 = cell hidden; 2–4 = reveal animation |
| Campfire | 4 frames | idle loop, impassable map decoration |
| Rocks | 4 | top-left big winter, bottom-left small winter, top-right big desert, bottom-right small desert — all impassable |
| Snow decorations | 3 | two snow-covered rocks, plus a snowman |
| Trees | 5 | 1 = desert/summer tree, 2–4 = winter trees, 5 = cactus |

**Snow tileset sheet**, by row:

| Row | Content |
|---|---|
| 1 | decorations |
| 2 + most of 3 | road tiles |
| rest of 3 + 4 | fences |
| 5 | water, and water/land border (shore) tiles |

**Desert tileset sheet**, by row:

| Row | Content |
|---|---|
| 1 | decorations |
| 2–3 | cliff-edge tiles marking the boundary between hill levels |

Fences are obstacles, not crossings — they block movement like walls rather
than bridging terrain. Planned as destructible (armour can shell them down),
matching how the era's games treated them.

Two mechanics the engine does not have yet, both worth building once the art
lands (they change the map generator, not just the renderer):

- **Roads** — autotiled like the existing shore/dirt fringes, and a natural
  place to hang a vehicle speed bonus.
- **Hill levels** — the cliff-edge tiles imply elevation: a higher plateau
  reachable only via ramps, blocking movement (and, if wanted, sight) at the
  cliff line. That is a terrain-layer change: the map needs a height field
  alongside the terrain array, and pathfinding has to treat cliff edges as
  impassable except at ramps.

## Faction mapping

- **Grey** art = the allied/player house.
- **Red** art = the communist house; the atlases mirror the grey ones exactly.
- The other two CPU houses (amber, violet) keep procedural sprites recoloured
  from the palette until real art exists for them.
