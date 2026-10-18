/**
 * Every visual and motion knob for the bonsai lives here.
 *
 * Units: the tree is drawn in a 1000 x 1000 "world" that is scaled to fit the
 * view, so lengths and radii below are world units. Angles are radians, times
 * are seconds. The whole object is captured by UI-thread worklets, so keep it
 * plain data (numbers, arrays, nested objects).
 */
export const BonsaiConfig = {
  world: { size: 1000, baseX: 500, baseY: 770 },

  /** How the smoothed state chases its target (time constant, seconds). */
  transition: { growthTau: 1.1, overgrowthTau: 0.8, vitalityTau: 0.9 },

  trunk: {
    segments: 9,
    /** Segments that exist even at growth 0 (the "young" tree). */
    youngSegments: 5,
    firstSegmentLength: 66,
    lengthFalloff: 3.2,
    baseRadius: 46,
    tipRadius: 9,
    curveAmplitude: 0.42,
    curveFrequency: 0.8,
    /** Young trunks are thinner and shorter; these scale radius/length at growth 0. */
    youngRadiusScale: 0.42,
    youngLengthScale: 0.66,
  },

  branches: {
    /** Trunk node index, side (+1 right, -1 left, 0 back), growth birth. */
    layout: [
      { at: 2, side: 1, birth: 0.0 },
      { at: 3, side: -1, birth: 0.0 },
      { at: 4, side: 0, birth: 0.22 },
      { at: 5, side: 1, birth: 0.28 },
      { at: 6, side: -1, birth: 0.42 },
      { at: 7, side: 0, birth: 0.6 },
    ],
    lowLength: 255,
    highLength: 120,
    backScale: 0.62,
    twigChance: 0.85,
    twigLength: [48, 82] as [number, number],
  },

  pads: {
    primary: { rx: 68, ry: 30 },
    twig: { rx: 50, ry: 24 },
    apex: { rx: 78, ry: 38 },
    /** New stray puffs per pad that appear with overgrowth. */
    strayPuffs: 4,
    scallopRadius: [6.5, 10] as [number, number],
  },

  overgrowth: {
    shootsPerPad: [1, 3] as [number, number],
    shootLength: [55, 135] as [number, number],
    waterSprouts: 3,
    /** Branch segments stretch by this fraction at 100% overgrowth ("leggy"). */
    legginess: 0.22,
    /** Puffs drift outward by this fraction of the pad radius at 100%. */
    puffDrift: 0.42,
  },

  vitality: {
    /** Extra downward bend of branches at vitality 0. */
    droop: 0.16,
    /** Puff volume at vitality 0 relative to full. */
    minVolume: 0.8,
    /** Falling-leaf spawns per second at vitality 0 (scaled by (1-v)^2). */
    leafFallRate: 1.4,
  },

  sway: {
    /** Overall wind strength; 0 = still air. */
    wind: 1.0,
    /** Angular spring parameters per node kind: trunk, branch, twig, shoot. */
    stiffness: [70, 42, 30, 16],
    damping: [7, 5, 4, 2.6],
    /** Wind torque per node kind. */
    windGain: [0.55, 1.1, 1.6, 3.4],
    /** Child nodes feel this fraction of the parent's angular acceleration (whip). */
    whip: 0.32,
    baseFrequency: 0.55,
    gustEvery: 9.5,
    gustStrength: 1.6,
    /** Energy multiplier at vitality 0 and 1. */
    energyRange: [0.55, 1.15] as [number, number],
    padTiltFollow: 0.3,
    flutter: 1.7,
  },

  touch: {
    padImpulse: 5.5,
    branchImpulse: 7,
    dragImpulse: 0.05,
    dragRadius: 85,
    potHitPadding: 12,
    rustleDecay: 1.6,
  },

  particles: { max: 48, gravity: 70, drag: 0.9 },

  colors: {
    background: ['#F7EEDF', '#EEDCC6'],
    sun: '#F6D3B4',
    // [vitality 0, vitality 1]
    foliageDark: ['#4C4A2C', '#1E5236'],
    foliageBase: ['#757041', '#2E7A46'],
    foliageLight: ['#A39A5E', '#5DAA55'],
    foliageSpec: ['#C9BD8E', '#A9DA86'],
    newGrowth: ['#A7A65A', '#9CCB57'],
    bark: '#6B4A35',
    barkDark: '#43301F',
    barkLight: '#9A7356',
    shootWood: '#7C7C3E',
    potBody: '#2F4C5E',
    potDark: '#1D3140',
    potLight: '#5F8597',
    potRim: '#3B5D70',
    soil: '#4A3424',
    moss: '#6E8F3E',
    fallenLeaf: '#C2A04A',
  },
};

export type BonsaiConfigType = typeof BonsaiConfig;
