// Skirmish opponent: follows a build order, keeps power positive, replaces
// lost harvesters, trains a mixed force and throws staged attack waves that
// grow over time. Deliberately fallible — it plays the same game the human
// does (real prices, real harvesting, no vision cheat).
//
// Each AI rolls a personality (rusher / balanced / turtle) that reshapes its
// difficulty knobs, build order and training pattern. On top of that it does
// economy upkeep (harvesters per refinery, a second refinery when the home
// field runs dry), building repair, construction-yard recovery via a fresh
// MCV, harasser defence and a small wave state machine (stage → push →
// retreat).

import { BUILDINGS, UNITS } from './rules.js';
import { nearestFree } from './pathfind.js';

// balanced base build order — personalities remix this
const BUILD_ORDERS = {
  balanced: ['power', 'refinery', 'barracks', 'power', 'factory', 'guard', 'radar', 'techcenter', 'guard', 'power', 'tesla', 'silo'],
  // rusher: barracks + factory fast, almost no static defence
  rusher:   ['power', 'refinery', 'barracks', 'power', 'factory', 'radar', 'guard', 'techcenter', 'power', 'silo'],
  // turtle: rings of towers before it ever pushes
  turtle:   ['power', 'refinery', 'barracks', 'guard', 'power', 'factory', 'flametower', 'guard', 'radar', 'tesla', 'techcenter', 'guard', 'power', 'tesla', 'flametower', 'silo'],
};

const TRAIN_PATTERNS = {
  balanced: ['rifle', 'rifle', 'lightTank', 'rocket', 'heavyTank', 'artillery', 'rifle', 'lightTank', 'rocketTruck', 'heavyTank', 'behemoth'],
  // rusher: cheap early swarm, tanks as soon as they roll
  rusher:   ['rifle', 'rifle', 'lightTank', 'rifle', 'lightTank', 'rocket', 'heavyTank', 'lightTank', 'artillery', 'heavyTank', 'rocketTruck', 'behemoth'],
  // turtle: fewer bodies, more siege and heavy armour
  turtle:   ['rifle', 'rocket', 'lightTank', 'rocket', 'heavyTank', 'artillery', 'rocketTruck', 'heavyTank', 'artillery', 'behemoth'],
};

// personality knob multipliers applied on top of the difficulty level.
// (each personality's defensive lean is expressed through its build order
// and endgame structure pool below, not a knob.)
const PERSONALITIES = {
  rusher:   { firstWave: 0.6, waveMin: 0.8,  waveMax: 0.8,  armyCap: 1.0, waveCap: 0.9,  save: 0.85 },
  balanced: { firstWave: 1.0, waveMin: 1.0,  waveMax: 1.0,  armyCap: 1.0, waveCap: 1.0,  save: 1.0 },
  turtle:   { firstWave: 1.5, waveMin: 1.25, waveMax: 1.25, armyCap: 1.2, waveCap: 1.35, save: 1.1 },
};
const PERSONALITY_NAMES = ['rusher', 'balanced', 'turtle'];

// difficulty knobs — the AI never cheats on prices or income, it just
// thinks faster/slower, saves harder and fields bigger or smaller waves
export const AI_LEVELS = {
  easy:   { think: 2.2, firstWave: 140, waveMin: 90, waveMax: 130, armyCap: 10, waveCap: 6,  save: 0.8 },
  normal: { think: 1.1, firstWave: 95,  waveMin: 65, waveMax: 90,  armyCap: 18, waveCap: 10, save: 0.55 },
  hard:   { think: 0.7, firstWave: 70,  waveMin: 45, waveMax: 70,  armyCap: 26, waveCap: 14, save: 0.45 },
};

const IMPORTANT_BUILDINGS = new Set(['conyard', 'refinery', 'factory', 'techcenter']);

export class AI {
  constructor(game, player, level = 'normal', personality = null) {
    this.game = game;
    this.p = player;
    this.level = level;
    this.baseKnobs = AI_LEVELS[level] || AI_LEVELS.normal;
    this.buildIx = 0;
    this.thinkT = 0;
    this.waveSize = 3;
    this.trainIx = 0;
    this.attackers = new Set();     // ids committed to the current wave
    this.wave = null;               // { members, phase, ... } or null
    this.harvHp = new Map();        // harvester id -> hp last seen
    this.harassCd = 0;              // cooldown between harasser dispatches
    this.econT = 0;                 // throttle for the local-ore map scan
    this.depotCd = 20;              // cooldown between depot-capture pushes
    this.needRefinery = false;
    this.refineryAnchor = null;     // [x,y] richest field to expand toward
    this.wallsBuilt = 0;
    this.applyPersonality(personality || this.rollPersonality());
    this.waveT = this.d.firstWave;
  }

