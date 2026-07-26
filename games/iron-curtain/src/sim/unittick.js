// Per-order execution: one small handler per order type, dispatched through
// the ORDERS table below.
//
// A handler returns true when it has consumed the unit's whole tick — the unit
// left the field (deployed, captured, boarded) and must not be driven
// afterwards. Every other order falls through to tickMovement, which is what
// lets a unit shoot, harvest or chase while still rolling along its path.

import { WEAPONS, BUILDINGS, UNIT_TIMING } from '../rules.js';
import { nearestFree } from '../pathfind.js';
import { setPath, boardUnit, unloadUnit, adjacentFreeCell, adjacentFreeUnitCell,
  orderHarvest } from './orders.js';
import { acquireTarget, aimAndFire } from './combat.js';
import { tickHarvest, tickReturn } from './economy.js';
import { addBuilding, captureBuilding } from './production.js';
import { tickMovement } from './movement.js';

function tickAttack(game, u, dt) {
  const t = u.target;
  if (!t || t.dead) { u.order = { type: 'idle' }; u.target = null; return; }
  const [tx, ty] = t.isUnit ? [t.x, t.y] : t.centre();
  const dist = Math.hypot(tx - u.x, ty - u.y);
  const w = WEAPONS[u.def.weapon];
  if (dist <= w.range) {
    u.path = [];
    aimAndFire(game, u, t, tx, ty, dt);
  } else {
    u.repathT -= dt;
    if (u.path.length === 0 || u.repathT <= 0) {
      setPath(game, u, Math.round(tx), Math.round(ty));
      u.repathT = UNIT_TIMING.chaseRepath;
    }
  }
}

function tickAttackMove(game, u, dt) {
  if (!u.target || u.target.dead) {
    u.target = acquireTarget(game, u);
  }
  if (u.target) {
    const t = u.target;
    const [tx, ty] = t.isUnit ? [t.x, t.y] : t.centre();
    const w = WEAPONS[u.def.weapon];
    if (Math.hypot(tx - u.x, ty - u.y) <= w.range) {
      u.path = [];
      aimAndFire(game, u, t, tx, ty, dt);
      return;
    }
  }
  if (u.path.length === 0 && u.destX != null) {
    if (Math.hypot(u.destX - u.x, u.destY - u.y) > UNIT_TIMING.arriveSlack) setPath(game, u, u.destX, u.destY);
    else u.order = { type: 'idle' };
  }
}

// MCV: walk to the spot then morph into a construction yard
function tickDeploy(game, u, dt) {
  const def = BUILDINGS[u.def.deploysTo];
  const cx = u.cellX - Math.floor(def.w / 2), cy = u.cellY - Math.floor(def.h / 2);
  let ok = true;
  for (let y = cy; y < cy + def.h && ok; y++)
    for (let x = cx; x < cx + def.w && ok; x++)
      if (!game.map.inBounds(x, y) || !game.map.isPassableTerrain(x, y) ||
          game.map.blocked[game.map.idx(x, y)] ||
          (game.map.occupant[game.map.idx(x, y)] && game.map.occupant[game.map.idx(x, y)] !== u)) ok = false;
  if (ok && !u.moving) {
    game.map.occupant[game.map.idx(u.cellX, u.cellY)] = null;
    u.dead = true;
    const b = addBuilding(game, u.owner, u.def.deploysTo, cx, cy);
    b.buildRise = 0;
    if (u.owner.isHuman) { game.audio.sfx('place'); game.audio.say('Construction yard deployed'); }
    game.visionDirty = true;
    return true;
  }
  if (!u.moving && u.path.length === 0) {
    // can't deploy here: nudge one cell and retry once
    const alt = nearestFree(game.map, u.cellX + 2, u.cellY + 2, u);
    if (alt) setPath(game, u, alt[0], alt[1]);
    else u.order = { type: 'idle' };
  }
}

