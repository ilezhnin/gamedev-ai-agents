// Grid movement: units step cell to cell, reserving the destination cell up
// front so two units never converge on the same tile. Every order falls
// through to tickMovement, which is what lets a unit shoot while driving.

import { canCrushInto, crushUnit } from './combat.js';
import { setPath } from './orders.js';
import { angleDiff, approachAngle } from './angles.js';

export function tickMovement(game, u, dt) {
  if (!u.moving) {
    if (u.path.length === 0) return;
    const [nx, ny] = u.path[0];
    // tracked vehicles flatten enemy infantry in their way
    if (canCrushInto(game, u, nx, ny)) {
      crushUnit(game, game.map.occupant[game.map.idx(nx, ny)], u);
    }
    if (!game.map.isFree(nx, ny, u)) {
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
        setPath(game, u, goal[0], goal[1]);
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
    game.map.occupant[game.map.idx(nx, ny)] = u;   // reserve destination
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
      game.map.occupant[game.map.idx(u.cellX, u.cellY)] = null;
      u.cellX = nx; u.cellY = ny;
      u.x = nx; u.y = ny;
      u.moving = false;
      u.reserved = null;
      game.map.occupant[game.map.idx(nx, ny)] = u;
      if (u.owner.isHuman) game.visionDirty = true;
    } else {
      u.x = u.fromX + (nx - u.fromX) * u.moveT;
      u.y = u.fromY + (ny - u.fromY) * u.moveT;
    }
  }
}