  // seeded pick so a given match is reproducible
  rollPersonality() {
    return PERSONALITY_NAMES[Math.floor(this.game.rng() * PERSONALITY_NAMES.length) % PERSONALITY_NAMES.length];
  }

  applyPersonality(name) {
    if (!PERSONALITIES[name]) name = 'balanced';
    this.personality = name;
    const pm = PERSONALITIES[name], b = this.baseKnobs;
    this.d = {
      think: b.think,
      firstWave: b.firstWave * pm.firstWave,
      waveMin: b.waveMin * pm.waveMin,
      waveMax: b.waveMax * pm.waveMax,
      armyCap: Math.round(b.armyCap * pm.armyCap),
      waveCap: Math.round(b.waveCap * pm.waveCap),
      save: Math.min(0.95, b.save * pm.save),
    };
    this.buildOrder = BUILD_ORDERS[name];
    this.trainPattern = TRAIN_PATTERNS[name];
  }

  // durable planning state for save/load. In-flight combat transients (the
  // active wave, harvester-hp tracking, cooldowns) are intentionally left out
  // and reset to safe defaults on restore — a reloaded AI simply re-plans.
  serialize() {
    return {
      house: this.p.house,
      level: this.level,
      personality: this.personality,
      buildIx: this.buildIx,
      waveT: this.waveT,
      waveSize: this.waveSize,
      trainIx: this.trainIx,
      wallsBuilt: this.wallsBuilt,
      attackers: [...this.attackers],
    };
  }

  restore(s) {
    if (s.personality) this.applyPersonality(s.personality);
    this.buildIx = s.buildIx || 0;
    this.waveT = s.waveT != null ? s.waveT : this.d.firstWave;
    this.waveSize = s.waveSize || 3;
    this.trainIx = s.trainIx || 0;
    this.wallsBuilt = s.wallsBuilt || 0;
    this.attackers = new Set(s.attackers || []);
    // transient combat/economy state: safe defaults, re-planned on next tick
    this.wave = null;
    this.thinkT = 0;
    this.econT = 0;
    this.harassCd = 0;
    this.needRefinery = false;
    this.refineryAnchor = null;
    this.depotCd = 20;
    this.harvHp = new Map();
  }

  base() {
    return this.game.buildings.find((b) => !b.dead && b.owner === this.p && b.key === 'conyard');
  }

  // average footprint centre of all my structures (falls back to any unit)
  baseCentroid() {
    let sx = 0, sy = 0, n = 0;
    for (const b of this.game.buildings) {
      if (b.dead || b.owner !== this.p) continue;
      const [cx, cy] = b.centre();
      sx += cx; sy += cy; n++;
    }
    if (n === 0) {
      for (const u of this.game.units) {
        if (u.dead || u.owner !== this.p) continue;
        sx += u.x; sy += u.y; n++;
      }
    }
    return n ? [sx / n, sy / n] : [this.game.map.size / 2, this.game.map.size / 2];
  }

  tick(dt) {
    this.thinkT -= dt;
    this.waveT -= dt;
    if (this.harassCd > 0) this.harassCd -= dt;
    if (this.thinkT > 0) return;
    const step = this.d.think;
    this.thinkT = step;

    const g = this.game;
    if (!g.buildings.some((b) => !b.dead && b.owner === this.p)) return; // eliminated

    this.econT -= step;
    if (this.econT <= 0) { this.econT = 6; this.scanEconomy(); }

    this.manageConstruction();
    this.placeReadyBuilding();
    this.manageTraining();
    this.manageMCV();
    this.manageHarvesters();
    this.manageRepair();
    this.manageHarvesterDefense();
    this.manageDefense();
    this.manageDepotCapture(step);
    this.manageWave(step);
    if (this.waveT <= 0 && !this.wave) this.launchWave();
  }

  // ----------------------------------------------------------- construction --

