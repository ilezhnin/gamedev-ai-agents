// The sim's state containers: a house (Player) and the things it owns
// (Building, Unit). Construction bookkeeping only — every rule that acts on
// these lives in the other sim modules, which take them as plain data.

import { UNITS, BUILDINGS, ECONOMY } from '../rules.js';

// veterancy: index by rank (0..2). rank1 at 1x own cost, rank2 at 3x.
export const RANK_DMG = [1, 1.15, 1.30];   // outgoing damage multiplier
export const RANK_HP = [1, 1, 1.25];       // max-hp multiplier (rank2 only)
export const MAX_RANK = 2;

// Ids are unique for the lifetime of the page rather than of a match, so a
// save records the high-water mark and a reload never reuses a live id.
let NEXT_ID = 1;
export function peekNextId() { return NEXT_ID; }
export function adoptNextId(n) { NEXT_ID = Math.max(NEXT_ID, n || 1); }

export class Player {
  constructor(house, isHuman) {
    this.house = house;               // 'player' | 'enemy' | 'neutral'
    this.isHuman = isHuman;
    this.isNeutral = false;           // neutral supply-depot owner (no AI, no win goal)
    this.credits = isHuman ? ECONOMY.startCredits : ECONOMY.aiStartCredits;
    this.displayCredits = this.credits; // animated counter for UI
    this.powerMade = 0;
    this.powerUsed = 0;
    this.hasRadar = false;
    this.storage = ECONOMY.baseStorage;
    // production: one active item per strip type
    this.prod = { building: null, unit: null };
    this.readyBuilding = null;        // {key} waiting for placement
    this.stats = { built: 0, armyBuilt: 0, lost: 0, killed: 0, harvested: 0 };
  }

  lowPower() { return this.powerUsed > this.powerMade; }
}

export class Entity {
  constructor(owner, key) {
    this.id = NEXT_ID++;
    this.owner = owner;               // Player
    this.key = key;
    this.hp = 1; this.maxHp = 1;
    this.dead = false;
  }
  get house() { return this.owner.house; }
}

export class Building extends Entity {
  constructor(owner, key, cx, cy) {
    super(owner, key);
    this.def = BUILDINGS[key];
    this.cx = cx; this.cy = cy;       // top-left cell
    this.hp = this.maxHp = this.def.hp;
    this.isBuilding = true;
    this.cooldown = 0;
    this.target = null;
    this.turretFacing = 0;
    this.repairing = false;
    this.rally = null;                // [x,y] for factories
    this.buildRise = 1.0;             // build-up animation 0..1 (starts done)
    this.seen = false;                // ever spotted by the human player
    this.smokeT = 0;
  }
  centre() { return [this.cx + this.def.w / 2, this.cy + this.def.h / 2]; }
  containsCell(x, y) {
    return x >= this.cx && y >= this.cy && x < this.cx + this.def.w && y < this.cy + this.def.h;
  }
}

export class Unit extends Entity {
  constructor(owner, key, x, y) {
    super(owner, key);
    this.def = UNITS[key];
    this.x = x; this.y = y;           // cell coords (float while moving)
    this.cellX = Math.round(x); this.cellY = Math.round(y);
    this.hp = this.maxHp = this.def.hp;
    this.isUnit = true;
    this.facing = Math.random() * Math.PI * 2;
    this.turretFacing = this.facing;
    this.path = [];
    this.moveT = 0;
    this.moving = false;
    this.fromX = x; this.fromY = y;
    this.destX = null; this.destY = null;
    this.order = { type: 'idle' };    // idle | move | attack | attackmove | harvest | return | deploy
    this.target = null;
    this.cooldown = 0;
    this.cargo = 0;                   // harvester ore load
    this.harvestTicker = 0;
    this.dockT = 0;
    this.animT = Math.random() * 10;
    this.stuckT = 0;
    this.repathT = 0;
    // veterancy
    this.xp = 0; this.rank = 0;
    // EMP disable timer (>0 = can't move or fire)
    this.empT = 0;
    // APC transport: passengers ride inside (removed from the grid). Non-APC
    // units keep this null. `boarded` marks a unit currently riding an APC.
    this.cargoUnits = this.def.capacity ? [] : null;
    this.boarded = false;
    this.unloadAt = false;            // drop cargo on reaching a move goal
  }
}
