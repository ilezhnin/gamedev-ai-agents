// Core simulation: entities, movement, combat, harvesting economy,
// production queues, power, fog of war and win/lose bookkeeping.
// Rendering never lives here — main.js reads this state every frame.

import { UNITS, BUILDINGS, WEAPONS, WARHEADS, ECONOMY } from './rules.js';
import { findPath, nearestFree } from './pathfind.js';
import { makeRng, u8ToB64, b64ToU8 } from './palette.js';
import { GameMap } from './map.js';
import { FACINGS } from './sprites.js';

let NEXT_ID = 1;

// bump when the serialized save shape changes; a mismatched save is discarded
export const SAVE_VERSION = 2;

// veterancy: index by rank (0..2). rank1 at 1x own cost, rank2 at 3x.
export const RANK_DMG = [1, 1.15, 1.30];   // outgoing damage multiplier
export const RANK_HP = [1, 1, 1.25];       // max-hp multiplier (rank2 only)
export const MAX_RANK = 2;

// commander-power tuning (human tech-center abilities)
export const RECON_CD = 90, RECON_RADIUS = 8, RECON_DUR = 10;
export const EMP_CD = 150, EMP_RADIUS = 4, EMP_DUR = 8;

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
    this.stats = { built: 0, lost: 0, killed: 0, harvested: 0 };
  }

  lowPower() { return this.powerUsed > this.powerMade; }
}

// ---------------------------------------------------------------------------

