// Game data: buildings, units, weapons, armour model and tech dependencies.
// Numbers follow the spirit of classic 90s RTS balance (cheap infantry,
// tanks rule the field, tesla weapon melts everything but needs power).

export const ARMOR = { NONE: 'none', LIGHT: 'light', HEAVY: 'heavy', WOOD: 'wood', CONCRETE: 'concrete' };

// warhead vs armour damage multipliers
export const WARHEADS = {
  bullet:  { none: 1.0, light: 0.55, heavy: 0.25, wood: 0.45, concrete: 0.2 },
  shell:   { none: 0.6, light: 0.85, heavy: 1.0,  wood: 0.9,  concrete: 0.7 },
  rocket:  { none: 0.5, light: 1.0,  heavy: 0.85, wood: 0.85, concrete: 0.9 },
  zap:     { none: 1.0, light: 1.0,  heavy: 1.0,  wood: 1.0,  concrete: 1.0 },
};

export const WEAPONS = {
  m1rifle:   { damage: 8,  rof: 0.55, range: 4,   warhead: 'bullet', projectile: 'tracer', sound: 'rifle' },
  towerGun:  { damage: 14, rof: 0.7,  range: 5,   warhead: 'bullet', projectile: 'tracer', sound: 'mg' },
  bazooka:   { damage: 26, rof: 1.5,  range: 5,   warhead: 'rocket', projectile: 'rocket', speed: 6, sound: 'rocket' },
  cannon75:  { damage: 28, rof: 1.5,  range: 4.75, warhead: 'shell', projectile: 'shell', speed: 9, sound: 'cannon' },
  cannon105: { damage: 42, rof: 2.1,  range: 4.75, warhead: 'shell', projectile: 'shell', speed: 9, sound: 'cannon' },
  teslaZap:  { damage: 110, rof: 3.2, range: 6,   warhead: 'zap', projectile: 'zap', sound: 'tesla' },
};

// ---------------------------------------------------------------- units ----

export const UNITS = {
  rifle: {
    name: 'RIFLEMAN', kind: 'infantry', cost: 100, buildTime: 5,
    hp: 50, armor: ARMOR.NONE, speed: 2.1, sight: 4, weapon: 'm1rifle',
    producedAt: 'barracks', size: 12,
  },
  rocket: {
    name: 'ROCKETEER', kind: 'infantry', cost: 300, buildTime: 8,
    hp: 45, armor: ARMOR.NONE, speed: 1.8, sight: 4, weapon: 'bazooka',
    producedAt: 'barracks', size: 12,
  },
  lightTank: {
    name: 'LIGHT TANK', kind: 'vehicle', cost: 700, buildTime: 13,
    hp: 230, armor: ARMOR.HEAVY, speed: 3.0, turn: 6, sight: 5, weapon: 'cannon75',
    producedAt: 'factory', size: 20, hasTurret: true, crusher: true,
  },
  heavyTank: {
    name: 'HEAVY TANK', kind: 'vehicle', cost: 950, buildTime: 17,
    hp: 400, armor: ARMOR.HEAVY, speed: 2.2, turn: 5, sight: 5, weapon: 'cannon105',
    producedAt: 'factory', size: 22, hasTurret: true, crusher: true, requires: ['radar'],
  },
  harvester: {
    name: 'ORE TRUCK', kind: 'vehicle', cost: 1100, buildTime: 15,
    hp: 600, armor: ARMOR.HEAVY, speed: 2.0, turn: 5, sight: 3, weapon: null,
    producedAt: 'factory', size: 22, harvester: true, crusher: true,
  },
  mcv: {
    name: 'MCV', kind: 'vehicle', cost: 2000, buildTime: 25,
    hp: 600, armor: ARMOR.LIGHT, speed: 1.6, turn: 4, sight: 3, weapon: null,
    producedAt: 'factory', size: 22, deploysTo: 'conyard', crusher: true, requires: ['radar'],
  },
};

// -------------------------------------------------------------- buildings --

export const BUILDINGS = {
  conyard: {
    name: 'CONSTRUCTION YARD', cost: 0, buildTime: 0,
    hp: 800, armor: ARMOR.WOOD, w: 3, h: 3, power: 0, sight: 5,
    unbuildable: true,
  },
  power: {
    name: 'POWER PLANT', cost: 300, buildTime: 8,
    hp: 400, armor: ARMOR.WOOD, w: 2, h: 2, power: 100, sight: 3,
  },
  refinery: {
    name: 'ORE REFINERY', cost: 2000, buildTime: 20,
    hp: 900, armor: ARMOR.WOOD, w: 3, h: 3, power: -30, sight: 4,
    requires: ['power'], grantsUnit: 'harvester',
  },
  barracks: {
    name: 'BARRACKS', cost: 400, buildTime: 9,
    hp: 500, armor: ARMOR.WOOD, w: 2, h: 2, power: -20, sight: 4,
    requires: ['power'], factoryFor: 'infantry',
  },
  factory: {
    name: 'WAR FACTORY', cost: 2000, buildTime: 20,
    hp: 1000, armor: ARMOR.LIGHT, w: 3, h: 2, power: -30, sight: 4,
    requires: ['refinery'], factoryFor: 'vehicle',
  },
  radar: {
    name: 'RADAR DOME', cost: 1000, buildTime: 14,
    hp: 500, armor: ARMOR.WOOD, w: 2, h: 2, power: -40, sight: 8,
    requires: ['refinery'], givesRadar: true,
  },
  silo: {
    name: 'ORE SILO', cost: 150, buildTime: 4,
    hp: 300, armor: ARMOR.WOOD, w: 1, h: 1, power: -10, sight: 2,
    requires: ['refinery'], storage: 1500,
  },
  guard: {
    name: 'GUARD TOWER', cost: 500, buildTime: 10,
    hp: 400, armor: ARMOR.WOOD, w: 1, h: 1, power: -10, sight: 6,
    weapon: 'towerGun', requires: ['barracks'],
  },
  tesla: {
    name: 'TESLA COIL', cost: 1500, buildTime: 16,
    hp: 400, armor: ARMOR.WOOD, w: 1, h: 1, power: -100, sight: 7,
    weapon: 'teslaZap', requires: ['factory'], needsPower: true,
  },
};

export const BUILD_ORDER_STRIP = ['power', 'refinery', 'barracks', 'factory', 'radar', 'silo', 'guard', 'tesla'];
export const UNIT_STRIP = ['rifle', 'rocket', 'lightTank', 'heavyTank', 'harvester', 'mcv'];

export const ECONOMY = {
  startCredits: 5000,
  aiStartCredits: 5000,
  baseStorage: 2000,        // storage without silos (conyard+refinery hold a bit)
  orePerCell: 220,          // credits worth of ore in a fresh cell (density 3)
  harvesterCapacity: 700,   // credits per full load
  harvestPerTrip: 25,       // credits chewed per harvest tick
  harvestTick: 0.45,        // seconds per chew
  unloadTime: 2.2,          // seconds docked
  oreGrowthEvery: 7,        // seconds between global ore growth pulses
  lowPowerSpeed: 0.4,       // production speed multiplier when power is short
  repairCostFactor: 0.25,   // fraction of unit cost to fully repair
  repairHpPerSec: 40,
  sellRefund: 0.5,
};