  manageConstruction() {
    const g = this.game, p = this.p;
    if (p.prod.building || p.readyBuilding) return;
    if (!this.base()) return; // no conyard: nothing can be produced here

    // emergency: power first
    if (p.lowPower() && g.canProduce(p, 'building', 'power') && p.credits > 350) {
      g.startProduction(p, 'building', 'power');
      return;
    }
    // rebuild critical losses first
    const count = (k) => g.buildings.filter((b) => !b.dead && b.owner === p && b.key === k).length;
    for (const key of ['refinery', 'barracks', 'factory']) {
      if (this.builtBefore(key) && count(key) === 0 && g.canProduce(p, 'building', key)
          && p.credits >= BUILDINGS[key].cost * this.d.save) {
        g.startProduction(p, 'building', key);
        return;
      }
    }
    // expand economy: a second refinery toward a fresh field
    if (this.needRefinery && count('refinery') < 2 && g.canProduce(p, 'building', 'refinery')
        && p.credits >= BUILDINGS.refinery.cost * this.d.save) {
      g.startProduction(p, 'building', 'refinery');
      return;
    }
    // follow the build order
    while (this.buildIx < this.buildOrder.length) {
      const key = this.buildOrder[this.buildIx];
      if (count(key) >= this.buildOrder.slice(0, this.buildIx + 1).filter((k) => k === key).length) {
        this.buildIx++;
        continue;
      }
      if (!g.canProduce(p, 'building', key)) return; // wait for tech
      if (p.credits < BUILDINGS[key].cost * this.d.save) return; // save up
      g.startProduction(p, 'building', key);
      this.buildIx++;
      return;
    }
    // endgame: extra defences (weighted by personality) or a wall run for turtles
    if (p.credits > 2500) {
      const pool = this.personality === 'turtle'
        ? ['tesla', 'flametower', 'guard', 'wall']
        : (this.personality === 'rusher' ? ['guard'] : ['tesla', 'guard']);
      let extra = pool[Math.floor(this.game.rng() * pool.length)];
      if (extra === 'wall') {
        if (this.wallsBuilt > 24) extra = 'guard';
        else this.wallsBuilt++;
      }
      if (g.canProduce(p, 'building', extra)) g.startProduction(p, 'building', extra);
    }
  }

  builtBefore(key) {
    return this.buildOrder.slice(0, this.buildIx).includes(key);
  }

  placeReadyBuilding() {
    const g = this.game, p = this.p;
    if (!p.readyBuilding) return;
    const key = p.readyBuilding.key;
    const def = BUILDINGS[key];
    const anchor = this.base() || g.buildings.find((b) => !b.dead && b.owner === p);
    if (!anchor) return;
    const [ax, ay] = anchor.centre();
    // where to bias placement: defences/walls face the approach (map centre),
    // an expansion refinery reaches toward the richest remaining field
    let bias = null;
    if (key === 'guard' || key === 'tesla' || key === 'flametower' || key === 'wall') {
      bias = [g.map.size / 2, g.map.size / 2];
    } else if (key === 'refinery' && this.refineryAnchor) {
      bias = this.refineryAnchor;
    }
    let best = null, bestD = 1e9;
    for (let r = 2; r < 24; r++) {
      for (let attempt = 0; attempt < 14; attempt++) {
        const ox = Math.round((g.rng() - 0.5) * 2 * r);
        const oy = Math.round((g.rng() - 0.5) * 2 * r);
        const x = Math.round(ax + ox - def.w / 2), y = Math.round(ay + oy - def.h / 2);
        if (!g.placementValid(p, key, x, y)) continue;
        if (!bias) { g.placeBuilding(p, x, y); return; }
        const d = Math.hypot(x + def.w / 2 - bias[0], y + def.h / 2 - bias[1]);
        if (d < bestD) { bestD = d; best = [x, y]; }
      }
    }
    if (best) g.placeBuilding(p, best[0], best[1]);
  }

  // ---------------------------------------------------------------- training --