export class Entity {
  constructor(owner, key) {
    this.id = NEXT_ID++;
    this.owner = owner;               // Player
    this.key = key;
    this.hp = 1; this.maxHp = 1;
    this.dead = false;
    this.sprite = null;               // THREE group, managed by renderer
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
    this.guardX = x; this.guardY = y;
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

// ---------------------------------------------------------------------------

export class Game {
  constructor(map, audio, seed = 1234, enemyHouses = ['enemy']) {
    this.map = map;
    this.audio = audio;
    this.seed = seed;
    this.rng = makeRng(seed);
    this.players = { player: new Player('player', true) };
    for (const h of enemyHouses) if (h !== 'neutral') this.players[h] = new Player(h, false);
    // neutral house owns the map's supply depots — never an opponent
    this.players.neutral = new Player('neutral', false);
    this.players.neutral.isNeutral = true;
    this.units = [];
    this.buildings = [];
    this.projectiles = [];
    this.pendingShots = [];           // staggered salvo shots waiting to fire
    this.effects = [];                // {kind,x,y,t,...} consumed by renderer
    this.time = 0;
    this.oreTimer = 0;
    this.over = false;
    this.won = false;
    this.events = [];                 // UI notifications {kind, text, voice}
    // fog of war (human player's view)
    const n = map.size * map.size;
    this.explored = new Uint8Array(n);
    this.visible = new Uint8Array(n);
    this.visionDirty = true;
    this.underAttackCooldown = 0;
    // commander powers (human, tech-center gated)
    this.reconCd = 0;                 // recon-sweep cooldown remaining
    this.empCd = 0;                   // EMP-blast cooldown remaining
    this.reconSweeps = [];            // {x,y,r,t} temporary fog reveals
    this.empZones = [];               // {x,y,r,t} active EMP fields (for fx)
  }

  emit(kind, text, voice) { this.events.push({ kind, text, voice }); }

  // ------------------------------------------------------------- spawning --

  addBuilding(owner, key, cx, cy, opts = {}) {
    const b = new Building(owner, key, cx, cy);
    this.buildings.push(b);
    for (let y = cy; y < cy + b.def.h; y++)
      for (let x = cx; x < cx + b.def.w; x++)
        if (this.map.inBounds(x, y)) {
          this.map.blocked[this.map.idx(x, y)] = 1;
          this.map.ore[this.map.idx(x, y)] = 0;
        }
    owner.powerMade += Math.max(0, b.def.power);
    owner.powerUsed += Math.max(0, -b.def.power);
    if (b.def.givesRadar) owner.hasRadar = true;
    if (b.def.storage) owner.storage += b.def.storage;
    if (!opts.instant) b.buildRise = 0;
    this.visionDirty = true;
    // refinery arrives with a free ore truck, like the classics
    if (b.def.grantsUnit && !opts.noFreeUnit) {
      const spot = nearestFree(this.map, cx + 1, cy + b.def.h, null);
      if (spot) {
        const u = this.addUnit(owner, b.def.grantsUnit, spot[0], spot[1]);
        if (u.def.harvester) this.orderHarvest(u);
      }
    }
    return b;
  }

  addUnit(owner, key, x, y) {
    const u = new Unit(owner, key, x, y);
    this.units.push(u);
    this.map.occupant[this.map.idx(u.cellX, u.cellY)] = u;
    this.visionDirty = true;
    return u;
  }

  // spawn the map's neutral supply depots (2x2 buildings owned by 'neutral').
  // Called once on a fresh match; loaded games restore them as buildings.
  spawnDepots() {
    for (const d of this.map.depots || []) {
      this.addBuilding(this.players.neutral, 'depot', d.x, d.y, { instant: true });
    }
  }

  // ------------------------------------------------------------ production --

  techSatisfied(owner, def) {
    if (!def.requires) return true;
    return def.requires.every((k) => this.buildings.some(
      (b) => !b.dead && b.owner === owner && b.key === k));
  }

  canProduce(owner, kind, key) {
    if (kind === 'building') {
      const def = BUILDINGS[key];
      if (def.unbuildable) return false;
      if (!this.buildings.some((b) => !b.dead && b.owner === owner && b.key === 'conyard')) return false;
      return this.techSatisfied(owner, def);
    }
    const def = UNITS[key];
    const fac = def.producedAt;
    if (!this.buildings.some((b) => !b.dead && b.owner === owner && b.key === fac)) return false;
    return this.techSatisfied(owner, def);
  }

  startProduction(owner, kind, key) {
    const slot = kind === 'building' ? 'building' : 'unit';
    if (owner.prod[slot]) return false;
    if (kind === 'building' && owner.readyBuilding) return false;
    if (!this.canProduce(owner, kind, key)) return false;
    const def = kind === 'building' ? BUILDINGS[key] : UNITS[key];
    owner.prod[slot] = { kind, key, def, spent: 0, progress: 0, hold: false };
    return true;
  }

  cancelProduction(owner, slot) {
    const p = owner.prod[slot];
    if (!p) return;
    owner.credits += p.spent;
    owner.prod[slot] = null;
  }

  tickProduction(owner, dt) {
    for (const slot of ['building', 'unit']) {
      const p = owner.prod[slot];
      if (!p || p.hold) continue;
      const speed = owner.lowPower() ? ECONOMY.lowPowerSpeed : 1;
      const need = p.def.buildTime;
      const rate = (1 / Math.max(0.5, need)) * speed;     // progress per second
      const costRate = p.def.cost * rate;
      const step = Math.min(costRate * dt, p.def.cost - p.spent);
      if (owner.credits >= step) {
        owner.credits -= step;
        p.spent += step;
        p.progress = p.def.cost > 0 ? p.spent / p.def.cost : 1;
        if (owner.isHuman && step > 0) this.audio.sfx('tick');
      } else if (owner.isHuman && Math.random() < dt * 0.4) {
        this.emit('warn', 'INSUFFICIENT FUNDS');
      }
      if (p.progress >= 0.999) {
        owner.prod[slot] = null;
        if (p.kind === 'building') {
          owner.readyBuilding = p;
          if (owner.isHuman) { this.audio.sfx('ready'); this.audio.say('Construction complete'); this.emit('info', `${p.def.name} READY — CLICK TO PLACE`); }
        } else {
          this.deliverUnit(owner, p.key);
        }
      }
    }
  }

  deliverUnit(owner, key) {
    const def = UNITS[key];
    const facKey = def.producedAt;
    const fac = this.buildings.find((b) => !b.dead && b.owner === owner && b.key === facKey);
    if (!fac) { owner.credits += def.cost; return; }
    const exit = nearestFree(this.map, fac.cx + Math.floor(fac.def.w / 2), fac.cy + fac.def.h, null);
    if (!exit) { owner.credits += def.cost; return; }
    const u = this.addUnit(owner, key, exit[0], exit[1]);
    owner.stats.built++;
    if (owner.isHuman) { this.audio.sfx('ready'); this.audio.say('Unit ready'); }
    if (def.harvester) this.orderHarvest(u);
    else if (fac.rally) this.orderMove(u, fac.rally[0], fac.rally[1]);
    return u;
  }

  // building placement -------------------------------------------------------

  placementValid(owner, key, cx, cy) {
    const def = BUILDINGS[key];
    let nearBase = false;
    for (let y = cy; y < cy + def.h; y++) {
      for (let x = cx; x < cx + def.w; x++) {
        if (!this.map.isBuildable(x, y)) return false;
      }
    }
    // adjacency: within 3 cells of an existing friendly building footprint.
    // walls are fire-and-forget blockers and never extend the base envelope.
    for (const b of this.buildings) {
      if (b.dead || b.owner !== owner || b.def.isWall) continue;
      if (cx < b.cx + b.def.w + 3 && cx + def.w > b.cx - 3 &&
          cy < b.cy + b.def.h + 3 && cy + def.h > b.cy - 3) { nearBase = true; break; }
    }
    return nearBase;
  }

  placeBuilding(owner, cx, cy) {
    const p = owner.readyBuilding;
    if (!p || !this.placementValid(owner, p.key, cx, cy)) return false;
    owner.readyBuilding = null;
    this.addBuilding(owner, p.key, cx, cy);
    if (owner.isHuman) this.audio.sfx('place');
    return true;
  }

  sellBuilding(b) {
    if (b.dead) return;
    b.owner.credits += Math.floor(b.def.cost * ECONOMY.sellRefund);
    if (b.owner.isHuman) { this.audio.sfx('sell'); this.audio.say('Structure sold'); }
    this.destroyBuilding(b, null, true);
  }

  // ---------------------------------------------------------------- orders --

  orderMove(u, tx, ty, queue = false) {
    u.order = { type: 'move' };
    u.target = null;
    u.destX = tx; u.destY = ty;
    u.guardX = tx; u.guardY = ty;
    this.setPath(u, tx, ty);
  }

  orderAttackMove(u, tx, ty) {
    u.order = { type: 'attackmove' };
    u.target = null;
    u.destX = tx; u.destY = ty;
    this.setPath(u, tx, ty);
  }

  orderAttack(u, target) {
    if (!u.def.weapon) { this.orderMove(u, target.isUnit ? target.cellX : target.cx, target.isUnit ? target.cellY : target.cy); return; }
    u.order = { type: 'attack' };
    u.target = target;
  }

  orderHarvest(u, cell = null) {
    if (!u.def.harvester) return;
    u.order = { type: 'harvest' };
    u.target = null;
    if (cell) u.oreGoal = cell;
    else u.oreGoal = null;
  }

  orderDeploy(u) {
    if (!u.def.deploysTo) return;
    u.order = { type: 'deploy' };
    const def = BUILDINGS[u.def.deploysTo];
    // try to deploy centred on the MCV
    u.deployCell = [u.cellX - Math.floor(def.w / 2), u.cellY - Math.floor(def.h / 2)];
  }

  // engineer boards an enemy structure and seizes it (walls excluded)
  orderCapture(u, target) {
    if (!u.def || u.key !== 'engineer') return;
    if (!target || target.dead || !target.isBuilding) return;
    if (target.def.isWall || target.owner === u.owner) return;
    u.order = { type: 'capture' };
    u.target = target;
    u.path = [];
  }

  // infantry walks up to a friendly APC and climbs aboard
  orderBoard(u, apc) {
    if (!u || !u.def || u.def.kind !== 'infantry') return;
    if (!apc || apc.dead || !apc.isUnit || apc.key !== 'apc' || apc.owner !== u.owner) return;
    if (apc.cargoUnits && apc.cargoUnits.length >= (apc.def.capacity || 0)) return;
    u.order = { type: 'board' };
    u.target = apc;
    u.path = [];
    u.unloadAt = false;
  }

  // APC drops its passengers onto free cells around it
  orderUnload(apc) {
    if (!apc || apc.key !== 'apc' || !apc.cargoUnits || apc.cargoUnits.length === 0) return;
    apc.order = { type: 'unload' };
    apc.target = null;
    apc.path = [];
    apc.unloadAt = false;
  }

  // move an infantry passenger inside the APC: it leaves the grid entirely
  boardUnit(apc, passenger) {
    if (!apc.cargoUnits || apc.cargoUnits.length >= (apc.def.capacity || 0)) {
      passenger.order = { type: 'idle' }; passenger.target = null; return;
    }
    const m = this.map;
    m.occupant[m.idx(passenger.cellX, passenger.cellY)] = null;
    if (passenger.reserved) m.occupant[m.idx(passenger.reserved[0], passenger.reserved[1])] = null;
    passenger.reserved = null;
    passenger.moving = false;
    passenger.path = [];
    passenger.boarded = true;
    passenger.order = { type: 'idle' };
    passenger.target = null;
    apc.cargoUnits.push(passenger);
    if (apc.owner.isHuman) this.audio.sfx('select');
    this.visionDirty = true;
  }

  // drop a single passenger back onto a free cell next to the APC
  unloadUnit(apc, passenger, cell) {
    const m = this.map;
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
    this.visionDirty = true;
  }

  // a free cell hugging a unit's own cell (for APC unload spots)
  adjacentFreeUnitCell(u, ignore) {
    for (let r = 1; r <= 3; r++) {
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = u.cellX + dx, y = u.cellY + dy;
          if (this.map.isFree(x, y, ignore)) return [x, y];
        }
    }
    return null;
  }

  // ------------------------------------------------------- commander powers --

  // human tech-center abilities. Returns true if fired (starts the cooldown).
  castPower(which, x, y) {
    const p = this.players.player;
    const hasTech = this.buildings.some((b) => !b.dead && b.owner === p && b.key === 'techcenter');
    if (!hasTech) return false;
    if (which === 'recon') {
      if (this.reconCd > 0) return false;
      this.reconCd = RECON_CD;
      this.reconSweeps.push({ x: Math.round(x), y: Math.round(y), r: RECON_RADIUS, t: RECON_DUR });
      this.visionDirty = true;
      if (p.isHuman) { this.audio.sfx('ready'); this.audio.say('Recon sweep', true); }
      return true;
    }
    if (which === 'emp') {
      if (this.empCd > 0) return false;
      this.empCd = EMP_CD;
      this.castEmp(x, y);
      if (p.isHuman) this.audio.say('E M P blast', true);
      return true;
    }
    return false;
  }

  // disable enemy vehicles + defence buildings inside the blast for EMP_DUR
  castEmp(x, y) {
    const p = this.players.player;
    const r = EMP_RADIUS;
    this.empZones.push({ x, y, r, t: EMP_DUR });
    for (const u of this.units) {
      if (u.dead || u.boarded || u.owner === p || u.def.kind !== 'vehicle') continue;
      if (Math.hypot(u.x - x, u.y - y) <= r) u.empT = EMP_DUR;
    }
    for (const b of this.buildings) {
      if (b.dead || b.owner === p || !b.def.weapon) continue;   // defence buildings only
      const [bx, by] = b.centre();
      if (Math.hypot(bx - 0.5 - x, by - 0.5 - y) <= r + 0.5) b.empT = EMP_DUR;
    }
    this.effects.push({ kind: 'emp', x, y, r, t: 0 });
    this.audio.sfx('tesla');
  }

  setPath(u, tx, ty) {
    const path = findPath(this.map, u.cellX, u.cellY, Math.round(tx), Math.round(ty), u);
    u.path = path || [];
    u.repathT = 0;
  }

  // ----------------------------------------------------------------- tick --

  tick(dt) {
    if (this.over) return;
    this.time += dt;

    for (const p of Object.values(this.players)) {
      this.tickProduction(p, dt);
      // animated credits counter
      const diff = p.credits - p.displayCredits;
      if (Math.abs(diff) > 0.5) {
        p.displayCredits += Math.sign(diff) * Math.min(Math.abs(diff), Math.max(8, Math.abs(diff) * 3) * dt * 60 / 60);
      } else p.displayCredits = p.credits;
    }

    // ore growth
    this.oreTimer += dt;
    if (this.oreTimer > ECONOMY.oreGrowthEvery) {
      this.oreTimer = 0;
      this.map.growOre(this.rng);
      this.oreDirty = true;
    }

    this.tickPowers(dt);

    for (const u of this.units) if (!u.dead && !u.boarded) this.tickUnit(u, dt);
    for (const b of this.buildings) if (!b.dead) this.tickBuilding(b, dt);
    this.tickPendingShots(dt);
    this.tickProjectiles(dt);

    // purge dead
    this.units = this.units.filter((u) => !u.dead);
    this.buildings = this.buildings.filter((b) => !b.dead);

    if (this.underAttackCooldown > 0) this.underAttackCooldown -= dt;

    if (this.visionDirty) this.recomputeVision();
    this.checkEnd();
  }

  // tick commander-power cooldowns, temporary recon reveals and EMP fields
  tickPowers(dt) {
    if (this.reconCd > 0) this.reconCd = Math.max(0, this.reconCd - dt);
    if (this.empCd > 0) this.empCd = Math.max(0, this.empCd - dt);
    if (this.reconSweeps.length) {
      for (const s of this.reconSweeps) s.t -= dt;
      this.reconSweeps = this.reconSweeps.filter((s) => s.t > 0);
      this.visionDirty = true;      // keep revealing while active; clears on expiry
    }
    if (this.empZones.length) {
      for (const z of this.empZones) z.t -= dt;
      this.empZones = this.empZones.filter((z) => z.t > 0);
    }
  }

  // ------------------------------------------------------------ unit tick --

  tickUnit(u, dt) {
    u.animT += dt;
    if (u.cooldown > 0) u.cooldown -= dt;
    if (u.empT > 0) { u.empT -= dt; return; }   // EMP'd: can't move or fire

    switch (u.order.type) {
      case 'harvest': this.tickHarvest(u, dt); break;
      case 'return': this.tickReturn(u, dt); break;
      case 'attack': {
        const t = u.target;
        if (!t || t.dead) { u.order = { type: 'idle' }; u.target = null; break; }
        const [tx, ty] = t.isUnit ? [t.x, t.y] : t.centre();
        const dist = Math.hypot(tx - u.x, ty - u.y);
        const w = WEAPONS[u.def.weapon];
        if (dist <= w.range) {
          u.path = [];
          this.aimAndFire(u, t, tx, ty, dt);
        } else {
          u.repathT -= dt;
          if (u.path.length === 0 || u.repathT <= 0) {
            this.setPath(u, Math.round(tx), Math.round(ty));
            u.repathT = 1.2;
          }
        }
        break;
      }
      case 'attackmove': {
        if (!u.target || u.target.dead) {
          u.target = this.acquireTarget(u);
        }
        if (u.target) {
          const t = u.target;
          const [tx, ty] = t.isUnit ? [t.x, t.y] : t.centre();
          const w = WEAPONS[u.def.weapon];
          if (Math.hypot(tx - u.x, ty - u.y) <= w.range) {
            u.path = [];
            this.aimAndFire(u, t, tx, ty, dt);
            break;
          }
        }
        if (u.path.length === 0 && u.destX != null) {
          if (Math.hypot(u.destX - u.x, u.destY - u.y) > 1.5) this.setPath(u, u.destX, u.destY);
          else u.order = { type: 'idle' };
        }
        break;
      }
      case 'deploy': {
        // MCV: walk to the spot then morph into a construction yard
        const [dx, dy] = u.deployCell;
        const def = BUILDINGS[u.def.deploysTo];
        const cx = u.cellX - Math.floor(def.w / 2), cy = u.cellY - Math.floor(def.h / 2);
        let ok = true;
        for (let y = cy; y < cy + def.h && ok; y++)
          for (let x = cx; x < cx + def.w && ok; x++)
            if (!this.map.inBounds(x, y) || !this.map.isPassableTerrain(x, y) ||
                this.map.blocked[this.map.idx(x, y)] ||
                (this.map.occupant[this.map.idx(x, y)] && this.map.occupant[this.map.idx(x, y)] !== u)) ok = false;
        if (ok && !u.moving) {
          this.map.occupant[this.map.idx(u.cellX, u.cellY)] = null;
          u.dead = true;
          const b = this.addBuilding(u.owner, u.def.deploysTo, cx, cy);
          b.buildRise = 0;
          if (u.owner.isHuman) { this.audio.sfx('place'); this.audio.say('Construction yard deployed'); }
          this.visionDirty = true;
          return;
        }
        if (!u.moving && u.path.length === 0) {
          // can't deploy here: nudge one cell and retry once
          const alt = nearestFree(this.map, u.cellX + 2, u.cellY + 2, u);
          if (alt) this.setPath(u, alt[0], alt[1]);
          else u.order = { type: 'idle' };
        }
        break;
      }
      case 'capture': {
        const t = u.target;
        if (!t || t.dead || t.owner === u.owner || t.def.isWall) {
          u.order = { type: 'idle' }; u.target = null; break;
        }
        // adjacent to the footprint (bounding box expanded by one cell)?
        const adj = u.cellX >= t.cx - 1 && u.cellX <= t.cx + t.def.w &&
                    u.cellY >= t.cy - 1 && u.cellY <= t.cy + t.def.h;
        if (adj && !u.moving) {
          this.captureBuilding(t, u.owner);
          this.map.occupant[this.map.idx(u.cellX, u.cellY)] = null;
          u.dead = true;
          this.effects.push({ kind: 'puff', x: u.x, y: u.y, t: 0, frame: 0 });
          if (u.owner.isHuman) { this.audio.sfx('place'); this.audio.say('Structure captured'); }
          this.visionDirty = true;
          return;
        }
        if (!u.moving && u.path.length === 0) {
          const spot = this.adjacentFreeCell(t, u);
          if (spot) this.setPath(u, spot[0], spot[1]);
          else { u.order = { type: 'idle' }; u.target = null; }
        }
        break;
      }
      case 'board': {
        const apc = u.target;
        if (!apc || apc.dead || apc.key !== 'apc' || apc.owner !== u.owner ||
            (apc.cargoUnits && apc.cargoUnits.length >= (apc.def.capacity || 0))) {
          u.order = { type: 'idle' }; u.target = null; break;
        }
        if (!u.moving && Math.hypot(apc.x - u.x, apc.y - u.y) <= 1.6) {
          this.boardUnit(apc, u);
          return;
        }
        // chase the APC (it may be moving); repath periodically
        u.repathT -= dt;
        if (!u.moving && (u.path.length === 0 || u.repathT <= 0)) {
          u.repathT = 0.6;
          const spot = nearestFree(this.map, apc.cellX, apc.cellY, u) || [apc.cellX, apc.cellY];
          this.setPath(u, spot[0], spot[1]);
        }
        break;
      }
      case 'unload': {
        if (!u.cargoUnits || u.cargoUnits.length === 0) { u.order = { type: 'idle' }; break; }
        if (u.moving) break;
        // drop as many as there are free cells this tick
        let progressed = false;
        while (u.cargoUnits.length) {
          const spot = this.adjacentFreeUnitCell(u, u);
          if (!spot) break;
          this.unloadUnit(u, u.cargoUnits.pop(), spot);
          progressed = true;
        }
        if (u.cargoUnits.length === 0 || !progressed) u.order = { type: 'idle' };
        break;
      }
      case 'move':
        // armed units on the march return fire the moment they spot a foe:
        // switch to attack-move so they resume the trip once it's dealt with
        if (u.def.weapon) {
          u.scanT = (u.scanT || 0) - dt;
          if (u.scanT <= 0) {
            u.scanT = 0.3;
            const t = this.acquireTarget(u);
            if (t) { u.order = { type: 'attackmove' }; u.target = t; break; }
          }
        }
        if (u.path.length === 0 && !u.moving) {
          // a loaded APC told to move-and-unload drops its cargo on arrival
          if (u.unloadAt && u.cargoUnits && u.cargoUnits.length) {
            u.unloadAt = false; u.order = { type: 'unload' };
          } else u.order = { type: 'idle' };
        }
        break;
      case 'idle': {
        if (u.def.weapon && u.cooldown <= 0) {
          const t = this.acquireTarget(u);
          if (t) { u.order = { type: 'attackmove' }; u.destX = u.x; u.destY = u.y; u.target = t; }
        }
        if (u.def.harvester && !u.moving) {
          // idle harvesters go back to work after a beat
          u.idleT = (u.idleT || 0) + dt;
          if (u.idleT > 2) { u.idleT = 0; this.orderHarvest(u); }
        }
        break;
      }
    }

    this.tickMovement(u, dt);
  }

  acquireTarget(u) {
    if (!u.def.weapon) return null;
    const w = WEAPONS[u.def.weapon];
    const range = w.range + 1.5;
    let best = null, bestD = 1e9;
    for (const e of this.units) {
      if (e.dead || e.boarded || e.owner === u.owner) continue;
      const d = Math.hypot(e.x - u.x, e.y - u.y);
      if (d < range && d < bestD) { best = e; bestD = d; }
    }
    for (const b of this.buildings) {
      if (b.dead || b.owner === u.owner || b.def.isDepot) continue;
      const [bx, by] = b.centre();
      const d = Math.hypot(bx - u.x, by - u.y) - Math.max(b.def.w, b.def.h) * 0.4;
      if (d < range && d < bestD) { best = b; bestD = d; }
    }
    return best;
  }

  aimAndFire(u, target, tx, ty, dt) {
    if (u.empT > 0) return;                    // EMP'd: weapons offline
    const want = Math.atan2(ty - u.y, tx - u.x) + Math.PI / 2;
    const turnRate = (u.def.turn || 8) * 1.6;
    if (u.def.hasTurret) {
      u.turretFacing = approachAngle(u.turretFacing, want, turnRate * dt);
      if (angleDiff(u.turretFacing, want) > 0.25) return;
    } else {
      u.facing = approachAngle(u.facing, want, turnRate * dt);
      u.turretFacing = u.facing;
      if (angleDiff(u.facing, want) > 0.3) return;
    }
    if (u.cooldown > 0) return;
    const w = WEAPONS[u.def.weapon];
    u.cooldown = w.rof;
    u.fireFlash = 0.09;
    this.fireWeapon(u, target, w);
  }

  // fire one weapon: single shot, or a staggered salvo of N projectiles
  fireWeapon(src, target, w) {
    const salvo = w.salvo || 1;
    if (salvo <= 1) { this.spawnProjectile(src, target, w); return; }
    const spriteXY = (e) => e.isUnit ? [e.x, e.y] : [e.centre()[0] - 0.5, e.centre()[1] - 0.5];
    const aim = spriteXY(target);   // remembered impact point if the target dies
    for (let i = 0; i < salvo; i++) {
      this.pendingShots.push({ t: i * (w.stagger || 0.12), src, target, w, aim });
    }
  }

  tickPendingShots(dt) {
    if (this.pendingShots.length === 0) return;
    for (const s of this.pendingShots) {
      s.t -= dt;
      if (s.t <= 0) {
        if (s.src && !s.src.dead) this.spawnProjectile(s.src, s.target, s.w, s.aim);
        s.done = true;
      }
    }
    this.pendingShots = this.pendingShots.filter((s) => !s.done);
  }

  spawnProjectile(src, target, w, aim = null) {
    // effect/projectile coords live in "sprite space": renderer adds +0.5,
    // so unit positions pass through and building centres shift back half a cell
    const spriteXY = (e) => e.isUnit ? [e.x, e.y] : [e.centre()[0] - 0.5, e.centre()[1] - 0.5];
    const [sx, sy] = spriteXY(src);
    // aim at the live target, or the remembered point if it's already gone
    const live = target && !target.dead ? target : null;
    let tx, ty;
    if (live) [tx, ty] = spriteXY(live);
    else if (aim) [tx, ty] = aim;
    else return;
    this.audio.sfx(w.sound);
    // muzzle flash at the barrel tip (cannons and tower guns)
    if (w.projectile === 'shell' || w.sound === 'mg') {
      const a = src.turretFacing - Math.PI / 2;
      this.effects.push({
        kind: 'muzzle', t: 0,
        x: sx + Math.cos(a) * 0.55,
        y: sy + Math.sin(a) * 0.55,
      });
    }
    if (w.projectile === 'tracer') {
      // hitscan with a brief tracer line
      this.effects.push({ kind: 'tracer', x0: sx, y0: sy, x1: tx, y1: ty, t: 0.06 });
      this.effects.push({ kind: 'puff', x: tx + (this.rng() - 0.5) * 0.4, y: ty + (this.rng() - 0.5) * 0.4, t: 0, frame: 0 });
      if (w.splash) this.applySplash(tx, ty, w, src);
      else if (live) this.dealDamage(live, w, src);
    } else if (w.projectile === 'zap') {
      this.effects.push({ kind: 'zap', x0: sx, y0: sy, x1: tx, y1: ty, t: 0.35 });
      if (w.splash) this.applySplash(tx, ty, w, src);
      else if (live) this.dealDamage(live, w, src);
    } else {
      this.projectiles.push({
        x: sx, y: sy, tx, ty, target: live, w, src,
        speed: w.speed || 8,
        kind: w.projectile,
        angle: Math.atan2(ty - sy, tx - sx),
      });
    }
  }

  // area-of-effect: full damage at the impact cell, a fraction out to the
  // splash radius. friendly fire is on, classic-style.
  applySplash(x, y, w, src) {
    const rad = w.splash;
    const inner = 0.7;               // "impact cell" gets full damage
    const factor = w.splashFactor ?? 0.4;
    const hit = (e, ex, ey) => {
      if (e.dead || e.boarded) return;
      const d = Math.hypot(ex - x, ey - y);
      if (d > rad) return;
      this.dealDamage(e, w, src, d <= inner ? 1 : factor);
    };
    for (const u of this.units) hit(u, u.x, u.y);
    for (const b of this.buildings) {
      const [bx, by] = b.centre();
      hit(b, bx - 0.5, by - 0.5);
    }
  }

  tickProjectiles(dt) {
    for (const p of this.projectiles) {
      if (p.target && !p.target.dead && p.target.isUnit) {
        p.tx = p.target.x; p.ty = p.target.y;
      }
      const d = Math.hypot(p.tx - p.x, p.ty - p.y);
      const step = p.speed * dt;
      p.angle = Math.atan2(p.ty - p.y, p.tx - p.x);
      if (d <= step) {
        p.done = true;
        this.effects.push({ kind: 'puff', x: p.tx, y: p.ty, t: 0, frame: 0 });
        if (p.w.splash) this.applySplash(p.tx, p.ty, p.w, p.src);
        else if (p.target && !p.target.dead) this.dealDamage(p.target, p.w, p.src);
      } else {
        p.x += Math.cos(p.angle) * step;
        p.y += Math.sin(p.angle) * step;
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.done);
  }

  dealDamage(target, w, src, factor = 1) {
    if (target.dead) return;
    const mult = WARHEADS[w.warhead][target.def.armor] ?? 1;
    // veteran shooters hit harder
    const rankMult = (src && src.isUnit && src.rank) ? RANK_DMG[src.rank] : 1;
    target.hp -= w.damage * mult * factor * rankMult;
    // human base under attack notification
    if (target.owner.isHuman && this.underAttackCooldown <= 0) {
      this.underAttackCooldown = 12;
      this.audio.sfx('alert');
      this.audio.say(target.isBuilding ? 'Base under attack' : 'Units under attack', true);
      this.emit('warn', target.isBuilding ? 'BASE UNDER ATTACK' : 'UNITS UNDER ATTACK');
    }
    // return fire immediately, even mid-march
    if (target.isUnit && target.def.weapon && src && !src.dead &&
        (target.order.type === 'idle' || target.order.type === 'move')) {
      this.orderAttack(target, src.isUnit || src.isBuilding ? src : null);
    }
    if (target.hp <= 0) {
      if (src) {
        src.owner.stats.killed++;
        // killing blow credits the shooter with the victim's worth as xp
        if (src.isUnit && src.def.weapon) this.awardXp(src, target);
      }
      if (target.isUnit) this.destroyUnit(target);
      else this.destroyBuilding(target, src);
    }
  }

  // grant xp equal to the destroyed thing's cost; promote at 1x / 3x own cost
  awardXp(u, victim) {
    if (u.rank >= MAX_RANK) return;
    u.xp += (victim.def && victim.def.cost) || 0;
    const cost = u.def.cost || 1;
    let rank = u.rank;
    if (u.xp >= cost * 3) rank = 2;
    else if (u.xp >= cost) rank = 1;
    if (rank > u.rank) this.promote(u, rank);
  }

  promote(u, rank) {
    u.rank = Math.min(MAX_RANK, rank);
    // rank2 lifts max hp; heal the fresh delta so the promotion feels good
    const newMax = Math.round(u.def.hp * RANK_HP[u.rank]);
    if (newMax > u.maxHp) { u.hp += newMax - u.maxHp; u.maxHp = newMax; }
    this.effects.push({ kind: 'puff', x: u.x, y: u.y, t: 0, frame: 0 });
    if (u.owner.isHuman) this.audio.sfx('ready');
  }

  destroyUnit(u) {
    u.dead = true;
    u.owner.stats.lost++;
    this.map.occupant[this.map.idx(u.cellX, u.cellY)] = null;
    if (u.reserved) this.map.occupant[this.map.idx(u.reserved[0], u.reserved[1])] = null;
    // an APC takes its passengers down with it
    if (u.cargoUnits && u.cargoUnits.length) {
      for (const p of u.cargoUnits) {
        if (p.dead) continue;
        p.dead = true; p.boarded = false;
        p.owner.stats.lost++;
      }
      u.cargoUnits = [];
    }
    const big = u.def.kind === 'vehicle';
    this.effects.push({ kind: 'explosion', x: u.x, y: u.y, t: 0, frame: 0, big });
    this.effects.push({ kind: 'scorch', x: u.cellX, y: u.cellY, t: 25 });
    this.audio.sfx(big ? 'boomBig' : 'boomSmall');
    this.visionDirty = true;
  }

  destroyBuilding(b, src, sold = false) {
    b.dead = true;
    if (!sold) b.owner.stats.lost++;
    for (let y = b.cy; y < b.cy + b.def.h; y++)
      for (let x = b.cx; x < b.cx + b.def.w; x++)
        if (this.map.inBounds(x, y)) this.map.blocked[this.map.idx(x, y)] = 0;
    b.owner.powerMade -= Math.max(0, b.def.power);
    b.owner.powerUsed -= Math.max(0, -b.def.power);
    if (b.def.storage) b.owner.storage -= b.def.storage;
    if (b.def.givesRadar) {
      b.owner.hasRadar = this.buildings.some((o) => !o.dead && o !== b && o.owner === b.owner && o.def.givesRadar);
    }
    if (!sold) {
      const [cx, cy] = b.centre();
      for (let i = 0; i < b.def.w * b.def.h; i++) {
        this.effects.push({
          kind: 'explosion', big: true, t: -i * 0.08, frame: 0,
          x: b.cx + this.rng() * b.def.w, y: b.cy + this.rng() * b.def.h,
        });
      }
      this.effects.push({ kind: 'scorch', x: Math.floor(cx), y: Math.floor(cy), t: 40 });
      this.audio.sfx('boomBig');
      if (b.owner.isHuman) this.audio.say('Structure destroyed');
    }
    this.visionDirty = true;
  }

  // transfer a structure to a new owner, keeping power/radar/storage books
  // straight (no destroy+recreate — hp and position are preserved)
  captureBuilding(b, newOwner) {
    const old = b.owner;
    if (old === newOwner) return;
    old.powerMade -= Math.max(0, b.def.power);
    old.powerUsed -= Math.max(0, -b.def.power);
    newOwner.powerMade += Math.max(0, b.def.power);
    newOwner.powerUsed += Math.max(0, -b.def.power);
    if (b.def.storage) { old.storage -= b.def.storage; newOwner.storage += b.def.storage; }
    if (b.def.givesRadar) {
      newOwner.hasRadar = true;
      old.hasRadar = this.buildings.some((o) => !o.dead && o !== b && o.owner === old && o.def.givesRadar);
    }
    b.owner = newOwner;
    b.target = null;
    b.repairing = false;
    b.seen = false;
    if (newOwner.isHuman) this.emit('info', `${b.def.name} CAPTURED`);
    this.visionDirty = true;
  }

  // nearest free cell hugging a building's footprint, for engineer approach
  adjacentFreeCell(b, u) {
    const cells = [];
    for (let x = b.cx - 1; x <= b.cx + b.def.w; x++) {
      cells.push([x, b.cy - 1], [x, b.cy + b.def.h]);
    }
    for (let y = b.cy; y < b.cy + b.def.h; y++) {
      cells.push([b.cx - 1, y], [b.cx + b.def.w, y]);
    }
    let best = null, bd = 1e9;
    for (const [x, y] of cells) {
      if (!this.map.isFree(x, y, u)) continue;
      const d = Math.hypot(x - u.cellX, y - u.cellY);
      if (d < bd) { bd = d; best = [x, y]; }
    }
    return best;
  }

  // ------------------------------------------------------------- movement --

  // can this vehicle roll over whoever is standing on the cell?
  canCrushInto(u, nx, ny) {
    if (!u.def.crusher) return false;
    const i = this.map.idx(nx, ny);
    if (!this.map.isPassableTerrain(nx, ny) || this.map.blocked[i]) return false;
    const occ = this.map.occupant[i];
    return !!(occ && occ !== u && occ.isUnit && !occ.dead &&
      occ.def.kind === 'infantry' && occ.owner !== u.owner);
  }

  crushUnit(victim, crusher) {
    victim.dead = true;
    victim.owner.stats.lost++;
    crusher.owner.stats.killed++;
    this.map.occupant[this.map.idx(victim.cellX, victim.cellY)] = null;
    if (victim.reserved) this.map.occupant[this.map.idx(victim.reserved[0], victim.reserved[1])] = null;
    this.effects.push({ kind: 'puff', x: victim.x, y: victim.y, t: 0, frame: 0 });
    this.effects.push({ kind: 'scorch', x: victim.cellX, y: victim.cellY, t: 15 });
    this.audio.sfx('crush');
    this.visionDirty = true;
  }

  tickMovement(u, dt) {
    if (!u.moving) {
      if (u.path.length === 0) return;
      const [nx, ny] = u.path[0];
      // tracked vehicles flatten enemy infantry in their way
      if (this.canCrushInto(u, nx, ny)) {
        this.crushUnit(this.map.occupant[this.map.idx(nx, ny)], u);
      }
      if (!this.map.isFree(nx, ny, u)) {
        u.stuckT += dt;
        if (u.stuckT > 0.5) {
          u.stuckT = 0;
          u.blockedRepaths = (u.blockedRepaths || 0) + 1;
          if (u.blockedRepaths > 4) {
            // hopelessly wedged: give up on this path instead of looping
            u.blockedRepaths = 0;
            u.path = [];
            if (u.order.type === 'harvest') {
              // blacklist the contested ore cell and pick a different one
              if (u.oreGoal) {
                if (!u.oreBan) u.oreBan = new Set();
                u.oreBan.add(u.oreGoal[0] + ',' + u.oreGoal[1]);
                u.oreGoal = null;
              }
            } else if (u.order.type === 'move') {
              u.order = { type: 'idle' };
            }
            return;
          }
          // re-path around the blockage toward the final goal
          const goal = u.path[u.path.length - 1];
          this.setPath(u, goal[0], goal[1]);
        }
        return;
      }
      u.path.shift();
      u.stuckT = 0;
      u.blockedRepaths = 0;
      u.moving = true;
      u.moveT = 0;
      u.fromX = u.x; u.fromY = u.y;
      u.reserved = [nx, ny];
      this.map.occupant[this.map.idx(nx, ny)] = u;   // reserve destination
    }
    if (u.moving) {
      const [nx, ny] = u.reserved;
      const want = Math.atan2(ny - u.fromY, nx - u.fromX) + Math.PI / 2;
      const turnRate = (u.def.turn || 10) * 2.2;
      u.facing = approachAngle(u.facing, want, turnRate * dt);
      if (!u.def.hasTurret) u.turretFacing = u.facing;
      // vehicles wait to face direction before rolling; infantry just walk
      if (u.def.kind === 'vehicle' && angleDiff(u.facing, want) > 0.6) return;

      const stepLen = Math.hypot(nx - u.fromX, ny - u.fromY) || 1;
      u.moveT += (u.def.speed * dt) / stepLen;
      if (u.moveT >= 1) {
        // arrive
        this.map.occupant[this.map.idx(u.cellX, u.cellY)] = null;
        u.cellX = nx; u.cellY = ny;
        u.x = nx; u.y = ny;
        u.moving = false;
        u.reserved = null;
        this.map.occupant[this.map.idx(nx, ny)] = u;
        if (u.owner.isHuman) this.visionDirty = true;
      } else {
        u.x = u.fromX + (nx - u.fromX) * u.moveT;
        u.y = u.fromY + (ny - u.fromY) * u.moveT;
      }
    }
  }

  // ------------------------------------------------------------ harvesting --

  findOreCell(u) {
    // nearest ore cell, skipping cells parked on by others, cells already
    // claimed by friendly harvesters, and cells this truck failed to reach
    const sx = u.oreGoal ? u.oreGoal[0] : u.cellX;
    const sy = u.oreGoal ? u.oreGoal[1] : u.cellY;
    const taken = new Set();
    for (const o of this.units) {
      if (o === u || o.dead || o.owner !== u.owner || !o.def.harvester) continue;
      if (o.oreGoal) taken.add(o.oreGoal[0] + ',' + o.oreGoal[1]);
      taken.add(o.cellX + ',' + o.cellY);
    }
    // prefer fields close to home: distance to our refinery weighs in, so
    // trucks don't wander into enemy territory while home ore regrows
    const ref = this.findRefinery(u);
    let best = null, bestD = 1e9;
    const m = this.map;
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
      return this.findOreCell(u);
    }
    return best;
  }

  findRefinery(u) {
    let best = null, bestD = 1e9;
    for (const b of this.buildings) {
      if (b.dead || b.owner !== u.owner || b.key !== 'refinery') continue;
      const [cx, cy] = b.centre();
      const d = Math.hypot(cx - u.x, cy - u.y);
      if (d < bestD) { best = b; bestD = d; }
    }
    return best;
  }

  tickHarvest(u, dt) {
    if (u.cargo >= ECONOMY.harvesterCapacity) { u.order = { type: 'return' }; return; }
    const i = this.map.idx(u.cellX, u.cellY);
    if (!u.moving && this.map.ore[i] > 0) {
      // chew ore where we stand
      if (u.oreBan) u.oreBan.clear();
      u.harvestFrom = null;
      u.harvestTicker += dt;
      if (u.harvestTicker >= ECONOMY.harvestTick) {
        u.harvestTicker = 0;
        // gem cells pay double per scoop
        const mult = this.map.gem[i] ? 2 : 1;
        const room = Math.ceil((ECONOMY.harvesterCapacity - u.cargo) / mult);
        const take = Math.min(ECONOMY.harvestPerTrip, this.map.ore[i], room);
        this.map.ore[i] -= take;
        u.cargo += take * mult;
        this.oreDirty = true;
        if (this.map.ore[i] <= 0) {
          this.map.gem[i] = 0;   // mined-out gems stay gone
          this.visionDirty = true;
        }
      }
      return;
    }
    if (!u.moving && u.path.length === 0) {
      const cell = this.findOreCell(u);
      if (!cell) {
        if (u.cargo > 50) { u.order = { type: 'return' }; }
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
      this.setPath(u, cell[0], cell[1]);
    }
  }

  tickReturn(u, dt) {
    const ref = this.findRefinery(u);
    if (!ref) { u.order = { type: 'idle' }; return; }
    // dock cell: centre-bottom tile of the refinery
    const dockX = ref.cx + 1, dockY = ref.cy + ref.def.h;
    if (!u.moving && u.cellX === dockX && u.cellY === dockY) {
      u.dockT += dt;
      const rate = ECONOMY.harvesterCapacity / ECONOMY.unloadTime;
      const amount = Math.min(u.cargo, rate * dt);
      const room = u.owner.storage * 4; // storage is soft in this build
      u.cargo -= amount;
      const gain = amount;
      u.owner.credits = Math.min(u.owner.credits + gain, room + 100000);
      u.owner.stats.harvested += gain;
      if (u.cargo <= 0.5) {
        u.cargo = 0; u.dockT = 0;
        this.orderHarvest(u);
      }
      return;
    }
    if (!u.moving && u.path.length === 0) {
      // shoo idle friendly units off the dock so the truck can unload
      const occ = this.map.occupant[this.map.idx(dockX, dockY)];
      if (occ && occ !== u && occ.owner === u.owner && !occ.def.harvester &&
          (occ.order.type === 'idle' || occ.order.type === 'move')) {
        const spot = nearestFree(this.map, dockX + 2, dockY + 1, occ);
        if (spot) this.orderMove(occ, spot[0], spot[1]);
      }
      this.setPath(u, dockX, dockY);
    }
  }

  // ------------------------------------------------------------ buildings --

  tickBuilding(b, dt) {
    if (b.buildRise < 1) b.buildRise = Math.min(1, b.buildRise + dt * 1.6);
    if (b.empT > 0) b.empT -= dt;

    // captured supply depot trickles credits to its owner
    if (b.def.isDepot && !b.owner.isNeutral) {
      b.owner.credits += b.def.income * dt;
    }

    // battle damage smoke
    if (b.hp < b.maxHp * 0.5) {
      b.smokeT -= dt;
      if (b.smokeT <= 0) {
        b.smokeT = 0.5 + this.rng() * 0.8;
        this.effects.push({
          kind: 'smoke', t: 0,
          x: b.cx + 0.4 + this.rng() * (b.def.w - 0.8),
          y: b.cy + 0.3 + this.rng() * (b.def.h - 0.8),
        });
      }
    }

    // repair
    if (b.repairing && b.hp < b.maxHp) {
      const costPerHp = (b.def.cost * ECONOMY.repairCostFactor) / b.def.hp;
      const hp = Math.min(ECONOMY.repairHpPerSec * dt, b.maxHp - b.hp);
      const cost = hp * costPerHp;
      if (b.owner.credits >= cost) {
        b.owner.credits -= cost;
        b.hp += hp;
        if (b.hp >= b.maxHp) b.repairing = false;
      }
    }

    // defensive structures
    if (b.def.weapon) {
      if (b.cooldown > 0) b.cooldown -= dt;
      if (b.empT > 0) { b.target = null; return; }     // EMP'd defence: offline
      if (b.def.needsPower && b.owner.lowPower()) { b.target = null; return; }
      if (!b.target || b.target.dead) b.target = this.acquireTargetFor(b);
      if (b.target) {
        const w = WEAPONS[b.def.weapon];
        const [bx, by] = b.centre();
        const [tx, ty] = b.target.isUnit ? [b.target.x, b.target.y] : b.target.centre();
        const d = Math.hypot(tx - bx, ty - by);
        if (d > w.range + 0.5) { b.target = null; return; }
        const want = Math.atan2(ty - by, tx - bx) + Math.PI / 2;
        b.turretFacing = approachAngle(b.turretFacing, want, 6 * dt);
        if (b.cooldown <= 0 && angleDiff(b.turretFacing, want) < 0.3) {
          b.cooldown = w.rof;
          b.fireFlash = 0.09;
          this.fireWeapon(b, b.target, w);
        }
      }
    }
  }

  acquireTargetFor(b) {
    const w = WEAPONS[b.def.weapon];
    const [bx, by] = b.centre();
    let best = null, bestD = 1e9;
    for (const e of this.units) {
      if (e.dead || e.boarded || e.owner === b.owner) continue;
      const d = Math.hypot(e.x - bx, e.y - by);
      if (d <= w.range && d < bestD) { best = e; bestD = d; }
    }
    return best;
  }

  // ------------------------------------------------------------------ fog --

  recomputeVision() {
    this.visionDirty = false;
    const m = this.map;
    this.visible.fill(0);
    const reveal = (cx, cy, r) => {
      const r2 = r * r;
      for (let y = Math.max(0, cy - r); y <= Math.min(m.size - 1, cy + r); y++) {
        for (let x = Math.max(0, cx - r); x <= Math.min(m.size - 1, cx + r); x++) {
          const dx = x - cx, dy = y - cy;
          if (dx * dx + dy * dy <= r2) {
            const i = m.idx(x, y);
            this.visible[i] = 1;
            this.explored[i] = 1;
          }
        }
      }
    };
    for (const u of this.units) {
      if (u.dead || u.boarded || !u.owner.isHuman) continue;
      reveal(u.cellX, u.cellY, u.def.sight);
    }
    for (const b of this.buildings) {
      if (b.dead || !b.owner.isHuman) continue;
      const [cx, cy] = b.centre();
      reveal(Math.floor(cx), Math.floor(cy), b.def.sight);
    }
    // recon-sweep power: temporary reveal circles that pierce the fog
    for (const s of this.reconSweeps) reveal(s.x, s.y, s.r);
  }

  isVisibleToPlayer(e) {
    if (e.isBuilding) {
      for (let y = e.cy; y < e.cy + e.def.h; y++)
        for (let x = e.cx; x < e.cx + e.def.w; x++)
          if (this.map.inBounds(x, y) && this.visible[this.map.idx(x, y)]) return true;
      return false;
    }
    const i = this.map.idx(e.cellX, e.cellY);
    return !!this.visible[i];
  }

  // -------------------------------------------------------- save / load ----

  // full match snapshot as a plain JSON-friendly object. AI state is added by
  // the caller (main.js) via AI.serialize — the sim doesn't own the opponents.
  serialize() {
    const m = this.map;
    const players = {};
    for (const [house, p] of Object.entries(this.players)) {
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
    const buildings = this.buildings.filter((b) => !b.dead).map((b) => ({
      id: b.id, key: b.key, house: b.house,
      cx: b.cx, cy: b.cy, hp: b.hp,
      repairing: !!b.repairing,
      rally: b.rally ? [b.rally[0], b.rally[1]] : null,
      turretFacing: b.turretFacing,
      seen: !!b.seen,
      empT: b.empT > 0 ? b.empT : 0,
    }));
    const units = this.units.filter((u) => !u.dead).map((u) => ({
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
      seed: this.seed,
      time: this.time,
      nextId: NEXT_ID,
      reconCd: this.reconCd,
      empCd: this.empCd,
      reconSweeps: this.reconSweeps.map((s) => ({ x: s.x, y: s.y, r: s.r, t: s.t })),
      empZones: this.empZones.map((z) => ({ x: z.x, y: z.y, r: z.r, t: z.t })),
      map: {
        size: m.size, seed: m.seed, biome: m.biome,
        layout: m.layout, layoutReq: m.layoutReq,
        starts: m.starts.map((s) => ({ x: s.x, y: s.y })),
        oreMax: m.oreMax,
        terrain: u8ToB64(m.terrain),
        variant: u8ToB64(m.variant),
        ore: u8ToB64(new Uint8Array(m.ore.buffer, m.ore.byteOffset, m.ore.byteLength)),
        gem: u8ToB64(m.gem),
      },
      players,
      buildings,
      units,
      explored: u8ToB64(this.explored),
    };
  }

  // rebuild a live Game from a serialized snapshot. Renderer state is rebuilt
  // lazily by main.js (buildTerrain/Ore/Fog after this returns).
  static load(data, audio) {
    const map = GameMap.restore(data.map);
    const enemyHouses = Object.keys(data.players).filter((h) => h !== 'player' && h !== 'neutral');
    const game = new Game(map, audio, data.seed ?? 1234, enemyHouses);
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
      u.guardX = u.x; u.guardY = u.y;
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

    NEXT_ID = Math.max(NEXT_ID, data.nextId || 1);

    game.visionDirty = true;
    game.recomputeVision();
    return game;
  }

  // ------------------------------------------------------------------ end --

  checkEnd() {
    if (this.over || this.time < 5) return;
    // walls and neutral depots don't count as a surviving base — a house with
    // only those is out
    const alive = (house) =>
      this.buildings.some((b) => !b.dead && !b.def.isWall && !b.def.isDepot && b.house === house) ||
      this.units.some((u) => !u.dead && u.house === house);
    const playerAlive = alive('player');
    const anyFoeAlive = Object.values(this.players)
      .some((p) => !p.isHuman && !p.isNeutral && alive(p.house));
    if (!anyFoeAlive) { this.over = true; this.won = true; this.audio.say('Mission accomplished', true); }
    else if (!playerAlive) { this.over = true; this.won = false; this.audio.say('Mission failed', true); }
  }
}

// angle helpers ------------------------------------------------------------

export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

export function approachAngle(a, b, maxStep) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) <= maxStep) return b;
  return a + Math.sign(d) * maxStep;
}

export function facingIndex(angle) {
  const step = (Math.PI * 2) / FACINGS;
  let a = angle % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return Math.round(a / step) % FACINGS;
}
