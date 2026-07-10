// ─────────────────────────────────────────────────────────────────────────
// adapters.js
// Pure functions that translate backend response shapes (see app/models.py)
// into the exact prop shapes the existing components already expect
// (see data/mockData.js). Components are NOT changed — only the data
// feeding them. Keeping this mapping in one file means "adapt frontend to
// backend" stays a data-layer concern, not a component rewrite.
// ─────────────────────────────────────────────────────────────────────────

import { STATUS } from '../data/worldConfig';

// worldConfig.js / mockData.js key buildings with hyphens ('habitat-alpha');
// the backend keys modules with underscores ('habitat_alpha'). This is the
// one real naming mismatch between the two sides — bridge it explicitly
// here rather than touching either the backend or worldConfig.js.
export const BACKEND_TO_FRONTEND_ID = {
  council: 'council',
  habitat_alpha: 'habitat-alpha',
  habitat_beta: 'habitat-beta',
  medical_bay: 'medical-bay',
  research_lab: 'research-lab',
  greenhouse: 'greenhouse',
  water_recycler: 'water-recycler',
  solar_farm: 'solar-farm',
};

// Backend module.status can be "nominal" | "degraded" | "critical" | "stable" | "warning".
// The frontend's STATUS_META only knows stable/warning/critical, so fold the
// backend's extra values into the closest visual equivalent.
function normalizeStatus(backendStatus) {
  switch (backendStatus) {
    case STATUS.CRITICAL:
      return STATUS.CRITICAL;
    case STATUS.WARNING:
    case 'degraded':
      return STATUS.WARNING;
    case 'offline':
      return STATUS.CRITICAL;
    case STATUS.STABLE:
    case 'nominal':
    default:
      return STATUS.STABLE;
  }
}

const RESOURCE_META = {
  oxygen: { label: 'Oxygen', icon: 'Wind' },
  water: { label: 'Water', icon: 'Droplets' },
  energy: { label: 'Energy', icon: 'Zap' },
};

function resourceTrend(netRatePerHour) {
  if (netRatePerHour == null) return 'stable';
  if (netRatePerHour > 0.5) return 'up';
  if (netRatePerHour < -0.5) return 'down';
  return 'stable';
}

/**
 * Build the { oxygen, water, energy } shape ResourceHUD expects from a
 * live HabitatState.resources dict, optionally enriched with
 * PredictionResponse for trend + a shortage-aware tooltip.
 */
export function adaptResources(resources, prediction) {
  const predictionByName = {};
  for (const p of prediction?.resources ?? []) predictionByName[p.resource] = p;

  const adapted = {};
  for (const [name, resource] of Object.entries(resources)) {
    const meta = RESOURCE_META[name] ?? { label: name, icon: 'Gauge' };
    const pct = resource.max_capacity > 0
      ? Math.round((resource.current_level / resource.max_capacity) * 100)
      : 0;
    const pred = predictionByName[name];

    let detail;
    if (pred) {
      const netStr = `${pred.net_rate_per_hour >= 0 ? '+' : ''}${pred.net_rate_per_hour.toFixed(1)} ${resource.unit}/hr`;
      const horizon = pred.hours_to_critical != null
        ? ` — ~${pred.hours_to_critical.toFixed(1)}h to critical`
        : '';
      detail = `${resource.current_level.toFixed(0)} / ${resource.max_capacity.toFixed(0)} ${resource.unit}. Net ${netStr}. Risk: ${pred.risk_level}${horizon}.`;
    } else {
      detail = `${resource.current_level.toFixed(0)} / ${resource.max_capacity.toFixed(0)} ${resource.unit} in reserve.`;
    }

    adapted[name] = {
      label: meta.label,
      icon: meta.icon,
      value: Math.max(0, Math.min(100, pct)),
      unit: '%',
      trend: resourceTrend(pred?.net_rate_per_hour),
      risk: pred?.risk_level ?? null,
      detail,
    };
  }
  return adapted;
}

/**
 * Build the { score, label, trend, summary } shape SustainabilityBadge
 * expects from a live SustainabilityResponse. `previousScore` (optional)
 * lets the caller derive a trend arrow across polls; the backend itself
 * doesn't report a trend.
 */
export function adaptSustainability(sustainability, previousScore = null) {
  let trend = 'stable';
  if (previousScore != null) {
    if (sustainability.overall_score > previousScore + 0.5) trend = 'up';
    else if (sustainability.overall_score < previousScore - 0.5) trend = 'down';
  }
  return {
    score: Math.round(sustainability.overall_score),
    label: 'Sustainability Index',
    trend,
    summary: `${sustainability.classification}. ${sustainability.key_factors?.[0] ?? ''}`.trim(),
  };
}

/**
 * Build the MODULE_STATUS dict (keyed by frontend hyphenated building id)
 * that BuildingInfoPanel / Building expect, from live HabitatState.modules
 * + astronauts.
 *
 * `activeScenarios` (HabitatState.active_scenarios) is optional context used
 * for exactly one edge case: solar_flare caps solar_farm's own energy
 * allocation, but solar_farm's minimum-safe energy floor is 0%, so the
 * backend's allocation-vs-floor status logic never flags it — the module
 * stays "nominal" even mid-flare. Rather than inventing a fake status, we
 * surface the *real* active_scenarios fact (a solar_flare is genuinely
 * active) as a "warning" floor for that one module's visual state.
 */
export function adaptModuleStatus(modules, astronauts, activeScenarios = {}) {
  const crewByModule = {};
  for (const astronaut of astronauts ?? []) {
    crewByModule[astronaut.current_location] = (crewByModule[astronaut.current_location] ?? 0) + 1;
  }

  const solarFlareActive = Boolean(activeScenarios?.solar_flare);

  const adapted = {};
  for (const [backendId, module] of Object.entries(modules)) {
    const frontendId = BACKEND_TO_FRONTEND_ID[backendId] ?? backendId;
    const alloc = module.current_allocation;
    let status = normalizeStatus(module.status);
    if (solarFlareActive && backendId === 'solar_farm' && status === STATUS.STABLE) {
      status = STATUS.WARNING;
    }
    adapted[frontendId] = {
      status,
      crew: crewByModule[backendId] ?? 0,
      stats: [
        { label: 'O2 Allocation', value: `${Math.round(alloc.oxygen)}%` },
        { label: 'Water Allocation', value: `${Math.round(alloc.water)}%` },
        { label: 'Energy Allocation', value: `${Math.round(alloc.energy)}%` },
      ],
    };
  }
  return adapted;
}

/**
 * Build a simple { [scenario_id]: { targetModuleId } } map — keyed by the
 * frontend hyphenated building id where relevant — from the live
 * HabitatState.active_scenarios dict, for driving the Council's active
 * scenario indicator and the per-building visual reaction effects.
 */
export function adaptActiveScenarios(activeScenarios) {
  const adapted = {};
  for (const [scenarioId, active] of Object.entries(activeScenarios ?? {})) {
    adapted[scenarioId] = {
      scenarioId,
      targetModuleId: active.target_module
        ? BACKEND_TO_FRONTEND_ID[active.target_module] ?? active.target_module
        : null,
      triggeredAtTick: active.triggered_at_tick,
    };
  }
  return adapted;
}