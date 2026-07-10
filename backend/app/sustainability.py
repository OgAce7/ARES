"""
Habitat Sustainability Index for ARES.

Computes a deterministic, explainable 0-100 score describing how
sustainable the habitat is right now, from four simple components:

    1. Resource Stability     - how far oxygen/water/energy sit above critical
    2. Reserve Longevity      - how long current reserves would last at the
                                 current net consumption rate
    3. Allocation Efficiency  - whether allocation matches module criticality
                                 (critical modules adequately served, low
                                 priority modules not hoarding resources)
    4. Emergency Resilience   - how much buffer exists to absorb a shock,
                                 both in raw reserves and in reallocatable
                                 module headroom

Each component is scored 0-100, then combined into a single weighted
overall score. No prediction, optimization, or randomness — this reads
the current HabitatState and reuses the same consumption/generation
formulas as the tick engine so the numbers stay consistent with /tick.
"""

from app.models import HabitatState, SustainabilityComponentScores
from app.simulation import (
    _astronaut_demand_totals,
    _facility_generation_bonus,
    _module_demand_totals,
)

# --- Component weights (must sum to 1.0) ---
WEIGHT_RESOURCE_STABILITY = 0.30
WEIGHT_RESERVE_LONGEVITY = 0.30
WEIGHT_ALLOCATION_EFFICIENCY = 0.20
WEIGHT_EMERGENCY_RESILIENCE = 0.20

# Reserve Longevity: a resource that would last at least this many
# simulated hours at its current net consumption rate is treated as fully
# safe (100). This is a simple reference horizon, not a prediction.
LONGEVITY_REFERENCE_HOURS = 72.0

# Emergency Resilience: a resource buffer worth this many multiples of its
# own critical threshold is treated as fully resilient (100).
RESILIENCE_REFERENCE_MULTIPLE = 2.0

RESOURCE_NAMES = ("oxygen", "water", "energy")


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def _resource_stability(state: HabitatState) -> tuple[float, dict[str, float]]:
    """
    Per resource: how far current_level sits above critical_threshold,
    expressed as a percentage of the usable range (max_capacity - threshold).
    Averaged across the three resources.
    """
    scores: dict[str, float] = {}
    for name in RESOURCE_NAMES:
        r = state.resources[name]
        usable_range = r.max_capacity - r.critical_threshold
        if usable_range <= 0:
            scores[name] = 0.0
            continue
        scores[name] = _clamp((r.current_level - r.critical_threshold) / usable_range * 100.0)
    overall = sum(scores.values()) / len(scores)
    return overall, scores


def _net_consumption_rates(state: HabitatState) -> dict[str, float]:
    """
    Net change per simulated hour for each resource, using the same
    generation/consumption formulas as the tick engine (positive = growing,
    negative = draining). If no consumption history exists, this uses the
    current modeled rates, as instructed.
    """
    facility_bonus = _facility_generation_bonus(state)
    module_demand = _module_demand_totals(state)
    astronaut_demand = _astronaut_demand_totals(state)

    rates: dict[str, float] = {}
    for name in RESOURCE_NAMES:
        r = state.resources[name]
        generation = r.generation_rate + facility_bonus[name]
        consumption = r.base_consumption_rate + module_demand[name] + astronaut_demand[name]
        rates[name] = generation - consumption
    return rates


def _reserve_longevity(state: HabitatState) -> tuple[float, dict[str, float], dict[str, float]]:
    """
    Per resource: hours until the resource hits its critical threshold at
    the current net consumption rate. A non-negative net rate (reserves
    holding or growing) scores 100. Hours are capped at the reference
    horizon for scoring purposes, then scaled to 0-100.
    """
    rates = _net_consumption_rates(state)
    scores: dict[str, float] = {}
    hours_remaining: dict[str, float] = {}

    for name in RESOURCE_NAMES:
        r = state.resources[name]
        net_rate = rates[name]
        if net_rate >= 0:
            scores[name] = 100.0
            hours_remaining[name] = float("inf")
            continue
        buffer = r.current_level - r.critical_threshold
        hours = buffer / abs(net_rate) if buffer > 0 else 0.0
        hours_remaining[name] = hours
        scores[name] = _clamp(hours / LONGEVITY_REFERENCE_HOURS * 100.0)

    overall = sum(scores.values()) / len(scores)
    return overall, scores, hours_remaining


def _allocation_efficiency(state: HabitatState) -> tuple[float, dict[str, float]]:
    """
    Per module: compares current allocation to an "ideal" allocation that
    scales with the module's criticality_weight — a highly critical module
    should sit close to 100% allocation, while a low-criticality module's
    ideal sits closer to its own minimum-safe floor (so it isn't hoarding
    resources it doesn't strictly need). Deviating below the ideal
    (under-serving a critical module) is penalized harder than deviating
    above it (mild over-allocation to a low-priority module).

    The per-module scores are combined into a single figure weighted by
    each module's own criticality_weight, since getting allocation right
    matters more for critical modules than peripheral ones.
    """
    per_module: dict[str, float] = {}
    weight_total = 0.0
    weighted_sum = 0.0

    for module_id, module in state.modules.items():
        min_avg = (
            module.minimum_safe_allocation.oxygen
            + module.minimum_safe_allocation.water
            + module.minimum_safe_allocation.energy
        ) / 3.0
        cur_avg = (
            module.current_allocation.oxygen
            + module.current_allocation.water
            + module.current_allocation.energy
        ) / 3.0

        ideal_avg = min_avg + module.criticality_weight * (100.0 - min_avg)
        deviation = cur_avg - ideal_avg

        if deviation < 0:
            # Under-serving relative to how critical this module is: penalize harder.
            score = 100.0 - abs(deviation) * 2.0
        else:
            # Over-allocating beyond what its criticality calls for: mild penalty.
            score = 100.0 - abs(deviation) * 1.0

        score = _clamp(score)
        per_module[module_id] = score

        weight = module.criticality_weight
        weighted_sum += score * weight
        weight_total += weight

    overall = weighted_sum / weight_total if weight_total > 0 else 0.0
    return overall, per_module


