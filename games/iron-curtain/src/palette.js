// SNES-flavoured master palette + tiny pixel-drawing toolkit.
// Every sprite in the game is painted through these helpers onto small
// canvases, then uploaded to THREE textures with nearest-neighbour filtering.

export const PAL = {
  // terrain
  grass1:'#4e7a34', grass2:'#46702e', grass3:'#568540', grassHi:'#679a4b',
  dirt1:'#8a6f42', dirt2:'#7c6339', dirt3:'#98804f',
  sand1:'#c2a366', sand2:'#b3945a',
  water1:'#1e4e7c', water2:'#265d90', water3:'#3a76ac', waterHi:'#5f9cc9',
  rock1:'#6f6a62', rock2:'#5a564f', rock3:'#87817a', rockHi:'#a09a90',
  tree1:'#2c5522', tree2:'#1f421a', tree3:'#3c6c2c', treeHi:'#4f8438',
  trunk:'#5d4426',
  ore1:'#d9a531', ore2:'#b7871f', ore3:'#f0c95e', oreHi:'#ffe9a0',
  scorch:'#20201c',
  // hard outline used across all sprites
  ink:'#14120e',
  // metals / machinery
  steel1:'#9aa1a8', steel2:'#7c848c', steel3:'#5f666e', steel4:'#464b52', steelHi:'#c4cad0',
  gun1:'#3d4147', gun2:'#2c2f34',
  tread:'#33363b', treadHi:'#4d5158',
  // camo greens for allied vehicles
  camo1:'#6d7d46', camo2:'#59683a', camo3:'#48552f', camoHi:'#87995a',
  // soviet vehicle grey-reds
  rust1:'#8c5040', rust2:'#6f3c30',
  // building shells
  wall1:'#b0a894', wall2:'#948c78', wall3:'#7a7260', wallHi:'#cdc5b0',
  roof1:'#6e7681', roof2:'#59616b', roof3:'#454c55', roofHi:'#8b939e',
  concrete:'#8f8b80', concreteD:'#6e6a60',
  // glow / fx
  fire1:'#f4ea6a', fire2:'#f2a53a', fire3:'#d64f2a', fire4:'#8c2c1c',
  zap:'#bfe8ff', zapCore:'#ffffff',
  smoke1:'#7a7a76', smoke2:'#55554f',
  shadow:'rgba(10,10,8,0.35)',
  // skin/cloth for infantry
  skin:'#d8a06a', boots:'#3a3128',
  // house colours (index 0..3 = shade dark->light), remapped per faction
  houseNone:['#5a5a5a','#787878','#9a9a9a','#c0c0c0'],
};

export const HOUSE = {
  player:['#1e3f7c','#2d5aa8','#3f78cf','#7fb0ef'],   // allied blue
  enemy: ['#7c1e1e','#a82d2d','#cf3f3f','#ef7f7f'],   // soviet red
  neutral:['#5a5f52','#767b6e','#94998b','#b8bdaf'],
};

// ---------------------------------------------------------------------------

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return [c, g];
}

export function px(g, x, y, color, w = 1, h = 1) {
  g.fillStyle = color;
  g.fillRect(x | 0, y | 0, w, h);
}

// deterministic pseudo-random for stable art / maps
export function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

// draw an ASCII pixel map. legend maps chars -> colors ('.' / ' ' skip).
export function drawMap(g, rows, legend, ox = 0, oy = 0) {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const col = legend[ch];
      if (col) px(g, ox + x, oy + y, col);
    }
  }
}

// simple ordered 2x2 dither blend of two colors over a rect
export function dither(g, x, y, w, h, colA, colB) {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++)
      px(g, x + i, y + j, ((i + j) & 1) ? colB : colA);
}

// bevelled filled rect: light on top/left, dark on bottom/right
export function bevelRect(g, x, y, w, h, mid, light, dark) {
  px(g, x, y, mid, w, h);
  px(g, x, y, light, w, 1);
  px(g, x, y, light, 1, h);
  px(g, x, y + h - 1, dark, w, 1);
  px(g, x + w - 1, y, dark, 1, h);
}

export function outlineRect(g, x, y, w, h, color) {
  px(g, x, y, color, w, 1);
  px(g, x, y + h - 1, color, w, 1);
  px(g, x, y, color, 1, h);
  px(g, x + w - 1, y, color, 1, h);
}

// rotate a source canvas around its centre into a fresh canvas (same size).
// nearest-neighbour sampling keeps the pixel-art look at any angle.
export function rotatedCopy(src, angle) {
  const w = src.width, h = src.height;
  const [dst, g] = makeCanvas(w, h);
  const sg = src.getContext('2d');
  const sdata = sg.getImageData(0, 0, w, h).data;
  const out = g.createImageData(w, h);
  const odata = out.data;
  const cx = w / 2 - 0.5, cy = h / 2 - 0.5;
  const cos = Math.cos(-angle), sin = Math.sin(-angle);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx, dy = y - cy;
      const sx = Math.round(cx + dx * cos - dy * sin);
      const sy = Math.round(cy + dx * sin + dy * cos);
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      const si = (sy * w + sx) * 4, di = (y * w + x) * 4;
      odata[di] = sdata[si]; odata[di + 1] = sdata[si + 1];
      odata[di + 2] = sdata[si + 2]; odata[di + 3] = sdata[si + 3];
    }
  }
  g.putImageData(out, 0, 0);
  return dst;
}

// substitute house-colour placeholders. Sprites are drawn with
// PAL.houseNone[0..3]; this recolours a canvas copy for a faction.
export function houseRecolor(src, houseColors) {
  const w = src.width, h = src.height;
  const [dst, g] = makeCanvas(w, h);
  g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const from = PAL.houseNone.map(hexToRgb);
  const to = houseColors.map(hexToRgb);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    for (let k = 0; k < 4; k++) {
      const f = from[k];
      if (d[i] === f[0] && d[i + 1] === f[1] && d[i + 2] === f[2]) {
        const t = to[k];
        d[i] = t[0]; d[i + 1] = t[1]; d[i + 2] = t[2];
        break;
      }
    }
  }
  g.putImageData(img, 0, 0);
  return dst;
}

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function shadeColor(hex, f) {
  const [r, g, b] = hexToRgb(hex);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}
