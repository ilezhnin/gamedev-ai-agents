// Constants every art module needs. They live in their own file because
// tiles/buildings/vehicles all want them and none of those should depend on
// a sibling just to learn how big a cell is.

import { PAL } from '../palette.js';

export const TILE = 24;          // world pixels per map cell
export const FACINGS = 16;       // rotation steps for vehicles/turrets

// House-colour placeholders. Sprites paint these, then houseRecolor() swaps
// them for the owning faction's ramp — so every hull is drawn exactly once.
export const HN = PAL.houseNone;
