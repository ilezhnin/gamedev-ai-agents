// The art package now lives in src/art/ (tiles, buildings, vehicles, infantry,
// effects, ui-art). This file stays as the stable import path everyone else
// already uses.

export {
  TILE, FACINGS, BIOMES, buildSprites, drawTitleLogo, makeCameo, unitBodyFrame,
} from './art/index.js';
