// Match snapshots: the sim serialised to a plain JSON-friendly object and
// back. Grids travel as base64 rather than as JSON arrays, which is what keeps
// an autosave of a 128x128 map inside the localStorage budget.
//
// The save format is a contract with players' existing saves: SAVE_VERSION
// only moves when a field's meaning changes, and fields are never renamed.

import { UNITS, BUILDINGS } from '../rules.js';
import { u8ToB64 } from '../palette.js';
import { GameMap } from '../map.js';
import { Building, Unit, RANK_HP, MAX_RANK, peekNextId, adoptNextId } from './entities.js';
import { recomputeVision } from './fog.js';

// bump when the serialized save shape changes; a mismatched save is discarded
export const SAVE_VERSION = 2;

// full match snapshot as a plain JSON-friendly object. AI state is added by
// the caller (main.js) via AI.serialize — the sim doesn't own the opponents.
export function serializeGame(game) {
  const m = game.map;
  const players = {};
  for (const [house, p] of Object.entries(game.players)) {
    const packProd = (pr) => pr
      ? { key: pr.key, spent: pr.spent, progress: pr.progress, hold: !!pr.hold } : null;
    players[house] = {
      house,
      credits: p.credits,
      storage: p.storage,
      stats: { ...p.stats },
      prod: { building: packProd(p.prod.building), unit: packProd(p.prod.unit) },
      readyBuilding: p.readyBuilding
        ? { key: p.readyBuilding.key, spent: p.readyBuilding.spent } : null,
    };
  }
  const buildings = game.buildings.filter((b) => !b.dead).map((b) => ({
    id: b.id, key: b.key, house: b.house,
    cx: b.cx, cy: b.cy, hp: b.hp,
    repairing: !!b.repairing,
    rally: b.rally ? [b.rally[0], b.rally[1]] : null,
    turretFacing: b.turretFacing,
    seen: !!b.seen,
    empT: b.empT > 0 ? b.empT : 0,
  }));
  const units = game.units.filter((u) => !u.dead).map((u) => ({
    id: u.id, key: u.key, house: u.house,
    x: u.x, y: u.y, cellX: u.cellX, cellY: u.cellY,
    hp: u.hp, facing: u.facing, turretFacing: u.turretFacing,
    cargo: u.cargo,
    xp: u.xp || 0, rank: u.rank || 0,
    empT: u.empT > 0 ? u.empT : 0,
    boarded: !!u.boarded,
    cargoUnits: (u.cargoUnits && u.cargoUnits.length)
      ? u.cargoUnits.map((c) => c.id) : null,
    order: {
      type: u.order.type,
      destX: u.destX ?? null, destY: u.destY ?? null,
      targetId: u.target ? u.target.id : null,
      oreGoal: u.oreGoal ? [u.oreGoal[0], u.oreGoal[1]] : null,
      deployCell: u.deployCell ? [u.deployCell[0], u.deployCell[1]] : null,
    },
    path: (u.path || []).map((c) => [c[0], c[1]]),
  }));
  return {
    version: SAVE_VERSION,
    seed: game.seed,
    time: game.time,
    nextId: peekNextId(),
    reconCd: game.reconCd,
    empCd: game.empCd,
    reconSweeps: game.reconSweeps.map((s) => ({ x: s.x, y: s.y, r: s.r, t: s.t })),
    empZones: game.empZones.map((z) => ({ x: z.x, y: z.y, r: z.r, t: z.t })),
    map: {
      size: m.size, seed: m.seed, biome: m.biome,
      layout: m.layout, layoutReq: m.layoutReq,
      starts: m.starts.map((s) => ({ x: s.x, y: s.y })),
      oreMax: m.oreMax,
      terrain: u8ToB64(m.terrain),
      variant: u8ToB64(m.variant),
      ore: u8ToB64(new Uint8Array(m.ore.buffer, m.ore.byteOffset, m.ore.byteLength)),
      gem: u8ToB64(m.gem),
      road: u8ToB64(m.road),
    },
    players,
    buildings,
    units,
    // KNOWN GAP: loadGame never reads this back, so CONTINUE re-fogs every
    // scouted cell and the field is ~1.4 KB of dead payload. Left as-is
    // deliberately — restoring it is a gameplay change, not a refactor.
    explored: u8ToB64(game.explored),
  };
}

