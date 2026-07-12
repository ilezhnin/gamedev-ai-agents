// Skirmish opponent: follows a build order, keeps power positive, replaces
// lost harvesters, trains a mixed force and throws attack waves that grow
// over time. Deliberately fallible — it plays the same game the human does.

import { BUILDINGS, UNITS } from './rules.js';
import { nearestFree } from './pathfind.js';

const BUILD_ORDER = ['power', 'refinery', 'barracks', 'power', 'factory', 'guard', 'radar', 'guard', 'power', 'tesla', 'silo'];

// difficulty knobs — the AI never cheats on prices or income, it just
// thinks faster/slower, saves harder and fields bigger or smaller waves
export const AI_LEVELS = {
  easy:   { think: 2.2, firstWave: 140, waveMin: 90, waveMax: 130, armyCap: 10, waveCap: 6,  save: 0.8 },
  normal: { think: 1.1, firstWave: 95,  waveMin: 65, waveMax: 90,  armyCap: 18, waveCap: 10, save: 0.55 },
  hard:   { think: 0.7, firstWave: 70,  waveMin: 45, waveMax: 70,  armyCap: 26, waveCap: 14, save: 0.45 },
};

export class AI {
  constructor(game, player, level = 'normal') {
    this.game = game;
    this.p = player;
    this.level = level;
    this.d = AI_LEVELS[level] || AI_LEVELS.normal;
    this.buildIx = 0;
    this.thinkT = 0;
    this.waveT = this.d.firstWave;
    this.waveSize = 3;
    this.attackers = new Set();
    this.trainPattern = ['rifle', 'rifle', 'lightTank', 'rocket', 'heavyTank', 'rifle', 'lightTank'];
    this.trainIx = 0;
  }

  base() {
    return this.game.buildings.find((b) => !b.dead && b.owner === this.p && b.key === 'conyard');
  }

  tick(dt) {
    this.thinkT -= dt;
    this.waveT -= dt;
    if (this.thinkT > 0) return;
    this.thinkT = this.d.think;

    const g = this.game;
    if (!g.buildings.some((b) => !b.dead && b.owner === this.p)) return; // eliminated

    this.manageConstruction();
    this.placeReadyBuilding();
    this.manageTraining();
    this.manageHarvesters();
    this.manageDefense();
    if (this.waveT <= 0) this.launchWave();
  }

  manageConstruction() {
    const g = this.game, p = this.p;
    if (p.prod.building || p.readyBuilding) return;

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
    // follow the build order
    while (this.buildIx < BUILD_ORDER.length) {
      const key = BUILD_ORDER[this.buildIx];
      if (count(key) >= BUILD_ORDER.slice(0, this.buildIx + 1).filter((k) => k === key).length) {
        this.buildIx++;
        continue;
      }
      if (!g.canProduce(p, 'building', key)) return; // wait for tech
      if (p.credits < BUILDINGS[key].cost * this.d.save) return; // save up
      g.startProduction(p, 'building', key);
      this.buildIx++;
      return;
    }
    // endgame: extra teslas + guard towers
    if (p.credits > 2500) {
      const extra = this.game.rng() < 0.5 ? 'tesla' : 'guard';
      if (g.canProduce(p, 'building', extra)) g.startProduction(p, 'building', extra);
    }
  }

  builtBefore(key) {
    return BUILD_ORDER.slice(0, this.buildIx).includes(key);
  }

  placeReadyBuilding() {
    const g = this.game, p = this.p;
    if (!p.readyBuilding) return;
    const key = p.readyBuilding.key;
    const def = BUILDINGS[key];
    const anchor = this.base() || g.buildings.find((b) => !b.dead && b.owner === p);
    if (!anchor) return;
    const [ax, ay] = anchor.centre();
    // defensive structures go toward the map centre (where the enemy comes from)
    const toward = key === 'guard' || key === 'tesla';
    const cx = g.map.size / 2, cy = g.map.size / 2;
    const dirx = Math.sign(cx - ax) || 1, diry = Math.sign(cy - ay) || 1;
    // spiral search for a legal spot
    for (let r = 2; r < 22; r++) {
      for (let attempt = 0; attempt < 14; attempt++) {
        let ox = Math.round((g.rng() - 0.5) * 2 * r);
        let oy = Math.round((g.rng() - 0.5) * 2 * r);
        if (toward) { ox = Math.abs(ox) * dirx; oy = Math.abs(oy) * diry; }
        const x = Math.round(ax + ox - def.w / 2), y = Math.round(ay + oy - def.h / 2);
        if (g.placementValid(p, key, x, y)) {
          g.placeBuilding(p, x, y);
          return;
        }
      }
    }
  }

  manageTraining() {
    const g = this.game, p = this.p;
    if (p.prod.unit) return;
    const myUnits = g.units.filter((u) => !u.dead && u.owner === p);
    const harvesters = myUnits.filter((u) => u.def.harvester).length;
    const refineries = g.buildings.filter((b) => !b.dead && b.owner === p && b.key === 'refinery').length;

    if (refineries > 0 && harvesters < Math.min(2, refineries + 1) &&
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
      if (g.canProduce(p, 'unit', key) && p.credits >= UNITS[key].cost) {
        g.startProduction(p, 'unit', key);
        return;
      }
    }
  }

  manageHarvesters() {
    for (const u of this.game.units) {
      if (u.dead || u.owner !== this.p || !u.def.harvester) continue;
      if (u.order.type === 'idle') this.game.orderHarvest(u);
    }
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

  launchWave() {
    const g = this.game, p = this.p;
    this.waveT = this.d.waveMin + g.rng() * (this.d.waveMax - this.d.waveMin);
    const idle = g.units.filter((u) =>
      !u.dead && u.owner === p && u.def.weapon &&
      (u.order.type === 'idle' || (u.order.type === 'move')));
    // don't strip the base bare: attack only once there's a real squad
    if (idle.length < this.waveSize + 2) return;
    this.waveSize = Math.min(this.d.waveCap, this.waveSize + 1);
    // target: prefer player harvesters/refinery, else any building, else units
    const targets = [];
    for (const b of g.buildings) if (!b.dead && b.owner !== p) targets.push(b);
    for (const u of g.units) if (!u.dead && u.owner !== p) targets.push(u);
    if (targets.length === 0) return;
    targets.sort((a, b) => this.targetScore(b) - this.targetScore(a));
    const t = targets[0];
    const [tx, ty] = t.isUnit ? [t.cellX, t.cellY] : t.centre();
    const squad = idle.slice(0, this.waveSize + 2);
    for (const u of squad) {
      this.attackers.add(u.id);
      g.orderAttackMove(u, Math.round(tx), Math.round(ty));
    }
  }

  targetScore(t) {
    if (t.isBuilding) {
      if (t.key === 'refinery') return 5;
      if (t.key === 'conyard') return 4;
      if (t.key === 'power') return 3;
      return 2;
    }
    return t.def.harvester ? 4.5 : 1;
  }
}
