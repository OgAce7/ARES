"""
Resource reallocation engine for ARES (Council House optimizer).

Generates an explainable, deterministic reallocation plan that adjusts
each module's per-resource allocation percentage in response to:
  - module criticality_weight
  - minimum_safe_allocation floors
  - current_allocation
  - current resource scarcity (how close a resource sits to critical)
  - astronaut occupancy and activity level in each module
  - predicted shortage risk (via app.prediction, when available)

This is a single-pass weighted heuristic (no solver, no randomness, no
LLM). Every allocation change carries a plain-language, rule-derived
reason. Reuses the exact tick/prediction/sustainability formulas so the
"expected effect" figures in a plan stay consistent with the rest of the
simulation.

No scenario injection, persistence, or LLM logic lives here.
"""

from app.models import (
    HabitatState,
    ModuleAllocationChange,
    OptimizationPlan,
    ResourceEffect,
)
from app.prediction import compute_prediction
from app.sustainability import compute_sustainability_index
from app.utils import RESOURCE_NAMES, clamp

# --- Tunable heuristic constants ---

# A resource is treated as "scarce" (active rationing kicks in) once its
# scarcity index reaches this value (0 = full reserves, 1 = at/below
# critical threshold).
SCARCE_THRESHOLD = 0.35

# Modules whose effective priority weight falls below this are the first
# candidates to surrender allocation during scarcity.
LOW_PRIORITY_WEIGHT_THRESHOLD = 0.55

# Per astronaut present, how much a module's effective priority weight is
# boosted (scaled further by that astronaut's activity_multiplier),
# capped by OCCUPANCY_BONUS_CAP.
OCCUPANCY_BONUS_PER_ASTRONAUT = 0.06
OCCUPANCY_BONUS_CAP = 0.3

# Fraction of the distance to the target allocation moved in a single
# plan, to avoid oscillating / absurd single-step jumps.
DAMPING_FACTOR = 0.5

# A module is always protected regardless of criticality_weight.
ALWAYS_PROTECTED_MODULE_IDS = {"medical_bay"}

# Minimum meaningful change worth surfacing as a reason (percentage points).
REASON_EPSILON = 1.0

_RISK_SEVERITY_VALUE = {"safe": 0.0, "watch": 0.4, "warning": 0.7, "critical": 1.0}


def _occupancy_stats(state: HabitatState) -> dict[str, tuple[int, float]]:
    """Per module: (astronaut_count, average_activity_multiplier)."""
    stats: dict[str, tuple[int, float]] = {module_id: (0, 0.0) for module_id in state.modules}
    sums: dict[str, list[float]] = {module_id: [] for module_id in state.modules}
    for astronaut in state.astronauts:
        if astronaut.current_location in sums:
            sums[astronaut.current_location].append(astronaut.activity_multiplier)
    for module_id, values in sums.items():
        if values:
            stats[module_id] = (len(values), sum(values) / len(values))
    return stats


def _effective_weight(criticality_weight: float, occupant_count: int, avg_activity: float) -> float:
    occupancy_bonus = min(OCCUPANCY_BONUS_CAP, OCCUPANCY_BONUS_PER_ASTRONAUT * occupant_count * avg_activity)
    return min(1.0, criticality_weight + occupancy_bonus)


def _protected_modules(state: HabitatState, occupancy: dict[str, tuple[int, float]]) -> set[str]:
    protected = set(ALWAYS_PROTECTED_MODULE_IDS) & set(state.modules)
    for module_id, (count, _avg) in occupancy.items():
        if count > 0:
            protected.add(module_id)
    return protected


def _resource_scarcity(
    state: HabitatState, predictions: dict[str, object]
) -> dict[str, float]:
    """
    0 (abundant) to 1 (at/below critical) scarcity index per resource,
    combining current reserve position with predicted shortage risk (if
    prediction data is available).
    """
    scarcity: dict[str, float] = {}
    for name in RESOURCE_NAMES:
        r = state.resources[name]
        usable_range = r.max_capacity - r.critical_threshold
        stability_frac = 1.0 - clamp(
            (r.current_level - r.critical_threshold) / usable_range if usable_range > 0 else 0.0, 0.0, 1.0
        )
        risk_frac = _RISK_SEVERITY_VALUE.get(predictions[name].risk_level, stability_frac)
        scarcity[name] = max(stability_frac, risk_frac)
    return scarcity