function tickCapture(game, u, dt) {
  const t = u.target;
  if (!t || t.dead || t.owner === u.owner || t.def.isWall) {
    u.order = { type: 'idle' }; u.target = null; return;
  }
  // adjacent to the footprint (bounding box expanded by one cell)?
  const adj = u.cellX >= t.cx - 1 && u.cellX <= t.cx + t.def.w &&
              u.cellY >= t.cy - 1 && u.cellY <= t.cy + t.def.h;
  if (adj && !u.moving) {
    captureBuilding(game, t, u.owner);
    game.map.occupant[game.map.idx(u.cellX, u.cellY)] = null;
    u.dead = true;
    game.effects.push({ kind: 'puff', x: u.x, y: u.y, t: 0, frame: 0 });
    if (u.owner.isHuman) { game.audio.sfx('place'); game.audio.say('Structure captured'); }
    game.visionDirty = true;
    return true;
  }
  if (!u.moving && u.path.length === 0) {
    const spot = adjacentFreeCell(game, t, u);
    if (spot) setPath(game, u, spot[0], spot[1]);
    else { u.order = { type: 'idle' }; u.target = null; }
  }
}

function tickBoard(game, u, dt) {
  const apc = u.target;
  if (!apc || apc.dead || apc.key !== 'apc' || apc.owner !== u.owner ||
      (apc.cargoUnits && apc.cargoUnits.length >= (apc.def.capacity || 0))) {
    u.order = { type: 'idle' }; u.target = null; return;
  }
  if (!u.moving && Math.hypot(apc.x - u.x, apc.y - u.y) <= UNIT_TIMING.boardRange) {
    boardUnit(game, apc, u);
    return true;
  }
  // chase the APC (it may be moving); repath periodically
  u.repathT -= dt;
  if (!u.moving && (u.path.length === 0 || u.repathT <= 0)) {
    u.repathT = UNIT_TIMING.boardRepath;
    const spot = nearestFree(game.map, apc.cellX, apc.cellY, u) || [apc.cellX, apc.cellY];
    setPath(game, u, spot[0], spot[1]);
  }
}

function tickUnload(game, u, dt) {
  if (!u.cargoUnits || u.cargoUnits.length === 0) { u.order = { type: 'idle' }; return; }
  if (u.moving) return;
  // drop as many as there are free cells this tick
  let progressed = false;
  while (u.cargoUnits.length) {
    const spot = adjacentFreeUnitCell(game, u, u);
    if (!spot) break;
    unloadUnit(game, u.cargoUnits.pop(), spot);
    progressed = true;
  }
  if (u.cargoUnits.length === 0 || !progressed) u.order = { type: 'idle' };
}

function tickMove(game, u, dt) {
  // armed units on the march return fire the moment they spot a foe:
  // switch to attack-move so they resume the trip once it's dealt with
  if (u.def.weapon) {
    u.scanT = (u.scanT || 0) - dt;
    if (u.scanT <= 0) {
      u.scanT = UNIT_TIMING.marchScan;
      const t = acquireTarget(game, u);
      if (t) { u.order = { type: 'attackmove' }; u.target = t; return; }
    }
  }
  if (u.path.length === 0 && !u.moving) {
    // a loaded APC told to move-and-unload drops its cargo on arrival
    if (u.unloadAt && u.cargoUnits && u.cargoUnits.length) {
      u.unloadAt = false; u.order = { type: 'unload' };
    } else u.order = { type: 'idle' };
  }
}

function tickIdle(game, u, dt) {
  if (u.def.weapon && u.cooldown <= 0) {
    const t = acquireTarget(game, u);
    if (t) { u.order = { type: 'attackmove' }; u.destX = u.x; u.destY = u.y; u.target = t; }
  }
  if (u.def.harvester && !u.moving) {
    // idle harvesters go back to work after a beat
    u.idleT = (u.idleT || 0) + dt;
    if (u.idleT > UNIT_TIMING.idleHarvestDelay) { u.idleT = 0; orderHarvest(game, u); }
  }
}

const ORDERS = {
  harvest: (game, u, dt) => { tickHarvest(game, u, dt); },
  return: (game, u, dt) => { tickReturn(game, u, dt); },
  attack: tickAttack,
  attackmove: tickAttackMove,
  deploy: tickDeploy,
  capture: tickCapture,
  board: tickBoard,
  unload: tickUnload,
  move: tickMove,
  idle: tickIdle,
};

export function tickUnit(game, u, dt) {
  u.animT += dt;
  if (u.cooldown > 0) u.cooldown -= dt;
  if (u.empT > 0) { u.empT -= dt; return; }   // EMP'd: can't move or fire

  const handler = ORDERS[u.order.type];
  // the order handler dispatches on the type the unit had at the top of the
  // tick, exactly like the switch it replaced: an order it sets on itself
  // takes effect next tick
  if (handler && handler(game, u, dt) === true) return;

  tickMovement(game, u, dt);
}
