// Issuing orders: everything that *sets* what a unit is trying to do, plus the
// cell lookups those orders need. Nothing here advances time — the per-tick
// execution of each order lives in unittick.js.
//
// This module sits below the rest of the sim so that any of them can hand a
// unit a new order without importing a peer.

import { BUILDINGS } from '../rules.js';
import { findPath } from '../pathfind.js';

export function setPath(game, u, tx, ty) {
  const path = findPath(game.map, u.cellX, u.cellY, Math.round(tx), Math.round(ty), u);
  u.path = path || [];
  u.repathT = 0;
}

export function orderMove(game, u, tx, ty) {
  u.order = { type: 'move' };
  u.target = null;
  u.destX = tx; u.destY = ty;
  setPath(game, u, tx, ty);
}

export function orderAttackMove(game, u, tx, ty) {
  u.order = { type: 'attackmove' };
  u.target = null;
  u.destX = tx; u.destY = ty;
  setPath(game, u, tx, ty);
}

export function orderAttack(game, u, target) {
  if (!u.def.weapon) {
    orderMove(game, u, target.isUnit ? target.cellX : target.cx, target.isUnit ? target.cellY : target.cy);
    return;
  }
  u.order = { type: 'attack' };
  u.target = target;
}

export function orderHarvest(game, u, cell = null) {
  if (!u.def.harvester) return;
  u.order = { type: 'harvest' };
  u.target = null;
  if (cell) u.oreGoal = cell;
  else u.oreGoal = null;
}

export function orderDeploy(game, u) {
  if (!u.def.deploysTo) return;
  u.order = { type: 'deploy' };
  const def = BUILDINGS[u.def.deploysTo];
  // try to deploy centred on the MCV
  u.deployCell = [u.cellX - Math.floor(def.w / 2), u.cellY - Math.floor(def.h / 2)];
}

// engineer boards an enemy structure and seizes it (walls excluded)
export function orderCapture(game, u, target) {
  if (!u.def || u.key !== 'engineer') return;
  if (!target || target.dead || !target.isBuilding) return;
  if (target.def.isWall || target.owner === u.owner) return;
  u.order = { type: 'capture' };
  u.target = target;
  u.path = [];
}

// infantry walks up to a friendly APC and climbs aboard
export function orderBoard(game, u, apc) {
  if (!u || !u.def || u.def.kind !== 'infantry') return;
  if (!apc || apc.dead || !apc.isUnit || apc.key !== 'apc' || apc.owner !== u.owner) return;
  if (apc.cargoUnits && apc.cargoUnits.length >= (apc.def.capacity || 0)) return;
  u.order = { type: 'board' };
  u.target = apc;
  u.path = [];
  u.unloadAt = false;
}

// APC drops its passengers onto free cells around it
export function orderUnload(game, apc) {
  if (!apc || apc.key !== 'apc' || !apc.cargoUnits || apc.cargoUnits.length === 0) return;
  apc.order = { type: 'unload' };
  apc.target = null;
  apc.path = [];
  apc.unloadAt = false;
}

// move an infantry passenger inside the APC: it leaves the grid entirely
export function boardUnit(game, apc, passenger) {
  if (!apc.cargoUnits || apc.cargoUnits.length >= (apc.def.capacity || 0)) {
    passenger.order = { type: 'idle' }; passenger.target = null; return;
  }
  const m = game.map;
  m.occupant[m.idx(passenger.cellX, passenger.cellY)] = null;
  if (passenger.reserved) m.occupant[m.idx(passenger.reserved[0], passenger.reserved[1])] = null;
  passenger.reserved = null;
  passenger.moving = false;
  passenger.path = [];
  passenger.boarded = true;
  passenger.order = { type: 'idle' };
  passenger.target = null;
  apc.cargoUnits.push(passenger);
  if (apc.owner.isHuman) game.audio.sfx('select');
  game.visionDirty = true;
}

// drop a single passenger back onto a free cell next to the APC
export function unloadUnit(game, passenger, cell) {
  const m = game.map;
  passenger.boarded = false;
  passenger.cellX = cell[0]; passenger.cellY = cell[1];
  passenger.x = cell[0]; passenger.y = cell[1];
  passenger.fromX = cell[0]; passenger.fromY = cell[1];
  passenger.moving = false;
  passenger.reserved = null;
  passenger.path = [];
  passenger.order = { type: 'idle' };
  passenger.target = null;
  m.occupant[m.idx(cell[0], cell[1])] = passenger;
  game.visionDirty = true;
}

// a free cell hugging a unit's own cell (for APC unload spots)
export function adjacentFreeUnitCell(game, u, ignore) {
  for (let r = 1; r <= 3; r++) {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = u.cellX + dx, y = u.cellY + dy;
        if (game.map.isFree(x, y, ignore)) return [x, y];
      }
  }
  return null;
}

// nearest free cell hugging a building's footprint, for engineer approach
export function adjacentFreeCell(game, b, u) {
  const cells = [];
  for (let x = b.cx - 1; x <= b.cx + b.def.w; x++) {
    cells.push([x, b.cy - 1], [x, b.cy + b.def.h]);
  }
  for (let y = b.cy; y < b.cy + b.def.h; y++) {
    cells.push([b.cx - 1, y], [b.cx + b.def.w, y]);
  }
  let best = null, bd = 1e9;
  for (const [x, y] of cells) {
    if (!game.map.isFree(x, y, u)) continue;
    const d = Math.hypot(x - u.cellX, y - u.cellY);
    if (d < bd) { bd = d; best = [x, y]; }
  }
  return best;
}