def _impossible_state(state: HabitatState, predictions: dict[str, object]) -> dict[str, bool]:
    """
    A resource is in an "impossible" state when it has already breached
    its own critical threshold. No reallocation lever available to this
    engine (percent-of-demand rationing) can conjure reserves that are
    already gone, so in this case even protected/life-critical modules
    are asked to ration down to their minimum-safe floor.
    """
    impossible: dict[str, bool] = {}
    for name in RESOURCE_NAMES:
        r = state.resources[name]
        impossible[name] = r.current_level <= r.critical_threshold
    return impossible


def _resource_dict(predictions_list) -> dict[str, object]:
    return {p.resource: p for p in predictions_list}


def _target_allocation(
    *,
    resource: str,
    min_safe: float,
    current: float,
    weight: float,
    scarcity: float,
    protected: bool,
    impossible: bool,
) -> tuple[float, str | None]:
    """Return (target_allocation, reason) for one module/resource pair."""
    ideal = min_safe + weight * (100.0 - min_safe)

    if impossible:
        target = min_safe
        if current - min_safe > REASON_EPSILON:
            return target, (
                f"{resource}: rationed down to minimum-safe ({min_safe:.0f}%) - {resource} reserves have "
                f"already breached critical threshold habitat-wide; even life-critical modules must ration"
            )
        return target, None

    if scarcity >= SCARCE_THRESHOLD:
        if protected:
            target = max(current, ideal)
            if target - current > REASON_EPSILON:
                return target, (
                    f"{resource}: increased toward {target:.0f}% - protected/occupied module prioritized "
                    f"during {resource} scarcity"
                )
            return current, None
        if weight < LOW_PRIORITY_WEIGHT_THRESHOLD:
            target = min_safe
            if current - min_safe > REASON_EPSILON:
                return target, (
                    f"{resource}: reduced to minimum-safe ({min_safe:.0f}%) - low-criticality module "
                    f"surrenders {resource} first during scarcity"
                )
            return current, None
        target = ideal
        if abs(target - current) > REASON_EPSILON:
            return target, (
                f"{resource}: adjusted toward criticality-weighted target ({target:.0f}%) amid "
                f"{resource} scarcity"
            )
        return current, None

    # Resource currently stable: nudge allocation toward the criticality-weighted
    # ideal so low-priority modules don't hoard headroom and high-priority
    # modules aren't left under-served.
    target = ideal
    if abs(target - current) > REASON_EPSILON:
        direction = "increased" if target > current else "reduced"
        return target, (
            f"{resource}: {direction} toward efficient target ({target:.0f}%) - {resource} supply is "
            f"currently stable"
        )
    return current, None


