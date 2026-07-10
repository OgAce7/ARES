// ─────────────────────────────────────────────────────────────────────────
// mockData.js
// Local, hard-coded stand-ins for state that will eventually be driven by
// a live backend / simulation engine.
//
// >>> BACKEND INTEGRATION NOTE <<<
// Everything exported from this file is a placeholder. When the real
// system exists, replace these constants with data fetched from the API
// (e.g. via a `useColonyState()` hook or websocket subscription) and feed
// it into <LunarWorld resources={...} moduleStatus={...} /> using the same
// shape defined here. No component in this prototype should need to
// change shape-wise — only the data source.
// ─────────────────────────────────────────────────────────────────────────

import { STATUS } from './worldConfig';

// Top-level colony resource pools, shown in the ResourceHUD.
export const RESOURCES = {
  oxygen: {
    label: 'Oxygen',
    icon: 'Wind',
    value: 87,
    unit: '%',
    trend: 'stable',
    detail: 'O2 reserves nominal. Greenhouse contributing +2.1%/cycle.',
  },
  water: {
    label: 'Water',
    icon: 'Droplets',
    value: 64,
    unit: '%',
    trend: 'down',
    detail: 'Reclaimer throughput reduced. Consumption slightly above recycle rate.',
  },
  energy: {
    label: 'Energy',
    icon: 'Zap',
    value: 92,
    unit: '%',
    trend: 'up',
    detail: 'Solar farm at peak output. Battery reserve fully charged.',
  },
};

// Colony-wide sustainability score (0-100) shown in SustainabilityBadge.
export const SUSTAINABILITY = {
  score: 78,
  label: 'Sustainability Index',
  trend: 'up',
  summary: 'Colony systems trending toward long-term equilibrium.',
};

// Per-building operational status + light flavor stats, keyed by building id
// (see BUILDINGS in worldConfig.js). Consumed by BuildingInfoPanel.
export const MODULE_STATUS = {
  council: {
    status: STATUS.STABLE,
    crew: 4,
    stats: [
      { label: 'Power Draw', value: '12 kW' },
      { label: 'Active Alerts', value: '0' },
    ],
  },
  'habitat-alpha': {
    status: STATUS.STABLE,
    crew: 6,
    stats: [
      { label: 'Occupancy', value: '6 / 8' },
      { label: 'Life Support', value: 'Nominal' },
    ],
  },
  'habitat-beta': {
    status: STATUS.WARNING,
    crew: 5,
    stats: [
      { label: 'Occupancy', value: '5 / 8' },
      { label: 'Life Support', value: 'Minor fluctuation' },
    ],
  },
  'medical-bay': {
    status: STATUS.STABLE,
    crew: 2,
    stats: [
      { label: 'Patients', value: '0' },
      { label: 'Supply Level', value: '81%' },
    ],
  },
  'research-lab': {
    status: STATUS.STABLE,
    crew: 3,
    stats: [
      { label: 'Active Experiments', value: '5' },
      { label: 'Data Uplink', value: 'Nominal' },
    ],
  },
  greenhouse: {
    status: STATUS.WARNING,
    crew: 2,
    stats: [
      { label: 'Crop Yield', value: '73%' },
      { label: 'Nutrient Mix', value: 'Low reserve' },
    ],
  },
  'water-recycler': {
    status: STATUS.CRITICAL,
    crew: 1,
    stats: [
      { label: 'Throughput', value: '58%' },
      { label: 'Filter Wear', value: 'Replace soon' },
    ],
  },
  'solar-farm': {
    status: STATUS.STABLE,
    crew: 1,
    stats: [
      { label: 'Output', value: '96%' },
      { label: 'Panel Health', value: 'Nominal' },
    ],
  },
};
