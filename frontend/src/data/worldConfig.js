// ─────────────────────────────────────────────────────────────────────────
// worldConfig.js
// Single source of truth for the visual layout of the ARES lunar colony.
//
// This is intentionally decoupled from live/mock resource data
// (see ./mockData.js). Positions are expressed as percentages of the
// world stage so the scene stays responsive at any viewport size.
//
// >>> BACKEND INTEGRATION NOTE <<<
// Building *positions*, *icons* and *layout* are structural/design data and
// will likely stay client-side even after a backend exists. Only the
// per-building *status* fields (see mockData.js) should eventually be
// swapped for live API/websocket data.
// ─────────────────────────────────────────────────────────────────────────

export const ASSET_PATHS = {
  // No bitmap/vector art shipped yet — every building & actor is rendered
  // with CSS/SVG placeholder components. Drop real sprites here later,
  // e.g. council: '/assets/buildings/council.png'
  buildings: {
    council: null,
    'habitat-alpha': null,
    'habitat-beta': null,
    'medical-bay': null,
    'research-lab': null,
    greenhouse: null,
    'water-recycler': null,
    'solar-farm': null,
  },
  astronaut: null,
  terrainTexture: null,
};

// Building "kind" drives the placeholder silhouette shape rendered by
// the Building component when no real asset is supplied.
export const BUILDING_KIND = {
  DOME: 'dome',
  HAB: 'hab',
  LAB: 'lab',
  TOWER: 'tower',
  PANEL_ARRAY: 'panel-array',
  TANK: 'tank',
  CAPITOL: 'capitol',
};

// x / y are percentages (0-100) across the world stage.
// scale sets relative footprint size, elevation lifts a building visually
// "up" the slope to fake depth without a 3D engine.
export const BUILDINGS = [
  {
    id: 'council',
    name: 'ARES Council',
    kind: BUILDING_KIND.CAPITOL,
    icon: 'Landmark',
    position: { x: 50, y: 56 },
    scale: 1.55,
    elevation: 18,
    zIndex: 6,
    description:
      'Central command dome and decision hub of the settlement. Houses the ARES governance core and colony-wide monitoring displays.',
  },
  {
    id: 'habitat-alpha',
    name: 'Habitat Alpha',
    kind: BUILDING_KIND.HAB,
    icon: 'Home',
    position: { x: 26, y: 66 },
    scale: 1,
    elevation: 6,
    zIndex: 4,
    description:
      'Primary crew living quarters. Sleeping pods, galley, and communal recreation space for the first settlement cohort.',
  },
  {
    id: 'habitat-beta',
    name: 'Habitat Beta',
    kind: BUILDING_KIND.HAB,
    icon: 'Home',
    position: { x: 74, y: 66 },
    scale: 1,
    elevation: 6,
    zIndex: 4,
    description:
      'Secondary crew quarters, expanded to support colony growth. Includes quarantine-capable isolation pods.',
  },
  {
    id: 'medical-bay',
    name: 'Medical Bay',
    kind: BUILDING_KIND.TOWER,
    icon: 'Cross',
    position: { x: 15, y: 50 },
    scale: 0.85,
    elevation: 10,
    zIndex: 3,
    description:
      'Colony health center. Trauma bay, bio-monitoring lab, and emergency low-gravity surgical suite.',
  },
  {
    id: 'research-lab',
    name: 'Research Lab',
    kind: BUILDING_KIND.LAB,
    icon: 'FlaskConical',
    position: { x: 85, y: 50 },
    scale: 0.9,
    elevation: 10,
    zIndex: 3,
    description:
      'Multi-discipline research facility studying regolith processing, low-g biology, and long-duration habitat science.',
  },
  {
    id: 'greenhouse',
    name: 'Greenhouse',
    kind: BUILDING_KIND.DOME,
    icon: 'Sprout',
    position: { x: 34, y: 40 },
    scale: 0.9,
    elevation: 14,
    zIndex: 2,
    description:
      'Hydroponic food production dome. Supplies fresh produce and contributes to the colony oxygen budget.',
  },
  {
    id: 'water-recycler',
    name: 'Water Recycler',
    kind: BUILDING_KIND.TANK,
    icon: 'Droplets',
    position: { x: 66, y: 40 },
    scale: 0.85,
    elevation: 14,
    zIndex: 2,
    description:
      'Closed-loop water reclamation plant. Filters, purifies, and redistributes potable water across the colony.',
  },
  {
    id: 'solar-farm',
    name: 'Solar Farm',
    kind: BUILDING_KIND.PANEL_ARRAY,
    icon: 'Zap',
    position: { x: 50, y: 28 },
    scale: 1.2,
    elevation: 20,
    zIndex: 1,
    description:
      'Primary power generation array. Photovoltaic field with battery buffering for the lunar night cycle.',
  },
];

// Fixed fan-out offsets (percentage points, relative to the occupied
// building's anchor point) applied when multiple astronauts share a
// module, so they don't render exactly on top of one another. This is
// static layout data, cycled by index within the module — not
// pathfinding or free-form placement, just a handful of predefined
// nearby spots around each building anchor.
export const CREW_ANCHOR_OFFSETS = [
  { dx: 0, dy: 4 },
  { dx: -5, dy: 6 },
  { dx: 5, dy: 6 },
  { dx: -3, dy: 9 },
  { dx: 3, dy: 9 },
];

// Ambient glow accent points scattered around the colony to sell the
// "cozy lit outpost at night" mood.
export const AMBIENT_LIGHTS = [
  { id: 'glow-1', x: 50, y: 56, radius: 22, color: 'var(--ares-glow-council)' },
  { id: 'glow-2', x: 26, y: 66, radius: 12, color: 'var(--ares-glow-warm)' },
  { id: 'glow-3', x: 74, y: 66, radius: 12, color: 'var(--ares-glow-warm)' },
  { id: 'glow-4', x: 50, y: 28, radius: 16, color: 'var(--ares-glow-solar)' },
  { id: 'glow-5', x: 34, y: 40, radius: 10, color: 'var(--ares-glow-green)' },
];

// Static terrain crater decoration (purely cosmetic, no gameplay meaning).
export const CRATERS = [
  { x: 10, y: 85, size: 60 },
  { x: 88, y: 82, size: 90 },
  { x: 6, y: 30, size: 40 },
  { x: 94, y: 55, size: 50 },
  { x: 55, y: 90, size: 70 },
  { x: 18, y: 15, size: 30 },
];

export const STATUS = {
  STABLE: 'stable',
  WARNING: 'warning',
  CRITICAL: 'critical',
};

export const STATUS_META = {
  [STATUS.STABLE]: { label: 'Stable', color: 'var(--ares-status-stable)' },
  [STATUS.WARNING]: { label: 'Warning', color: 'var(--ares-status-warning)' },
  [STATUS.CRITICAL]: { label: 'Critical', color: 'var(--ares-status-critical)' },
};