def generate_plan(state: HabitatState) -> OptimizationPlan:
    """Compute a reallocation plan from `state` without mutating it."""
    working = state.model_copy(deep=True)

    pre_prediction = compute_prediction(working)
    pre_predictions_by_name = _resource_dict(pre_prediction.resources)
    pre_sustainability = compute_sustainability_index(working)[0]

    occupancy = _occupancy_stats(working)
    protected_ids = _protected_modules(working, occupancy)
    scarcity = _resource_scarcity(working, pre_predictions_by_name)
    impossible = _impossible_state(working, pre_predictions_by_name)

    module_changes: list[ModuleAllocationChange] = []

    for module_id, module in working.modules.items():
        occupant_count, avg_activity = occupancy[module_id]
        weight = _effective_weight(module.criticality_weight, occupant_count, avg_activity)
        is_protected = module_id in protected_ids

        before = module.current_allocation.model_copy()
        after = module.current_allocation.model_copy()
        reasons: list[str] = []

        for resource in RESOURCE_NAMES:
            min_safe = getattr(module.minimum_safe_allocation, resource)
            current = getattr(module.current_allocation, resource)

            target, reason = _target_allocation(
                resource=resource,
                min_safe=min_safe,
                current=current,
                weight=weight,
                scarcity=scarcity[resource],
                protected=is_protected,
                impossible=impossible[resource],
            )

            # Damped step toward the target to avoid oscillating/absurd jumps,
            # then re-clamp to the module's safety floor and 100% ceiling.
            new_value = current + DAMPING_FACTOR * (target - current)
            new_value = round(clamp(new_value, min_safe, 100.0), 1)
            setattr(after, resource, new_value)

            if reason and abs(new_value - current) > 0.05:
                reasons.append(reason)

        module.current_allocation = after
        module_changes.append(
            ModuleAllocationChange(
                module_id=module_id,
                display_name=module.display_name,
                before=before,
                after=after,
                protected=is_protected,
                reasons=reasons,
            )
        )

    post_prediction = compute_prediction(working)
    post_predictions_by_name = _resource_dict(post_prediction.resources)
    post_sustainability = compute_sustainability_index(working)[0]

    predicted_effect = [
        ResourceEffect(
            resource=name,
            hours_to_critical_before=pre_predictions_by_name[name].hours_to_critical,
            hours_to_critical_after=post_predictions_by_name[name].hours_to_critical,
            risk_before=pre_predictions_by_name[name].risk_level,
            risk_after=post_predictions_by_name[name].risk_level,
        )
        for name in RESOURCE_NAMES
    ]

    unresolved_shortages = [
        name
        for name in RESOURCE_NAMES
        if post_predictions_by_name[name].risk_level in ("critical", "warning")
    ]

    summary: list[str] = []
    changed = [c for c in module_changes if c.reasons]
    if not changed:
        summary.append("All modules already sit at their efficient, criticality-weighted allocation targets.")
    else:
        for c in changed:
            summary.append(f"{c.display_name}: {'; '.join(c.reasons)}")
    if unresolved_shortages:
        summary.append(
            "Unresolved after reallocation: "
            + ", ".join(unresolved_shortages)
            + " remain at warning/critical risk even with maximum feasible rationing."
        )

    return OptimizationPlan(
        generated_at_tick=state.simulation.tick_count,
        applied=False,
        module_changes=module_changes,
        protected_modules=sorted(protected_ids),
        unresolved_shortages=unresolved_shortages,
        predicted_effect=predicted_effect,
        sustainability_before=pre_sustainability,
        sustainability_after=post_sustainability,
        sustainability_delta=round(post_sustainability - pre_sustainability, 1),
        summary=summary,
    )


def apply_plan(state: HabitatState, plan: OptimizationPlan) -> OptimizationPlan:
    """
    Apply `plan` to the live `state` in place. Each module's allocation is
    re-validated against its CURRENT minimum-safe allocation before being
    written, so a stale/hand-edited plan can never push a module below its
    safety floor or above 100%, even if the plan was computed earlier.
    """
    actual_changes: list[ModuleAllocationChange] = []

    for change in plan.module_changes:
        module = state.modules.get(change.module_id)
        if module is None:
            # The plan references a module id that no longer exists in the
            # live state (e.g. a stale/hand-edited plan from a previous
            # session). There's nothing to apply for it, so it's skipped
            # rather than raising - the rest of a valid plan should still
            # go through.
            continue

        before = module.current_allocation.model_copy()
        for resource in RESOURCE_NAMES:
            min_safe = getattr(module.minimum_safe_allocation, resource)
            proposed = getattr(change.after, resource)
            safe_value = round(clamp(proposed, min_safe, 100.0), 1)
            setattr(module.current_allocation, resource, safe_value)

        actual_changes.append(
            ModuleAllocationChange(
                module_id=change.module_id,
                display_name=module.display_name,
                before=before,
                after=module.current_allocation.model_copy(),
                protected=change.protected,
                reasons=change.reasons,
            )
        )

    return OptimizationPlan(
        generated_at_tick=state.simulation.tick_count,
        applied=True,
        module_changes=actual_changes,
        protected_modules=plan.protected_modules,
        unresolved_shortages=plan.unresolved_shortages,
        predicted_effect=plan.predicted_effect,
        sustainability_before=plan.sustainability_before,
        sustainability_after=plan.sustainability_after,
        sustainability_delta=plan.sustainability_delta,
        summary=plan.summary,
    )