// rebuild a live Game from a serialized snapshot. The renderer knows nothing
// about this: main.js calls renderer.build() on the restored map afterwards.
//
// The Game constructor arrives as an argument rather than an import so the
// dependency stays one-way: game.js knows about persist.js, not the reverse.
export function loadGame(GameCtor, data, audio) {
  const map = GameMap.restore(data.map);
  const enemyHouses = Object.keys(data.players).filter((h) => h !== 'player' && h !== 'neutral');
  const game = new GameCtor(map, audio, data.seed ?? 1234, enemyHouses);
  game.time = data.time || 0;
  game.reconCd = data.reconCd || 0;
  game.empCd = data.empCd || 0;
  game.reconSweeps = (data.reconSweeps || []).map((s) => ({ x: s.x, y: s.y, r: s.r, t: s.t }));
  game.empZones = (data.empZones || []).map((z) => ({ x: z.x, y: z.y, r: z.r, t: z.t }));

  // players: credits/storage/stats/production come from the save; power and
  // radar are recomputed from the rebuilt buildings below
  for (const [house, pd] of Object.entries(data.players)) {
    const p = game.players[house];
    if (!p) continue;
    p.credits = pd.credits;
    p.displayCredits = pd.credits;
    p.storage = pd.storage;
    p.stats = { built: 0, lost: 0, killed: 0, harvested: 0, ...(pd.stats || {}) };
    p.powerMade = 0; p.powerUsed = 0; p.hasRadar = false;
    const unpackProd = (pr, kind) => pr
      ? { kind, key: pr.key, def: (kind === 'building' ? BUILDINGS : UNITS)[pr.key],
          spent: pr.spent, progress: pr.progress, hold: !!pr.hold } : null;
    p.prod = {
      building: unpackProd(pd.prod && pd.prod.building, 'building'),
      unit: unpackProd(pd.prod && pd.prod.unit, 'unit'),
    };
    p.readyBuilding = pd.readyBuilding
      ? { kind: 'building', key: pd.readyBuilding.key, def: BUILDINGS[pd.readyBuilding.key],
          spent: pd.readyBuilding.spent, progress: 1, hold: false }
      : null;
  }

  const byId = new Map();

  for (const bd of data.buildings) {
    const owner = game.players[bd.house];
    if (!owner) continue;
    const b = new Building(owner, bd.key, bd.cx, bd.cy);
    b.id = bd.id;
    b.hp = bd.hp;
    b.repairing = !!bd.repairing;
    b.rally = bd.rally ? [bd.rally[0], bd.rally[1]] : null;
    b.turretFacing = bd.turretFacing || 0;
    b.seen = !!bd.seen;
    b.empT = bd.empT || 0;
    b.buildRise = 1;
    game.buildings.push(b);
    for (let y = b.cy; y < b.cy + b.def.h; y++)
      for (let x = b.cx; x < b.cx + b.def.w; x++)
        if (map.inBounds(x, y)) map.blocked[map.idx(x, y)] = 1;
    owner.powerMade += Math.max(0, b.def.power);
    owner.powerUsed += Math.max(0, -b.def.power);
    if (b.def.givesRadar) owner.hasRadar = true;
    byId.set(b.id, b);
  }

  for (const ud of data.units) {
    const owner = game.players[ud.house];
    if (!owner) continue;
    const u = new Unit(owner, ud.key, ud.cellX, ud.cellY);
    u.id = ud.id;
    // snap to the cell centre — mid-move interpolation isn't preserved
    u.cellX = ud.cellX; u.cellY = ud.cellY;
    u.x = ud.cellX; u.y = ud.cellY;
    u.hp = ud.hp;
    u.facing = ud.facing; u.turretFacing = ud.turretFacing;
    u.cargo = ud.cargo || 0;
    u.xp = ud.xp || 0; u.rank = ud.rank || 0;
    // rank2 restores its raised max hp (rank1 is a damage-only bonus)
    u.maxHp = Math.round(u.def.hp * RANK_HP[Math.min(MAX_RANK, u.rank)]);
    u.empT = ud.empT || 0;
    u.boarded = !!ud.boarded;
    u.moving = false; u.reserved = null;
    const o = ud.order || { type: 'idle' };
    u.destX = o.destX ?? null; u.destY = o.destY ?? null;
    u.oreGoal = o.oreGoal ? [o.oreGoal[0], o.oreGoal[1]] : null;
    u.deployCell = o.deployCell ? [o.deployCell[0], o.deployCell[1]] : null;
    u.path = (ud.path || []).map((c) => [c[0], c[1]]);
    u.order = { type: o.type || 'idle' };
    u._savedTargetId = o.targetId ?? null;
    u._savedCargo = ud.cargoUnits || null;
    game.units.push(u);
    // boarded units are inside an APC: they hold no cell on the grid
    if (!u.boarded) map.occupant[map.idx(u.cellX, u.cellY)] = u;
    byId.set(u.id, u);
  }

  // resolve target references now every entity exists; drop dangling ones
  for (const u of game.units) {
    const tid = u._savedTargetId;
    delete u._savedTargetId;
    // re-link APC cargo (passengers are stored by id)
    if (u._savedCargo) {
      u.cargoUnits = [];
      for (const cid of u._savedCargo) {
        const c = byId.get(cid);
        if (c) { c.boarded = true; u.cargoUnits.push(c); }
      }
    }
    delete u._savedCargo;
    if (tid == null) continue;
    const t = byId.get(tid);
    if (t && !t.dead) u.target = t;
    else if (u.order.type === 'attack' || u.order.type === 'capture' || u.order.type === 'board') {
      u.order = { type: 'idle' }; u.target = null;
    }
  }
  for (const b of game.buildings) b.target = null; // defence retargets next tick

  adoptNextId(data.nextId);

  game.visionDirty = true;
  recomputeVision(game);
  return game;
}
