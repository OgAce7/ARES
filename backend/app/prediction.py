"""
Emergency shortage prediction for ARES.

For each resource, estimates the current net rate (generation/recovery
minus effective consumption) and, if the resource is depleting, how many
simulated hours remain before it crosses its critical_threshold. This
reuses the exact same generation/consumption formulas as the tick engine
and sustainability index, so all three stay consistent with each other.

This is a linear projection from the CURRENT instantaneous rate — not a
trend model, not a forecast with confidence bounds, and not randomized.
If the caller wants trend-based prediction later, tick history would need
to be recorded first; today the tick engine keeps no history, so this
module uses "current modeled rates" as instructed.

No optimization, scenario injection, or randomness lives here.
"""

from app.models import HabitatState, PredictionResponse, ResourcePrediction
from app.simulation import (
    _astronaut_demand_totals,
    _facility_generation_bonus,
    _module_demand_totals,
)
from app.utils import RESOURCE_NAMES

# --- Configurable risk horizons (simulated hours until crossing critical_threshold) ---
CRITICAL_HORIZON_HOURS = 12.0
WARNING_HORIZON_HOURS = 24.0
WATCH_HORIZON_HOURS = 72.0

# Risk severity ordering, most severe first, used to derive the overall risk.
RISK_SEVERITY = ("critical", "warning", "watch", "safe")


def _resource_rate_breakdown(state: HabitatState, name: str) -> dict[str, float]:
    """
    Generation and consumption components for one resource, for one
    simulated hour, using the same formulas as the tick engine.
    """
    r = state.resources[name]
    facility_bonus = _facility_generation_bonus(state)[name]
    module_demand = _module_demand_totals(state)[name]
    astronaut_demand = _astronaut_demand_totals(state)[name]

    return {
        "base_generation": r.generation_rate,
        "facility_bonus": facility_bonus,
        "base_consumption": r.base_consumption_rate,
        "module_demand": module_demand,
        "astronaut_demand": astronaut_demand,
    }


def _net_rate(breakdown: dict[str, float]) -> float:
    generation = breakdown["base_generation"] + breakdown["facility_bonus"]
    consumption = breakdown["base_consumption"] + breakdown["module_demand"] + breakdown["astronaut_demand"]
    return generation - consumption


def _primary_factors(breakdown: dict[str, float], net_rate: float) -> list[str]:
    """
    Plain-language description of the components that most influence the
    net rate for this resource, largest magnitude first. Capped at 3 for
    readability.
    """
    labels = {
        "base_consumption": "Baseline habitat consumption",
        "module_demand": "Module resource demand",
        "astronaut_demand": "Crew personal consumption",
        "base_generation": "Baseline generation",
        "facility_bonus": "Facility generation/recovery bonus",
    }
    # Consumption components count positively toward depletion; generation
    # components count as offsetting factors. Rank all five by magnitude.
    ranked = sorted(breakdown.items(), key=lambda item: item[1], reverse=True)
    factors = []
    for key, value in ranked:
        if value <= 0:
            continue
        role = "drives depletion" if key in ("base_consumption", "module_demand", "astronaut_demand") else "offsets depletion"
        factors.append(f"{labels[key]}: {value:.1f} units/hour ({role})")
        if len(factors) == 3:
            break
    if not factors:
        factors.append("No significant consumption or generation activity")
    return factors


def _risk_level(current_level: float, critical_threshold: float, hours_to_critical: float | None) -> str:
    if current_level <= critical_threshold:
        return "critical"  # already at or below threshold
    if hours_to_critical is None:
        return "safe"  # not depleting
    if hours_to_critical <= CRITICAL_HORIZON_HOURS:
        return "critical"
    if hours_to_critical <= WARNING_HORIZON_HOURS:
        return "warning"
    if hours_to_critical <= WATCH_HORIZON_HOURS:
        return "watch"
    return "safe"


def _predict_resource(state: HabitatState, name: str) -> ResourcePrediction:
    r = state.resources[name]
    breakdown = _resource_rate_breakdown(state, name)
    net_rate = _net_rate(breakdown)

    hours_to_critical: float | None = None
    # net_rate != 0 additionally guards against the -0.0 edge case, where
    # `net_rate < 0` is true but abs(net_rate) is 0.0, which would raise
    # ZeroDivisionError below.
    if net_rate < 0 and net_rate != 0:
        buffer = r.current_level - r.critical_threshold
        hours_to_critical = max(0.0, buffer) / abs(net_rate)

    risk = _risk_level(r.current_level, r.critical_threshold, hours_to_critical)
    factors = _primary_factors(breakdown, net_rate)

    return ResourcePrediction(
        resource=name,
        current_level=round(r.current_level, 1),
        critical_threshold=r.critical_threshold,
        net_rate_per_hour=round(net_rate, 2),
        hours_to_critical=round(hours_to_critical, 1) if hours_to_critical is not None else None,
        risk_level=risk,
        primary_factors=factors,
    )


def compute_prediction(state: HabitatState) -> PredictionResponse:
    """
    Compute shortage predictions for all three resources plus an overall
    emergency outlook (nearest predicted shortage and overall risk level).
    """
    predictions = [_predict_resource(state, name) for name in RESOURCE_NAMES]

    depleting = [p for p in predictions if p.hours_to_critical is not None]
    nearest_shortage: str | None = None
    hours_to_nearest_critical: float | None = None
    if depleting:
        nearest = min(depleting, key=lambda p: p.hours_to_critical)
        nearest_shortage = nearest.resource
        hours_to_nearest_critical = nearest.hours_to_critical

    # Overall risk is the most severe risk level present among all resources.
    present_risks = {p.risk_level for p in predictions}
    overall_risk = next((level for level in RISK_SEVERITY if level in present_risks), "safe")

    return PredictionResponse(
        resources=predictions,
        nearest_shortage=nearest_shortage,
        hours_to_nearest_critical=hours_to_nearest_critical,
        overall_risk=overall_risk,
    )