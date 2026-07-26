# Architecture

Plain ES modules, no build step, no dependencies. `index.html` loads
`src/main.js` as a module; a static file server is the whole toolchain.

## Layers

```
    data / config     palette · storage · dom · settings · rules · art/*
          |
    pure helpers      pathfind · sim/angles
          |
    simulation        map · game · sim/* · ai
          |
    render / UI       render/* · ui · input · cursors · screens · setup · save
          |
    composition       main · testhooks
```

**Imports point down, never up.** A module may import from its own layer or any
layer above it in that list, and never from below. Concretely:

- `rules.js` imports nothing. It is the single home for gameplay tunables.
- The sim never imports `three`, touches `document`, or reads the renderer.
- The renderer reads sim state each frame and writes none of it back.
- `main.js` is the only module that wires subsystems together; everything else
  receives what it needs as constructor arguments or a `deps` object.

If two modules need each other, the shared piece moves to a third module below
both — that is why `sim/orders.js` sits under the rest of the sim (anything can
hand a unit a new order) and why `storage.js` and `dom.js` exist at all.

`game.js` is the sim's public face. It owns the world state and fixes the tick
order; the rules themselves live in `src/sim/*` and are reached through thin
delegating methods. UI, input, AI and the test hooks all speak to `Game`.

## Where to add things

**A unit** — add an entry to `UNITS` in `src/rules.js` (a `weapon` key needs a
matching `WEAPONS` entry), draw a hull in `src/art/vehicles.js` and register it
in `VEHICLE_PARTS`, or a soldier in `src/art/infantry.js`. Add the key to
`UNIT_STRIP` in `rules.js` so it appears on the sidebar, and to a
`TRAIN_PATTERNS` list in `src/ai.js` if the AI should build it.

**A building** — add to `BUILDINGS` in `src/rules.js` and to
`BUILD_ORDER_STRIP`; draw it in `src/art/buildings.js` (`buildingSprites`).
`requires` gates it on the tech tree, `power` bookkeeping is automatic. Add it
to a `BUILD_ORDERS` list in `src/ai.js` for the AI to build it.

**A biome** — add a palette entry to `BIOMES` in `src/art/tiles.js` (the tile
generators read it), a label in `BIOME_LABEL` in `src/setup.js`, a dressing
density in `GameMap.generate`, and any special terrain pass in
`GameMap.applyBiome`.

**A map layout** — add the name to `LAYOUTS` in `src/map.js`, a `gen*` method
that paints terrain, a branch in `GameMap.generate`, and a label in
`LAYOUT_LABEL` in `src/setup.js`. `ensureConnectivity` is the safety net that
guarantees every start stays reachable.

**A song** — add a pattern to `SONGS` in `src/audio/songs.js` (pure data: per
track a step array plus its voice config). `src/audio/sequencer.js` renders it;
no WebAudio code is needed.

## Tests

All headless, playwright-core + chromium, no npm install for the game itself.

```bash
node tests/run-all.js                  # all suites, ~220s, PASS/FAIL summary
node tests/run-all.js smoke visual     # filter by name for a quick check
node tests/characterize.js             # fixed-seed fingerprint; diff across refactors
node tests/pixeldiff.js                # self-check: two captures, expect 0 diff
node tests/pixeldiff.js --save before  # ...refactor...
node tests/pixeldiff.js --save after
node tests/pixeldiff.js --compare before after
```

`characterize.js` is not a suite — it prints a fixed-seed match fingerprint
(economy, unit/building counts, positions). A behaviour-preserving change must
leave the `STABLE` block byte-identical. `pixeldiff.js` is the art guard: it
hashes every canvas `buildSprites()` produces and screenshots a fixed scene, so
a render refactor can be proven pixel-identical.

`src/testhooks.js` installs `window.__game_test` and `window.__game_debug`.
Their names and shapes are the contract the suites are written against — move
an implementation freely, but grep `tests/` before renaming or deleting a hook.