  manageTraining() {
    const g = this.game, p = this.p;
    if (p.prod.unit) return;

    // construction-yard recovery: with the conyard gone but a factory alive,
    // save for an MCV and redeploy a fresh base
    const conyardAlive = !!this.base();
    if (!conyardAlive) {
      const haveMcv = g.units.some((u) => !u.dead && u.owner === p && u.key === 'mcv');
      if (!haveMcv && g.canProduce(p, 'unit', 'mcv') && p.credits >= UNITS.mcv.cost) {
        g.startProduction(p, 'unit', 'mcv');
      }
      return; // don't pour credits into an army while headless
    }

    const myUnits = g.units.filter((u) => !u.dead && u.owner === p);
    const harvesters = myUnits.filter((u) => u.def.harvester).length;
    const refineries = g.buildings.filter((b) => !b.dead && b.owner === p && b.key === 'refinery').length;

    // keep the ore trucks stocked: 2 per refinery on normal/hard, 1 on easy
    const perRef = this.level === 'easy' ? 1 : 2;
    const wantHarvesters = Math.min(refineries * perRef, 6);
    if (refineries > 0 && harvesters < wantHarvesters &&
        g.canProduce(p, 'unit', 'harvester') && p.credits > UNITS.harvester.cost * 0.7) {
      g.startProduction(p, 'unit', 'harvester');
      return;
    }
    const army = myUnits.filter((u) => u.def.weapon).length;
    if (army >= this.d.armyCap) return; // cap the horde
    if (p.credits < 500) return;
    // walk the pattern; skip entries we can't build yet
    for (let tries = 0; tries < this.trainPattern.length; tries++) {
      const key = this.trainPattern[this.trainIx % this.trainPattern.length];
      this.trainIx++;
      if (key === 'behemoth' && this.level !== 'hard') continue; // super-heavy is a hard-only luxury
      if (g.canProduce(p, 'unit', key) && p.credits >= UNITS[key].cost) {
        g.startProduction(p, 'unit', key);
        return;
      }
    }
  }

  // drive a freshly built MCV to base centre and redeploy it as a conyard
  manageMCV() {
    const g = this.game, p = this.p;
    if (this.base()) return; // conyard already up
    const mcv = g.units.find((u) => !u.dead && u.owner === p && u.key === 'mcv');
    if (!mcv || mcv.order.type === 'deploy') return;
    const [cx, cy] = this.baseCentroid();
    const d = Math.hypot(mcv.x - cx, mcv.y - cy);
    if (d > 4) {
      if (mcv.order.type === 'idle') {
        const spot = nearestFree(g.map, Math.round(cx), Math.round(cy), mcv) || [Math.round(cx), Math.round(cy)];
        g.orderMove(mcv, spot[0], spot[1]);
      }
    } else if (!mcv.moving) {
      g.orderDeploy(mcv);
    }
  }

  manageHarvesters() {
    for (const u of this.game.units) {
      if (u.dead || u.owner !== this.p || !u.def.harvester) continue;
      if (u.order.type === 'idle') this.game.orderHarvest(u);
    }
  }

  // ------------------------------------------------------------------ upkeep --

  // periodic (throttled) look at the home ore field and, if it's drying up,
  // flag a second refinery and remember the richest distant field to reach for
  scanEconomy() {
    const g = this.game, p = this.p, m = g.map;
    const refineries = g.buildings.filter((b) => !b.dead && b.owner === p && b.key === 'refinery');
    if (refineries.length === 0) { this.needRefinery = false; return; }
    if (refineries.length >= 2) { this.needRefinery = false; return; }

    const ref = refineries[0];
    const [rx, ry] = ref.centre();
    const R = 12;
    let local = 0;
    for (let y = Math.max(0, (ry | 0) - R); y <= Math.min(m.size - 1, (ry | 0) + R); y++) {
      for (let x = Math.max(0, (rx | 0) - R); x <= Math.min(m.size - 1, (rx | 0) + R); x++) {
        local += m.ore[m.idx(x, y)];
      }
    }
    if (local >= 1500) { this.needRefinery = false; return; }

    // home field is thin: find the richest cell well away from current refineries
    let best = null, bestV = 0;
    for (let y = 0; y < m.size; y++) {
      for (let x = 0; x < m.size; x++) {
        const v = m.ore[m.idx(x, y)];
        if (v <= 0) continue;
        let far = true;
        for (const rf of refineries) {
          const [fx, fy] = rf.centre();
          if (Math.hypot(x - fx, y - fy) < 10) { far = false; break; }
        }
        if (!far) continue;
        const score = v * (m.gem[m.idx(x, y)] ? 1.5 : 1);
        if (score > bestV) { bestV = score; best = [x, y]; }
      }
    }
    this.needRefinery = !!best;
    this.refineryAnchor = best;
  }

  // toggle repair on important damaged structures when we can afford it
  manageRepair() {
    const g = this.game, p = this.p;
    for (const b of g.buildings) {
      if (b.dead || b.owner !== p || !IMPORTANT_BUILDINGS.has(b.key)) continue;
      if (!b.repairing && p.credits > 600 && b.hp < b.maxHp * 0.85) b.repairing = true;
      else if (b.repairing && (b.hp >= b.maxHp || p.credits < 250)) b.repairing = false;
    }
  }