def _emergency_resilience(state: HabitatState) -> tuple[float, dict[str, float]]:
    """
    Two ingredients, averaged:
      a) Resource buffer: how many multiples of its own critical_threshold
         a resource currently holds in reserve above that threshold.
      b) Allocation headroom: how far, on average, module allocations sit
         above their minimum-safe floor (i.e. how much could be given up
         in an emergency reallocation without breaching safety).
    """
    resource_scores: dict[str, float] = {}
    for name in RESOURCE_NAMES:
        r = state.resources[name]
        if r.critical_threshold <= 0:
            resource_scores[name] = 0.0
            continue
        buffer_multiple = (r.current_level - r.critical_threshold) / r.critical_threshold
        resource_scores[name] = _clamp(buffer_multiple / RESILIENCE_REFERENCE_MULTIPLE * 100.0)
    resource_buffer_score = sum(resource_scores.values()) / len(resource_scores)

    headroom_values = []
    for module in state.modules.values():
        min_avg = (
            module.minimum_safe_allocation.oxygen
            + module.minimum_safe_allocation.water
            + module.minimum_safe_allocation.energy
        ) / 3.0
        cur_avg = (
            module.current_allocation.oxygen
            + module.current_allocation.water
            + module.current_allocation.energy
        ) / 3.0
        headroom_values.append(_clamp(cur_avg - min_avg))
    headroom_score = sum(headroom_values) / len(headroom_values) if headroom_values else 0.0

    overall = (resource_buffer_score + headroom_score) / 2.0
    breakdown = {**resource_scores, "allocation_headroom": round(headroom_score, 1)}
    return overall, breakdown


def _classify(score: float) -> str:
    if score >= 80:
        return "Thriving"
    if score >= 60:
        return "Stable"
    if score >= 40:
        return "Vulnerable"
    return "Critical"


def _key_factors(
    stability_scores: dict[str, float],
    longevity_scores: dict[str, float],
    hours_remaining: dict[str, float],
    efficiency_by_module: dict[str, float],
    resilience_breakdown: dict[str, float],
) -> list[str]:
    """
    Build a short, human-readable list of the factors most affecting the
    score: the weakest resource for stability/longevity, and the weakest
    module for allocation efficiency. Kept to a handful of plain-language
    notes rather than a full data dump.
    """
    factors: list[str] = []

    weakest_stability = min(stability_scores, key=stability_scores.get)
    factors.append(
        f"{weakest_stability.capitalize()} stability is the weakest resource "
        f"({stability_scores[weakest_stability]:.0f}/100 above critical threshold)"
    )

    weakest_longevity = min(longevity_scores, key=longevity_scores.get)
    hours = hours_remaining[weakest_longevity]
    if hours == float("inf"):
        factors.append(f"{weakest_longevity.capitalize()} reserves are holding steady or growing")
    else:
        factors.append(
            f"{weakest_longevity.capitalize()} would reach critical level in "
            f"about {hours:.0f} simulated hours at current consumption"
        )

    weakest_module = min(efficiency_by_module, key=efficiency_by_module.get)
    factors.append(
        f"Module '{weakest_module}' allocation is furthest from its criticality-adjusted target "
        f"({efficiency_by_module[weakest_module]:.0f}/100)"
    )

    weakest_resource_buffer = min(
        ((name, score) for name, score in resilience_breakdown.items() if name in RESOURCE_NAMES),
        key=lambda pair: pair[1],
    )
    factors.append(
        f"{weakest_resource_buffer[0].capitalize()} has the smallest emergency buffer "
        f"({weakest_resource_buffer[1]:.0f}/100)"
    )

    return factors


def compute_sustainability_index(state: HabitatState) -> tuple[float, str, SustainabilityComponentScores, list[str]]:
    """
    Compute the full Habitat Sustainability Index from the current state.
    Returns (overall_score, classification, component_scores, key_factors).
    """
    stability_overall, stability_scores = _resource_stability(state)
    longevity_overall, longevity_scores, hours_remaining = _reserve_longevity(state)
    efficiency_overall, efficiency_by_module = _allocation_efficiency(state)
    resilience_overall, resilience_breakdown = _emergency_resilience(state)

    overall_score = (
        stability_overall * WEIGHT_RESOURCE_STABILITY
        + longevity_overall * WEIGHT_RESERVE_LONGEVITY
        + efficiency_overall * WEIGHT_ALLOCATION_EFFICIENCY
        + resilience_overall * WEIGHT_EMERGENCY_RESILIENCE
    )
    overall_score = round(_clamp(overall_score), 1)

    component_scores = SustainabilityComponentScores(
        resource_stability=round(stability_overall, 1),
        reserve_longevity=round(longevity_overall, 1),
        allocation_efficiency=round(efficiency_overall, 1),
        emergency_resilience=round(resilience_overall, 1),
    )

    key_factors = _key_factors(
        stability_scores, longevity_scores, hours_remaining, efficiency_by_module, resilience_breakdown
    )

    return overall_score, _classify(overall_score), component_scores, key_factors
