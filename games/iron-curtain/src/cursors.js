// Mouse cursors: three 16x16 crosshairs baked to data-URIs at boot (hot spot
// at the centre, 8,8), plus the hover test that decides which one the viewport
// wears. Kept subtle: thin strokes in the retro palette's muted colours.

import { makeCanvas } from './palette.js';

function makeCursor(draw) {
  const [c, g] = makeCanvas(16, 16);
  draw(g);
  return `url(${c.toDataURL('image/png')}) 8 8, crosshair`;
}

const CURSORS = {
  default: 'crosshair',
  move: makeCursor((g) => {
    g.fillStyle = '#7fe08a';
    g.fillRect(7, 2, 2, 12); g.fillRect(2, 7, 12, 2);
    g.fillStyle = '#0a0a0a';
    g.fillRect(7, 1, 2, 1); g.fillRect(7, 14, 2, 1);
    g.fillRect(1, 7, 1, 2); g.fillRect(14, 7, 1, 2);
  }),
  attack: makeCursor((g) => {
    g.strokeStyle = '#e04a3a'; g.lineWidth = 2;
    g.beginPath(); g.arc(8, 8, 5, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#e04a3a';
    g.fillRect(7, 0, 2, 4); g.fillRect(7, 12, 2, 4);
    g.fillRect(0, 7, 4, 2); g.fillRect(12, 7, 4, 2);
    g.fillStyle = '#ffdd55'; g.fillRect(7, 7, 2, 2);
  }),
  noentry: makeCursor((g) => {
    g.strokeStyle = '#e04a3a'; g.lineWidth = 2;
    g.beginPath(); g.arc(8, 8, 6, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(4, 4); g.lineTo(12, 12); g.stroke();
  }),
};

export class Cursors {
  constructor(viewEl) {
    this.viewEl = viewEl;
    this.t = 0;
  }

  // hovered world cell (fractional) or null when the pointer is off-viewport
  hoveredCell(input) {
    if (!input || !input.mouse.seen) return null;
    const r = this.viewEl.getBoundingClientRect();
    const mx = input.mouse.x, my = input.mouse.y;
    if (mx < r.left || mx > r.right || my < r.top || my > r.bottom) return null;
    return input.screenToWorld(mx - r.left, my - r.top, r);
  }

  // is there a visible enemy under (wx,wy)? used to pick the attack cursor
  enemyAtCursor(game, wx, wy) {
    for (const u of game.units) {
      if (u.dead || u.house === 'player') continue;
      if (Math.hypot(u.x - wx, u.y - wy) < 0.8 && game.isVisibleToPlayer(u)) return true;
    }
    const cx = Math.floor(wx), cy = Math.floor(wy);
    for (const b of game.buildings) {
      if (b.dead || b.house === 'player') continue;
      if (b.containsCell(cx, cy) && (b.seen || game.isVisibleToPlayer(b))) return true;
    }
    return false;
  }

  update(dt, { game, ui, input }) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.06;
    // sell / repair modes own the cursor via ui.setMode — leave them be
    if (ui.mode === 'sell' || ui.mode === 'repair') return;
    const p = game.players.player;
    const hv = this.hoveredCell(input);
    let cur = CURSORS.default;
    if (p.readyBuilding) {
      if (hv) {
        const cx = Math.floor(hv[0]), cy = Math.floor(hv[1]);
        if (!game.map.inBounds(cx, cy) || !game.explored[game.map.idx(cx, cy)]) cur = CURSORS.noentry;
      }
    } else if (hv) {
      const units = input.selectedUnits();
      if (units.length) {
        const hasWeapon = units.some((u) => u.def.weapon);
        cur = (hasWeapon && this.enemyAtCursor(game, hv[0], hv[1])) ? CURSORS.attack : CURSORS.move;
      }
    }
    if (this.viewEl.style.cursor !== cur) this.viewEl.style.cursor = cur;
  }
}