  // rush a couple of nearby combat units to a harvester that's taking fire
  manageHarvesterDefense() {
    if (this.level === 'easy') return;
    if (this.harassCd > 0) return;
    const g = this.game, p = this.p;
    let hurt = null;
    for (const u of g.units) {
      if (u.dead || u.owner !== p || !u.def.harvester) continue;
      const prev = this.harvHp.get(u.id);
      this.harvHp.set(u.id, u.hp);
      if (prev != null && u.hp < prev - 1 && u.hp < u.maxHp && !hurt) hurt = u;
    }
    if (!hurt) return;
    const defenders = [];
    for (const c of g.units) {
      if (c.dead || c.owner !== p || !c.def.weapon || this.attackers.has(c.id)) continue;
      if (c.def.harvester) continue;
      defenders.push(c);
    }
    defenders.sort((a, b) => Math.hypot(a.x - hurt.x, a.y - hurt.y) - Math.hypot(b.x - hurt.x, b.y - hurt.y));
    let sent = 0;
    for (const c of defenders) {
      if (sent >= 3) break;
      if (Math.hypot(c.x - hurt.x, c.y - hurt.y) > 40) break;
      g.orderAttackMove(c, Math.round(hurt.x), Math.round(hurt.y));
      sent++;
    }
    if (sent > 0) this.harassCd = 5;
  }

  manageDefense() {
    const g = this.game, p = this.p;
    const anchor = this.base() || g.buildings.find((b) => !b.dead && b.owner === p);
    if (!anchor) return;
    const [ax, ay] = anchor.centre();
    // intruder near base? pull idle army onto it
    let intruder = null;
    for (const e of g.units) {
      if (e.dead || e.owner === p || !e.def.weapon) continue;
      if (Math.hypot(e.x - ax, e.y - ay) < 16) { intruder = e; break; }
    }
    if (!intruder) return;
    for (const u of g.units) {
      if (u.dead || u.owner !== p || !u.def.weapon) continue;
      if (this.attackers.has(u.id)) continue;   // wave units keep pushing
      if (u.order.type === 'idle' || u.order.type === 'move') g.orderAttack(u, intruder);
    }
  }

  // opportunistic supply-depot grab: normal/hard occasionally train an
  // engineer and send it to seize a nearby capturable depot. Wiring only —
  // the AI doesn't fight over them cleverly, it just takes free ones.
  manageDepotCapture(step) {
    if (this.level === 'easy') return;
    this.depotCd -= step;
    const g = this.game, p = this.p;
    const [bx, by] = this.baseCentroid();
    // nearest depot not already ours, preferring close ones
    let depot = null, bd = 1e9;
    for (const b of g.buildings) {
      if (b.dead || !b.def.isDepot || b.owner === p) continue;
      const [dx, dy] = b.centre();
      const d = Math.hypot(dx - bx, dy - by);
      if (d < 55 && d < bd) { bd = d; depot = b; }
    }
    if (!depot) return;
    // send an idle engineer if we have one
    const eng = g.units.find((u) => !u.dead && u.owner === p && u.key === 'engineer' && u.order.type === 'idle');
    if (eng) { g.orderCapture(eng, depot); return; }
    // otherwise train one, throttled, and only if none is already in play
    if (this.depotCd > 0 || p.prod.unit) return;
    if (!g.canProduce(p, 'unit', 'engineer') || p.credits < UNITS.engineer.cost + 400) return;
    if (g.units.some((u) => !u.dead && u.owner === p && u.key === 'engineer')) return;
    g.startProduction(p, 'unit', 'engineer');
    this.depotCd = 60;
  }

  // -------------------------------------------------------------- wave logic --

  launchWave() {
    const g = this.game, p = this.p;
    const idle = g.units.filter((u) =>
      !u.dead && u.owner === p && u.def.weapon && !this.attackers.has(u.id) &&
      (u.order.type === 'idle' || u.order.type === 'move'));
    // don't strip the base bare: attack only once there's a real squad
    if (idle.length < this.waveSize + 2) { this.waveT = 8; return; } // retry soon

    const objective = this.pickObjective();
    if (!objective) { this.waveT = 8; return; }

    this.waveT = this.d.waveMin + g.rng() * (this.d.waveMax - this.d.waveMin);
    this.waveSize = Math.min(this.d.waveCap, this.waveSize + 1);

    const [tx, ty] = objective.isUnit ? [objective.cellX, objective.cellY] : objective.centre();
    // staging cell ~10 cells back toward our base, off the target's doorstep
    const [bx, by] = this.baseCentroid();
    const dx = bx - tx, dy = by - ty;
    const len = Math.hypot(dx, dy) || 1;
    let sx = Math.round(tx + (dx / len) * 10);
    let sy = Math.round(ty + (dy / len) * 10);
    sx = Math.max(1, Math.min(g.map.size - 2, sx));
    sy = Math.max(1, Math.min(g.map.size - 2, sy));
    const staged = nearestFree(g.map, sx, sy, null) || [sx, sy];

    const squad = idle.slice(0, this.waveSize + 2);
    const members = new Set();
    for (const u of squad) {
      members.add(u.id);
      this.attackers.add(u.id);
      g.orderAttackMove(u, staged[0], staged[1]);
    }
    this.wave = {
      members, phase: 'staging', objective,
      sx: staged[0], sy: staged[1], tx: Math.round(tx), ty: Math.round(ty),
      timer: 0, n0: members.size,
    };
  }

