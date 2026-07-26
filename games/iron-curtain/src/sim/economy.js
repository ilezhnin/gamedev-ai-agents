// The ore loop: picking a field, chewing it, driving home and unloading into a
// refinery, plus the passive trickle from a captured supply depot. Credits
// only ever enter a player's account through this module and the depot.

import { ECONOMY } from '../rules.js';
import { nearestFree } from '../pathfind.js';
import { setPath, orderMove, orderHarvest } from './orders.js';

// nearest ore cell, skipping cells parked on by others, cells already claimed
// by friendly harvesters, and cells this truck failed to reach
export function findOreCell(game, u) {
  const sx = u.oreGoal ? u.oreGoal[0] : u.cellX;
  const sy = u.oreGoal ? u.oreGoal[1] : u.cellY;
  const taken = new Set();
  for (const o of game.units) {
    if (o === u || o.dead || o.owner !== u.owner || !o.def.harvester) continue;
    if (o.oreGoal) taken.add(o.oreGoal[0] + ',' + o.oreGoal[1]);
    taken.add(o.cellX + ',' + o.cellY);
  }
  // prefer fields close to home: distance to our refinery weighs in, so
  // trucks don't wander into enemy territory while home ore regrows
  const ref = findRefinery(game, u);
  let best = null, bestD = 1e9;
  const m = game.map;
  for (let y = 0; y < m.size; y++) {
    for (let x = 0; x < m.size; x++) {
      const i = m.idx(x, y);
      if (m.ore[i] <= 0 || m.blocked[i]) continue;
      const key = x + ',' + y;
      if (taken.has(key)) continue;
      if (u.oreBan && u.oreBan.has(key)) continue;
      const occ = m.occupant[i];
      if (occ && occ !== u && !occ.moving) continue;
      let d = Math.hypot(x - sx, y - sy) + Math.hypot(x - u.cellX, y - u.cellY) * 0.3;
      if (ref) d += Math.hypot(x - ref.cx - 1, y - ref.cy - 1) * 0.5;
      if (m.gem[i]) d *= 0.75;   // gems are worth the detour
      if (d < bestD) { best = [x, y]; bestD = d; }
    }
  }
  if (!best && u.oreBan && u.oreBan.size) {
    // everything reachable is banned: forget the bans and retry once
    u.oreBan.clear();
    return findOreCell(game, u);
  }
  return best;
}

export function findRefinery(game, u) {
  let best = null, bestD = 1e9;
  for (const b of game.buildings) {
    if (b.dead || b.owner !== u.owner || b.key !== 'refinery') continue;
    const [cx, cy] = b.centre();
    const d = Math.hypot(cx - u.x, cy - u.y);
    if (d < bestD) { best = b; bestD = d; }
  }
  return best;
}

export function tickHarvest(game, u, dt) {
  if (u.cargo >= ECONOMY.harvesterCapacity) { u.order = { type: 'return' }; return; }
  const i = game.map.idx(u.cellX, u.cellY);
  if (!u.moving && game.map.ore[i] > 0) {
    // chew ore where we stand
    if (u.oreBan) u.oreBan.clear();
    u.harvestFrom = null;
    u.harvestTicker += dt;
    if (u.harvestTicker >= ECONOMY.harvestTick) {
      u.harvestTicker = 0;
      // gem cells pay double per scoop
      const mult = game.map.gem[i] ? ECONOMY.gemMultiplier : 1;
      const room = Math.ceil((ECONOMY.harvesterCapacity - u.cargo) / mult);
      const take = Math.min(ECONOMY.harvestPerTrip, game.map.ore[i], room);
      game.map.ore[i] -= take;
      u.cargo += take * mult;
      game.oreDirty = true;
      if (game.map.ore[i] <= 0) {
        game.map.gem[i] = 0;   // mined-out gems stay gone
        game.visionDirty = true;
      }
    }
    return;
  }
  if (!u.moving && u.path.length === 0) {
    const cell = findOreCell(game, u);
    if (!cell) {
      if (u.cargo > ECONOMY.minReturnLoad) { u.order = { type: 'return' }; }
      else u.order = { type: 'idle' };
      return;
    }
    // going for the same cell from the same spot again means the last
    // attempt went nowhere — blacklist the cell so we try another field
    const key = cell[0] + ',' + cell[1];
    const from = u.cellX + ',' + u.cellY;
    if (u.harvestFrom === from && u.oreGoal && u.oreGoal[0] === cell[0] && u.oreGoal[1] === cell[1]) {
      if (!u.oreBan) u.oreBan = new Set();
      u.oreBan.add(key);
      return; // re-pick next tick with the ban applied
    }
    u.harvestFrom = from;
    u.oreGoal = cell;
    setPath(game, u, cell[0], cell[1]);
  }
}

export function tickReturn(game, u, dt) {
  const ref = findRefinery(game, u);
  if (!ref) { u.order = { type: 'idle' }; return; }
  // dock cell: centre-bottom tile of the refinery
  const dockX = ref.cx + 1, dockY = ref.cy + ref.def.h;
  if (!u.moving && u.cellX === dockX && u.cellY === dockY) {
    u.dockT += dt;
    const rate = ECONOMY.harvesterCapacity / ECONOMY.unloadTime;
    const gain = Math.min(u.cargo, rate * dt);
    const room = u.owner.storage * ECONOMY.storageSoftFactor;
    u.cargo -= gain;
    u.owner.credits = Math.min(u.owner.credits + gain, room + ECONOMY.creditHeadroom);
    u.owner.stats.harvested += gain;
    if (u.cargo <= 0.5) {
      u.cargo = 0; u.dockT = 0;
      orderHarvest(game, u);
    }
    return;
  }
  if (!u.moving && u.path.length === 0) {
    // shoo idle friendly units off the dock so the truck can unload
    const occ = game.map.occupant[game.map.idx(dockX, dockY)];
    if (occ && occ !== u && occ.owner === u.owner && !occ.def.harvester &&
        (occ.order.type === 'idle' || occ.order.type === 'move')) {
      const spot = nearestFree(game.map, dockX + 2, dockY + 1, occ);
      if (spot) orderMove(game, occ, spot[0], spot[1]);
    }
    setPath(game, u, dockX, dockY);
  }
}

// a captured supply depot trickles credits to whoever holds it
export function tickDepotIncome(game, b, dt) {
  if (b.def.isDepot && !b.owner.isNeutral) {
    b.owner.credits += b.def.income * dt;
  }
}
