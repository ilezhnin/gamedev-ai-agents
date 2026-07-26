// Automation surface: window.__game_test and window.__game_debug, installed
// over the live match. The headless suites in tests/ are the only consumers,
// and their names and shapes are a contract — move an implementation freely,
// but never rename or reshape a hook.

import { findPath } from './pathfind.js';
import { AI_LEVELS } from './ai.js';
import { setup, SIZES, setSeed } from './setup.js';

// ctx: audio, cam, sim, screens, renderer, game()/ais() live getters,
// autosave(), hasValidSave()
export function installTestHooks(ctx) {
  const { audio, cam, sim, screens, renderer } = ctx;
  const game = ctx.game, ais = ctx.ais;

  // audio-test hooks: let headless checks drive the sound engine
  window.__audio_test = {
    ensure: () => audio.ensure(),
    // snapshot the WebAudio graph so the test can assert every bus exists
    graph: () => ({
      ctx: !!audio.ctx, master: !!audio.master, music: !!audio.musicGain,
      sfx: !!audio.sfxGain, state: audio.ctx ? audio.ctx.state : null,
    }),
    // start a named song; jingles play once, themes loop. Returns live state.
    play: (name) => {
      audio.musicOn = true;
      if (name === 'victory' || name === 'defeat') audio.playJingle(name === 'victory');
      else audio.playSong(name, true);
      return { song: audio.songName, playing: audio.playing };
    },
    sfx: (n) => { audio.sfx(n); return true; },
    stop: () => { audio.stopMusic(); return !audio.playing; },
    setSfxVol: (v) => { audio.setSfxVol(v); return audio.sfxVol; },
    playing: () => audio.playing,
    song: () => audio.songName,
  };

  window.__game_test = {
    spawn: (house, key, x, y) => game().addUnit(game().players[house], key, x, y),
    build: (house, key, x, y) => game().addBuilding(game().players[house], key, x, y, { instant: true }),
    credits: (house, n) => { game().players[house].credits = n; },
    // force an autosave to localStorage (drives the save/load test)
    save: () => { ctx.autosave(); return true; },
    hasSave: () => ctx.hasValidSave(),
    // order the first player unit to move (drives order-persistence checks)
    moveAnyUnit: (x, y) => {
      const u = game().units.find((u) => !u.dead && u.house === 'player');
      if (!u) return 0;
      game().orderMove(u, x, y);
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
      // optional fixed seed for reproducible balance/economy runs
      if (typeof p.seed === 'number') { setSeed(p.seed); delete p.seed; }
      Object.assign(setup, p);
      screens.hideScreens();
      screens.setSidebar(true);
      screens.buildAndStart();   // synchronous so callers can read map info immediately
      screens.playBattleTheme();
      const m = game().map;
      return { opponents: setup.opponents, size: m.size, biome: m.biome, layout: m.layout };
    },
    // flood-fill connectivity: every start reachable from starts[0]?
    connectivity: () => game().map.connectivityOK(),
    // lift the fog everywhere (terrain inspection / screenshots)
    revealAll: () => { game().explored.fill(1); game().visible.fill(1); renderer.redrawFog(game()); },
    // construction-yard count (one per living house)
    conyards: () => game().buildings.filter((b) => !b.dead && b.key === 'conyard').length,
    // accelerate the sim clock for headless soak tests (1 = real time)
    setSpeed: (n) => { sim.speed = Math.max(0.25, Math.min(8, n)); return sim.speed; },
    // freeze/thaw AI thinking so duel arenas run without opponents interfering
    aiPause: (on = true) => { sim.aiHalted = !!on; return sim.aiHalted; },
    // advance the sim a fixed number of steps at a fixed dt — deterministic and
    // decoupled from wall-clock frame pacing, so balance duels are repeatable.
    // Respects aiPause: AI only thinks when not halted.
    stepSim: (dt, steps) => sim.step(dt, steps),
    // carve a pristine open arena: pick a centre far from both bases, then strip
    // ore/blockers/occupants and remove any building (incl. neutral depots) in a
    // W x H rectangle so duel combatants get flat, obstacle-free ground. Returns
    // the centre. Only touches passable terrain, so water/cliffs stay impassable.
    clearArena: (w = 28, h = 11) => {
      const m = game().map;
      // centre: the map middle nudged away from the nearest conyard
      const cons = game().buildings.filter((b) => !b.dead && b.key === 'conyard');
      let cx = Math.floor(m.size / 2), cy = Math.floor(m.size / 2);
      const hw = Math.floor(w / 2), hh = Math.floor(h / 2);
      cx = Math.max(hw + 1, Math.min(m.size - hw - 2, cx));
      cy = Math.max(hh + 1, Math.min(m.size - hh - 2, cy));
      // remove any building overlapping the rectangle
      for (const b of [...game().buildings]) {
        if (b.dead) continue;
        if (b.cx < cx + hw && b.cx + b.def.w > cx - hw && b.cy < cy + hh && b.cy + b.def.h > cy - hh) {
          game().destroyBuilding(b, null, true);
        }
      }
      for (let y = cy - hh; y <= cy + hh; y++) {
        for (let x = cx - hw; x <= cx + hw; x++) {
          if (!m.inBounds(x, y)) continue;
          const i = m.idx(x, y);
          m.ore[i] = 0; m.gem[i] = 0;
          if (m.isPassableTerrain(x, y)) m.blocked[i] = 0;
          if (m.occupant[i] && m.occupant[i].isUnit !== true) m.occupant[i] = null;
        }
      }
      game().oreDirty = true; game().visionDirty = true;
      return [cx, cy];
    },
    // remove a single unit from the field (clean up between duel arenas)
    killUnit: (id) => {
      const u = game().units.find((x) => x.id === id);
      if (!u || u.dead) return false;
      const m = game().map;
      m.occupant[m.idx(u.cellX, u.cellY)] = null;
      if (u.reserved) m.occupant[m.idx(u.reserved[0], u.reserved[1])] = null;
      u.dead = true;
      game().units = game().units.filter((x) => !x.dead);
      return true;
    },
    // order unit id to attack a specific target unit id (focused duels)
    attackId: (id, tid) => {
      const u = game().units.find((x) => !x.dead && x.id === id);
      const t = game().units.find((x) => !x.dead && x.id === tid);
      if (!u || !t) return false;
      game().orderAttack(u, t);
      return true;
    },
    // order unit id to attack a specific building at cell (tx,ty)
    attackBuildingAt: (id, tx, ty) => {
      const u = game().units.find((x) => !x.dead && x.id === id);
      const b = game().buildings.find((x) => !x.dead && tx >= x.cx && ty >= x.cy && tx < x.cx + x.def.w && ty < x.cy + x.def.h);
      if (!u || !b) return false;
      game().orderAttack(u, b);
      return true;
    },
    // remove the exact building covering cell (tx,ty) — clean up duel arenas
    removeBuildingAt: (tx, ty) => {
      const b = game().buildings.find((x) => !x.dead && tx >= x.cx && ty >= x.cy && tx < x.cx + x.def.w && ty < x.cy + x.def.h);
      if (!b) return false;
      game().destroyBuilding(b, null, true);
      return true;
    },
    // is a building at cell (tx,ty) still standing?
    buildingAliveAt: (tx, ty) =>
      game().buildings.some((b) => !b.dead && tx >= b.cx && ty >= b.cy && tx < b.cx + b.def.w && ty < b.cy + b.def.h),
    // combat/economy telemetry for the AI soak + economy-tuning runs
    stats: (house) => {
      const p = game().players[house];
      if (!p) return null;
      const buildings = game().buildings.filter((b) => !b.dead && b.owner === p);
      const army = game().units.filter((u) => !u.dead && u.owner === p && u.def.weapon && !u.def.harvester);
      return {
        credits: Math.round(p.credits),
        killed: p.stats.killed, lost: p.stats.lost, built: p.stats.built,
        armyBuilt: p.stats.armyBuilt || 0,
        buildings: buildings.length,
        hasFactory: buildings.some((b) => b.key === 'factory'),
        army: army.length,
        harvesters: game().units.filter((u) => !u.dead && u.owner === p && u.def.harvester).length,
      };
    },
    // per-AI live wave/apc snapshot for the transport-mechanics test
    aiApcInfo: () => ais().map((a) => {
      const apcs = game().units.filter((u) => !u.dead && u.owner === a.p && u.key === 'apc');
      return {
        house: a.p.house, level: a.level, personality: a.personality,
        apcs: apcs.length,
        apcCargo: apcs.reduce((n, u) => n + (u.cargoUnits ? u.cargoUnits.length : 0), 0),
        apcEverLoaded: a.apcEverLoaded || false,
        apcEverUnloaded: a.apcEverUnloaded || false,
        retreated: a.retreatedCount || 0,
      };
    }),
    attack: () => {
      for (const u of game().units) {
        if (u.house !== 'player' || !u.def.weapon) continue;
        game().orderAttackMove(u, game().map.size - 14, 10);
      }
    },
    wipe: (house) => {
      for (const u of game().units) if (u.house === house) u.hp = -1;
      for (const b of game().buildings) if (b.house === house) { b.hp = 0; game().destroyBuilding(b); }
      for (const u of game().units) if (u.house === house) game().destroyUnit(u);
    },
    // --- roster-content test helpers (used by tests/content.js) ---
    canProduce: (house, kind, key) => game().canProduce(game().players[house], kind, key),
    power: (house) => ({ made: game().players[house].powerMade, used: game().players[house].powerUsed, radar: game().players[house].hasRadar }),
    buildingInfo: (house, key) => {
      const b = game().buildings.find((b) => !b.dead && b.house === house && b.key === key);
      return b ? { id: b.id, hp: Math.round(b.hp), maxHp: b.maxHp, repairing: !!b.repairing, owner: b.house, cx: b.cx, cy: b.cy } : null;
    },
    // destroy a single structure by house+key (drives conyard-recovery test)
    killBuilding: (house, key) => {
      const b = game().buildings.find((b) => !b.dead && b.house === house && b.key === key);
      if (!b) return false;
      game().destroyBuilding(b, null);
      return true;
    },
    // knock a building down to a fraction of its hp (drives the AI repair test)
    hurtBuilding: (house, key, frac) => {
      const b = game().buildings.find((b) => !b.dead && b.house === house && b.key === key);
      if (!b) return null;
      b.hp = Math.max(1, Math.round(b.maxHp * frac));
      return { id: b.id, hp: Math.round(b.hp), maxHp: b.maxHp };
    },
    // force a difficulty level on an AI (drives the hard-only retreat test)
    setAiLevel: (house, level) => {
      const a = ais().find((x) => x.p.house === house);
      if (!a) return false;
      a.level = level;
      a.baseKnobs = AI_LEVELS[level] || a.baseKnobs;
      a.applyPersonality(a.personality);
      return a.level;
    },
    // force a personality on an AI (isolates difficulty in comparison tests)
    setPersonality: (house, name) => {
      const a = ais().find((a) => a.p.house === house);
      if (!a) return false;
      a.applyPersonality(name);
      a.waveT = a.d.firstWave;
      return a.personality;
    },
    unitStats: (house, key) => {
      let min = Infinity, maxHp = 0, count = 0;
      for (const u of game().units) {
        if (u.dead || u.house !== house || u.key !== key) continue;
        min = Math.min(min, u.hp); maxHp = Math.max(maxHp, u.maxHp); count++;
      }
      return count ? { minHp: Math.round(min), maxHp, count } : null;
    },
    attackAll: (uHouse, uKey, tHouse, tKey) => {
      const b = game().buildings.find((b) => !b.dead && b.house === tHouse && b.key === tKey);
      if (!b) return 0;
      let n = 0;
      for (const u of game().units) {
        if (u.dead || u.house !== uHouse || u.key !== uKey) continue;
        game().orderAttack(u, b); n++;
      }
      return n;
    },
    ownerAt: (x, y) => {
      const b = game().buildings.find((b) => !b.dead && x >= b.cx && y >= b.cy && x < b.cx + b.def.w && y < b.cy + b.def.h);
      return b ? b.house : null;
    },
    // capture the specific structure covering (tx,ty) — avoids matching the
    // wrong same-keyed building elsewhere on the map (e.g. the AI's own base)
    captureAt: (uHouse, uKey, tx, ty) => {
      const b = game().buildings.find((b) => !b.dead && tx >= b.cx && ty >= b.cy && tx < b.cx + b.def.w && ty < b.cy + b.def.h);
      const u = game().units.find((u) => !u.dead && u.house === uHouse && u.key === uKey);
      if (!u || !b) return false;
      game().orderCapture(u, b);
      return true;
    },
    // like findOpen, but searches outward from (cx,cy) — lets tests place
    // several well-separated arenas that won't interfere with each other
    findOpenNear: (cx, cy, r) => {
      const m = game().map;
      for (let rad = 0; rad < m.size; rad++) {
        for (let dy = -rad; dy <= rad; dy++)
          for (let dx = -rad; dx <= rad; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
            const x = cx + dx, y = cy + dy;
            if (x < r + 2 || y < r + 2 || x > m.size - r - 2 || y > m.size - r - 2) continue;
            let ok = true;
            for (let ay = -r; ay <= r && ok; ay++)
              for (let ax = -r; ax <= r && ok; ax++)
                if (!m.isBuildable(x + ax, y + ay)) ok = false;
            if (ok) return [x, y];
          }
      }
      return null;
    },
    // top-left of a (2r+1) square whose cells are all buildable, edge-safe
    findOpen: (r) => {
      const m = game().map;
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
    // --- depth-mechanic test helpers (veterancy / APC / depots / powers) ---
    countUnits: (house, key) =>
      game().units.filter((u) => !u.dead && !u.boarded && u.house === house && u.key === key).length,
    // read a numeric field off a unit by id (hp, maxHp, xp, rank, empT, x, y, boarded)
    unitField: (id, name) => {
      const u = game().units.find((u) => u.id === id);
      if (!u) return null;
      const v = u[name];
      return typeof v === 'boolean' ? (v ? 1 : 0) : (v ?? null);
    },
    hurtUnit: (id, hp) => {
      const u = game().units.find((u) => !u.dead && u.id === id);
      if (!u) return false;
      u.hp = hp; return true;
    },
    attackMoveId: (id, x, y) => {
      const u = game().units.find((u) => !u.dead && u.id === id);
      if (!u) return false;
      game().orderAttackMove(u, x, y); return true;
    },
    moveOrderId: (id, x, y) => {
      const u = game().units.find((u) => !u.dead && u.id === id);
      if (!u) return false;
      game().orderMove(u, x, y); return true;
    },
    // board passengers (ids) into an APC (id)
    boardInto: (apcId, passengerIds) => {
      const apc = game().units.find((u) => !u.dead && u.id === apcId);
      if (!apc) return false;
      for (const pid of passengerIds) {
        const p = game().units.find((u) => !u.dead && u.id === pid);
        if (p) game().orderBoard(p, apc);
      }
      return true;
    },
    unloadApc: (apcId) => {
      const apc = game().units.find((u) => !u.dead && u.id === apcId);
      if (!apc) return false;
      game().orderUnload(apc); return true;
    },
    apcCargoCount: (apcId) => {
      const apc = game().units.find((u) => !u.dead && u.id === apcId);
      return apc && apc.cargoUnits ? apc.cargoUnits.length : -1;
    },
    // fire a commander power at a world cell; returns whether it fired
    castPower: (which, x, y) => game().castPower(which, x, y),
    powerCd: (which) => (which === 'recon' ? game().reconCd : game().empCd),
    // findPath result: {len, ex, ey} end cell, or null when unreachable
    path: (sx, sy, tx, ty) => {
      const p = findPath(game().map, sx, sy, tx, ty, null);
      if (!p || p.length === 0) return null;
      const last = p[p.length - 1];
      return { len: p.length, ex: last[0], ey: last[1] };
    },
  };
  window.__game_debug = () => (screens.state !== 'play' ? { state: screens.state } : {
    state: screens.state,
    time: Math.round(game().time * 10) / 10,
    units: game().units.length,
    buildings: game().buildings.length,
    playerCredits: Math.round(game().players.player.credits),
    enemyCredits: Math.round(game().players.enemy?.credits ?? 0),
    enemyProdB: game().players.enemy?.prod.building?.key || null,
    enemyProdU: game().players.enemy?.prod.unit?.key || null,
    opponents: Object.values(game().players).filter((p) => !p.isHuman && !p.isNeutral).length,
    mapSize: game().map.size,
    biome: game().map.biome,
    layout: game().map.layout,
    oreTotal: game().map.ore.reduce((a, v) => a + v, 0),
    gemCells: game().map.gem.reduce((a, v) => a + v, 0),
    over: game().over,
  });
}