  // update the active wave through stage -> push -> retreat
  manageWave(step) {
    if (!this.wave) { if (this.attackers.size) this.attackers.clear(); return; }
    const g = this.game, p = this.p, w = this.wave;

    // prune casualties
    const alive = [];
    for (const u of g.units) {
      if (u.dead || u.owner !== p) continue;
      if (w.members.has(u.id)) alive.push(u);
    }
    w.members = new Set(alive.map((u) => u.id));
    this.attackers = new Set(w.members);
    if (alive.length === 0) { this.wave = null; return; }

    // objective gone: retarget or wind the wave down
    if (!w.objective || w.objective.dead) {
      const obj = this.pickObjective();
      if (!obj) { this.endWave(alive, true); return; }
      w.objective = obj;
      const [ox, oy] = obj.isUnit ? [obj.cellX, obj.cellY] : obj.centre();
      w.tx = Math.round(ox); w.ty = Math.round(oy);
    }

    if (w.phase === 'staging') {
      w.timer += step;
      let arrived = 0;
      for (const u of alive) if (Math.hypot(u.x - w.sx, u.y - w.sy) <= 3.5) arrived++;
      const ready = arrived >= Math.ceil(w.n0 * 0.7) || arrived >= Math.ceil(alive.length * 0.9);
      if (ready || w.timer >= 20) {
        w.phase = 'push';
        for (const u of alive) g.orderAttackMove(u, w.tx, w.ty);
      }
      return;
    }

    // push phase
    if (alive.length < Math.max(1, Math.ceil(w.n0 * 0.4))) {
      // broke the back of the wave: fall back and rejoin defence
      this.endWave(alive, true);
      return;
    }
    // keep the objective fresh (harvesters wander) and re-order stragglers
    const obj = w.objective;
    const [ox, oy] = obj.isUnit ? [obj.cellX, obj.cellY] : obj.centre();
    w.tx = Math.round(ox); w.ty = Math.round(oy);
    for (const u of alive) {
      if (u.order.type === 'idle') g.orderAttackMove(u, w.tx, w.ty);
    }
  }

  // send survivors home (retreat) and release them back to the defence pool
  endWave(alive, retreat) {
    const g = this.game;
    if (retreat && alive) {
      const [bx, by] = this.baseCentroid();
      const spot = nearestFree(g.map, Math.round(bx), Math.round(by), null) || [Math.round(bx), Math.round(by)];
      for (const u of alive) {
        if (!u.dead) g.orderMove(u, spot[0], spot[1]);
      }
    }
    this.attackers.clear();
    this.wave = null;
  }

  // primary objective: hit the enemy economy/production, not a lone tower.
  // en-route defences get engaged automatically by attack-move target scans,
  // which realises the "clear defences blocking the approach first" intent.
  pickObjective() {
    const g = this.game, p = this.p;
    const targets = [];
    for (const b of g.buildings) if (!b.dead && b.owner !== p && !b.def.isWall) targets.push(b);
    for (const u of g.units) if (!u.dead && u.owner !== p) targets.push(u);
    if (targets.length === 0) return null;
    targets.sort((a, b) => this.targetScore(b) - this.targetScore(a));
    return targets[0];
  }

  targetScore(t) {
    if (t.isBuilding) {
      if (t.key === 'refinery') return 6;
      if (t.key === 'factory' || t.key === 'barracks') return 5;
      if (t.key === 'conyard') return 4.5;
      if (t.key === 'techcenter') return 4;
      if (t.key === 'power') return 3.5;
      if (t.def.weapon) return 3;      // static defence: dealt with en route
      return 2;
    }
    return t.def.harvester ? 5.5 : 1;
  }
}
