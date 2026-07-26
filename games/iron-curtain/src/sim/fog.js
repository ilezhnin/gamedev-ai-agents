// Fog of war for the human player: one visible/explored pair of byte grids,
// recomputed whenever something that owns sight moves, dies or changes hands.
// `visible` is rebuilt from scratch each time; `explored` only ever grows.

export function recomputeVision(game) {
  game.visionDirty = false;
  const m = game.map;
  game.visible.fill(0);
  const reveal = (cx, cy, r) => {
    const r2 = r * r;
    for (let y = Math.max(0, cy - r); y <= Math.min(m.size - 1, cy + r); y++) {
      for (let x = Math.max(0, cx - r); x <= Math.min(m.size - 1, cx + r); x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= r2) {
          const i = m.idx(x, y);
          game.visible[i] = 1;
          game.explored[i] = 1;
        }
      }
    }
  };
  for (const u of game.units) {
    if (u.dead || u.boarded || !u.owner.isHuman) continue;
    reveal(u.cellX, u.cellY, u.def.sight);
  }
  for (const b of game.buildings) {
    if (b.dead || !b.owner.isHuman) continue;
    const [cx, cy] = b.centre();
    reveal(Math.floor(cx), Math.floor(cy), b.def.sight);
  }
  // recon-sweep power: temporary reveal circles that pierce the fog
  for (const s of game.reconSweeps) reveal(s.x, s.y, s.r);
}

export function isVisibleToPlayer(game, e) {
  if (e.isBuilding) {
    for (let y = e.cy; y < e.cy + e.def.h; y++)
      for (let x = e.cx; x < e.cx + e.def.w; x++)
        if (game.map.inBounds(x, y) && game.visible[game.map.idx(x, y)]) return true;
    return false;
  }
  const i = game.map.idx(e.cellX, e.cellY);
  return !!game.visible[i];
}
