// A* over the tile grid, 8-directional with corner-cut prevention.
// Units treat other stationary units as soft obstacles (cost bump) so
// traffic flows around parked vehicles instead of failing outright.

const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, 1.42], [1, -1, 1.42], [-1, 1, 1.42], [-1, -1, 1.42],
];

export function findPath(map, sx, sy, tx, ty, unit, maxExpand = 2600) {
  const s = map.size;
  if (!map.inBounds(tx, ty)) return null;

  // if the destination is hard-blocked, walk to the nearest reachable ring cell
  if (!map.isPassableTerrain(tx, ty) || map.blocked[map.idx(tx, ty)]) {
    const alt = nearestFree(map, tx, ty, unit);
    if (!alt) return null;
    tx = alt[0]; ty = alt[1];
  }

  const open = new MinHeap();
  const gScore = new Float32Array(s * s).fill(Infinity);
  const came = new Int32Array(s * s).fill(-1);
  const closed = new Uint8Array(s * s);
  const start = map.idx(sx, sy), goal = map.idx(tx, ty);
  gScore[start] = 0;
  open.push(start, Math.hypot(tx - sx, ty - sy));

  let expanded = 0;
  let bestIdx = start, bestH = Math.hypot(tx - sx, ty - sy);

  while (open.size > 0 && expanded < maxExpand) {
    const cur = open.pop();
    if (cur === goal) return reconstruct(map, came, cur);
    if (closed[cur]) continue;
    closed[cur] = 1;
    expanded++;

    const cx = cur % s, cy = (cur / s) | 0;
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!map.inBounds(nx, ny)) continue;
      if (!map.isPassableTerrain(nx, ny)) continue;
      const ni = map.idx(nx, ny);
      if (map.blocked[ni]) continue;
      // corner cutting: both orthogonal neighbours must be open for diagonals
      if (dx !== 0 && dy !== 0) {
        if (!map.isPassableTerrain(cx + dx, cy) || map.blocked[map.idx(cx + dx, cy)]) continue;
        if (!map.isPassableTerrain(cx, cy + dy) || map.blocked[map.idx(cx, cy + dy)]) continue;
      }
      let stepCost = cost;
      const occ = map.occupant[ni];
      if (occ && occ !== unit) {
        const crushable = unit && unit.def && unit.def.crusher &&
          occ.isUnit && occ.def.kind === 'infantry' && occ.owner !== unit.owner;
        if (crushable) stepCost += 0.4;            // roll right over them
        else stepCost += occ.moving ? 1.5 : 6;     // squeeze around traffic
      }
      const ng = gScore[cur] + stepCost;
      if (ng < gScore[ni]) {
        gScore[ni] = ng;
        came[ni] = cur;
        const h = Math.hypot(tx - nx, ty - ny);
        open.push(ni, ng + h);
        if (h < bestH) { bestH = h; bestIdx = ni; }
      }
    }
  }
  // goal unreachable: path to the closest point we found
  if (bestIdx !== start) return reconstruct(map, came, bestIdx);
  return null;
}

export function nearestFree(map, tx, ty, unit, maxR = 10) {
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = tx + dx, y = ty + dy;
        if (map.isFree(x, y, unit)) return [x, y];
      }
    }
  }
  return null;
}

function reconstruct(map, came, cur) {
  const s = map.size;
  const path = [];
  while (cur >= 0) {
    path.push([cur % s, (cur / s) | 0]);
    cur = came[cur];
  }
  path.reverse();
  path.shift(); // drop the start cell
  return path;
}

class MinHeap {
  constructor() { this.keys = []; this.pri = []; }
  get size() { return this.keys.length; }
  push(k, p) {
    this.keys.push(k); this.pri.push(p);
    let i = this.keys.length - 1;
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (this.pri[par] <= this.pri[i]) break;
      this.swap(i, par); i = par;
    }
  }
  pop() {
    const top = this.keys[0];
    const lk = this.keys.pop(), lp = this.pri.pop();
    if (this.keys.length > 0) {
      this.keys[0] = lk; this.pri[0] = lp;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < this.keys.length && this.pri[l] < this.pri[m]) m = l;
        if (r < this.keys.length && this.pri[r] < this.pri[m]) m = r;
        if (m === i) break;
        this.swap(i, m); i = m;
      }
    }
    return top;
  }
  swap(a, b) {
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
    [this.pri[a], this.pri[b]] = [this.pri[b], this.pri[a]];
  }
}
