"""
Controlled emergency scenario engine for ARES.

Exactly three deterministic scenarios are supported:
    - solar_flare
    - water_recycler_failure
    - habitat_breach

Triggering a scenario mutates explicit HabitatState fields (resource
generation/consumption rates, a module's own allocation percentages, and/or
a module's status) that the existing tick/prediction/sustainability engines
already read. Those systems are NOT modified here and are NOT called with
fake results — they simply react naturally to the changed state on their
next read/tick, exactly as they would to any other state change.

Every scenario trigger snapshots the exact fields it is about to change
into `HabitatState.active_scenarios[scenario_id]`, so `clear_scenario` can
restore precisely those fields to their pre-scenario values without
resetting the rest of the habitat (astronaut positions, tick count, other
modules' allocations, etc. are left untouched).

No randomness: each scenario's effect size is a fixed constant, so
triggering the same scenario from the same state always produces the same
change.
"""

from app.models import ActiveScenario, HabitatState, ScenarioInfo, StateChange


class ScenarioError(ValueError):
    """Base class for all scenario-engine errors. Subclasses ValueError so
    any existing `except ValueError` call site keeps working unchanged."""


class UnknownScenarioError(ScenarioError):
    """`scenario_id` is not one of the recognized scenarios in the catalog."""


class ScenarioAlreadyActiveError(ScenarioError):
    """The scenario is already active; it must be cleared before it can be re-triggered."""


class ScenarioNotActiveError(ScenarioError):
    """There is no active instance of this scenario to clear."""


class ScenarioModuleConflictError(ScenarioError):
    """Another currently-active scenario already holds an explicit status
    override on the module this trigger would target."""


class InvalidTargetModuleError(ScenarioError):
    """The provided (or default) target_module does not exist."""


# --- solar_flare constants ---
SOLAR_FLARE_GENERATION_MULTIPLIER = 0.15  # baseline energy generation collapses to 15% of its prior value
SOLAR_FLARE_CONSUMPTION_MULTIPLIER = 1.10  # +10% baseline draw: protective load-shedding/instability response
SOLAR_FLARE_FARM_ALLOCATION_CAP = 15.0  # solar_farm's own energy allocation collapses to at most this %

# --- water_recycler_failure constants ---
WATER_FAILURE_GENERATION_MULTIPLIER = 0.25  # baseline water generation drops to 25% of its prior value
WATER_FAILURE_RECYCLER_ALLOCATION_CAP = 5.0  # water_recycler's own water allocation collapses to at most this %
WATER_FAILURE_MODULE_STATUS = "critical"  # the recycler itself is flagged critical (allocation-based status logic won't catch a 0-floor module)

# --- habitat_breach constants ---
BREACH_OXYGEN_CONSUMPTION_DELTA = 30.0  # extra oxygen/hour lost to vacuum, added to baseline consumption
BREACH_MODULE_OXYGEN_ALLOCATION_CAP = 10.0  # affected module's own oxygen allocation collapses to at most this %
BREACH_MODULE_STATUS = "critical"
DEFAULT_BREACH_MODULE = "habitat_alpha"  # used only if no target_module is supplied


SCENARIO_CATALOG: dict[str, ScenarioInfo] = {
    "solar_flare": ScenarioInfo(
        scenario_id="solar_flare",
        name="Solar Flare",
        description=(
            "A solar flare damages photovoltaic capacity, sharply cutting energy generation "
            "and adding load-shedding instability. Does not directly affect oxygen or water."
        ),
        requires_target_module=False,
        effect_summary=[
            f"energy.generation_rate scaled by {SOLAR_FLARE_GENERATION_MULTIPLIER}",
            f"energy.base_consumption_rate scaled by {SOLAR_FLARE_CONSUMPTION_MULTIPLIER} (instability draw)",
            f"solar_farm.current_allocation.energy capped at {SOLAR_FLARE_FARM_ALLOCATION_CAP}%",
        ],
    ),
    "water_recycler_failure": ScenarioInfo(
        scenario_id="water_recycler_failure",
        name="Water Recycler Failure",
        description=(
            "The water recycler malfunctions: baseline water generation drops and the "
            "recycler's own recovery contribution is nearly disabled, raising projected "
            "water shortage risk."
        ),
        requires_target_module=False,
        effect_summary=[
            f"water.generation_rate scaled by {WATER_FAILURE_GENERATION_MULTIPLIER}",
            f"water_recycler.current_allocation.water capped at {WATER_FAILURE_RECYCLER_ALLOCATION_CAP}%",
            f"water_recycler.status set to '{WATER_FAILURE_MODULE_STATUS}'",
        ],
    ),
    "habitat_breach": ScenarioInfo(
        scenario_id="habitat_breach",
        name="Habitat Breach",
        description=(
            "A hull breach in one module causes atmosphere loss: habitat-wide oxygen "
            "consumption rises and the affected module's own oxygen allocation and status "
            "are downgraded."
        ),
        requires_target_module=True,
        effect_summary=[
            f"oxygen.base_consumption_rate increased by {BREACH_OXYGEN_CONSUMPTION_DELTA} units/hour",
            f"<target_module>.current_allocation.oxygen capped at {BREACH_MODULE_OXYGEN_ALLOCATION_CAP}%",
            f"<target_module>.status set to '{BREACH_MODULE_STATUS}'",
        ],
    ),
}


def list_scenarios() -> list[ScenarioInfo]:
    return list(SCENARIO_CATALOG.values())


# --- generic numeric field get/set, keyed "kind:entity_id:field" ---


def _get_numeric(state: HabitatState, key: str) -> float:
    kind, entity_id, field = key.split(":", 2)
    if kind == "resource":
        return getattr(state.resources[entity_id], field)
    if kind == "module":
        if field.startswith("current_allocation."):
            sub = field.split(".", 1)[1]
            return getattr(state.modules[entity_id].current_allocation, sub)
        return getattr(state.modules[entity_id], field)
    raise ValueError(f"unknown state-change kind: {kind}")


def _set_numeric(state: HabitatState, key: str, value: float) -> None:
    kind, entity_id, field = key.split(":", 2)
    if kind == "resource":
        setattr(state.resources[entity_id], field, value)
        return
    if kind == "module":
        if field.startswith("current_allocation."):
            sub = field.split(".", 1)[1]
            setattr(state.modules[entity_id].current_allocation, sub, value)
            return
        setattr(state.modules[entity_id], field, value)
        return
    raise ValueError(f"unknown state-change kind: {kind}")


def _apply_numeric(
    state: HabitatState,
    key: str,
    new_value: float,
    note: str,
    changes: list[StateChange],
    baseline: dict[str, float],
) -> None:
    """Snapshot the current value into `baseline`, then set the new value."""
    kind, entity_id, field = key.split(":", 2)
    old_value = _get_numeric(state, key)
    baseline[key] = old_value
    new_value = round(new_value, 2)
    changes.append(
        StateChange(target=f"{kind}:{entity_id}", field=field, before=old_value, after=new_value, note=note)
    )
    _set_numeric(state, key, new_value)


def _apply_status(
    state: HabitatState,
    module_id: str,
    new_status: str,
    note: str,
    changes: list[StateChange],
    status_baseline: dict[str, str],
) -> None:
    module = state.modules[module_id]
    old_status = module.status
    status_baseline[module_id] = old_status
    changes.append(
        StateChange(target=f"module:{module_id}", field="status", before=old_status, after=new_status, note=note)
    )
    module.status = new_status


# --- per-scenario trigger implementations ---


def _trigger_solar_flare(state: HabitatState) -> tuple[dict[str, float], dict[str, str], list[StateChange], list[str]]:
    numeric_baseline: dict[str, float] = {}
    status_baseline: dict[str, str] = {}
    changes: list[StateChange] = []

    r = state.resources["energy"]
    _apply_numeric(
        state, "resource:energy:generation_rate",
        r.generation_rate * SOLAR_FLARE_GENERATION_MULTIPLIER,
        "Solar flare damages photovoltaic capacity, sharply cutting baseline energy generation.",
        changes, numeric_baseline,
    )
    r = state.resources["energy"]  # re-fetch after mutation for the next baseline capture
    _apply_numeric(
        state, "resource:energy:base_consumption_rate",
        r.base_consumption_rate * SOLAR_FLARE_CONSUMPTION_MULTIPLIER,
        "Protective load-shedding and grid instability increase baseline energy draw.",
        changes, numeric_baseline,
    )

    if "solar_farm" in state.modules:
        sf = state.modules["solar_farm"]
        capped = min(sf.current_allocation.energy, SOLAR_FLARE_FARM_ALLOCATION_CAP)
        _apply_numeric(
            state, "module:solar_farm:current_allocation.energy", capped,
            "Solar farm panels are damaged; its own energy allocation collapses, "
            "reducing the facility generation bonus it contributes.",
            changes, numeric_baseline,
        )

    impact_summary = [
        "Energy baseline generation cut to roughly 15% of its prior value.",
        "Baseline energy consumption up ~10% from protective load-shedding.",
        "Solar farm's own energy allocation capped low, further reducing its generation bonus.",
        "Oxygen and water are not directly modified by this scenario.",
    ]
    return numeric_baseline, status_baseline, changes, impact_summary


def _trigger_water_recycler_failure(
    state: HabitatState,
) -> tuple[dict[str, float], dict[str, str], list[StateChange], list[str]]:
    numeric_baseline: dict[str, float] = {}
    status_baseline: dict[str, str] = {}
    changes: list[StateChange] = []

    r = state.resources["water"]
    _apply_numeric(
        state, "resource:water:generation_rate",
        r.generation_rate * WATER_FAILURE_GENERATION_MULTIPLIER,
        "Water recycler malfunction sharply cuts baseline water generation.",
        changes, numeric_baseline,
    )

    if "water_recycler" in state.modules:
        wr = state.modules["water_recycler"]
        capped = min(wr.current_allocation.water, WATER_FAILURE_RECYCLER_ALLOCATION_CAP)
        _apply_numeric(
            state, "module:water_recycler:current_allocation.water", capped,
            "Recycler's own water allocation collapses, disabling nearly all of its recovery bonus.",
            changes, numeric_baseline,
        )
        _apply_status(
            state, "water_recycler", WATER_FAILURE_MODULE_STATUS,
            "Recycler flagged critical: its allocation floor is 0%, so allocation-based "
            "status logic alone would not otherwise surface this failure.",
            changes, status_baseline,
        )

    impact_summary = [
        "Water baseline generation cut to roughly 25% of its prior value.",
        "Water recycler's own water allocation collapsed, disabling almost all of its recovery bonus.",
        "Water recycler module explicitly flagged critical.",
        "Net water balance is now driven far more negative; prediction/sustainability will reflect "
        "the increased shortage risk on their next read.",
    ]
    return numeric_baseline, status_baseline, changes, impact_summary


def _trigger_habitat_breach(
    state: HabitatState, target_module: str | None
) -> tuple[dict[str, float], dict[str, str], list[StateChange], list[str], str]:
    resolved_target = target_module or DEFAULT_BREACH_MODULE
    if resolved_target not in state.modules:
        valid = ", ".join(sorted(state.modules))
        raise InvalidTargetModuleError(
            f"Unknown target_module '{resolved_target}'. Valid modules: {valid}."
        )

    numeric_baseline: dict[str, float] = {}
    status_baseline: dict[str, str] = {}
    changes: list[StateChange] = []

    r = state.resources["oxygen"]
    _apply_numeric(
        state, "resource:oxygen:base_consumption_rate",
        r.base_consumption_rate + BREACH_OXYGEN_CONSUMPTION_DELTA,
        f"Hull breach in '{resolved_target}' vents atmosphere, raising habitat-wide oxygen consumption.",
        changes, numeric_baseline,
    )

    module = state.modules[resolved_target]
    capped = min(module.current_allocation.oxygen, BREACH_MODULE_OXYGEN_ALLOCATION_CAP)
    _apply_numeric(
        state, f"module:{resolved_target}:current_allocation.oxygen", capped,
        "Breached module's own oxygen allocation collapses as its life-support seal is compromised.",
        changes, numeric_baseline,
    )
    _apply_status(
        state, resolved_target, BREACH_MODULE_STATUS,
        "Module explicitly flagged critical due to active hull breach.",
        changes, status_baseline,
    )

    impact_summary = [
        f"Breach localized to module '{resolved_target}'.",
        "Habitat-wide oxygen baseline consumption increased to represent atmosphere venting to vacuum.",
        f"'{resolved_target}' oxygen allocation collapsed and its status set to '{BREACH_MODULE_STATUS}'.",
        "Water and energy are not directly modified by this scenario.",
    ]
    return numeric_baseline, status_baseline, changes, impact_summary, resolved_target


def _status_target_module(
    state: HabitatState, scenario_id: str, target_module: str | None
) -> str | None:
    """
    The single module id (if any) that `scenario_id` would apply an
    explicit `status` override to, without actually mutating anything.
    Returns None if the scenario doesn't touch module status, or if its
    target module isn't a real module (that case is reported by the
    scenario's own trigger function with a clearer error).
    """
    if scenario_id == "water_recycler_failure":
        return "water_recycler" if "water_recycler" in state.modules else None
    if scenario_id == "habitat_breach":
        candidate = target_module or DEFAULT_BREACH_MODULE
        return candidate if candidate in state.modules else None
    return None  # solar_flare never sets an explicit module status


def trigger_scenario(
    state: HabitatState, scenario_id: str, target_module: str | None = None
):
    """
    Trigger `scenario_id` against the live `state`, mutating it in place.
    Returns (target_module_used, state_changes, impact_summary).

    Raises:
        UnknownScenarioError: `scenario_id` is not in the catalog.
        ScenarioAlreadyActiveError: `scenario_id` is already active.
        ScenarioModuleConflictError: the target module's status is already
            overridden by a different active scenario.
        InvalidTargetModuleError: (habitat_breach only) the target module
            does not exist.
    All of the above subclass ValueError, so existing `except ValueError`
    call sites keep working unchanged even without catching the specific
    subclasses.
    """
    if scenario_id not in SCENARIO_CATALOG:
        valid = ", ".join(sorted(SCENARIO_CATALOG))
        raise UnknownScenarioError(f"Unknown scenario_id '{scenario_id}'. Valid scenario ids: {valid}.")
    if scenario_id in state.active_scenarios:
        raise ScenarioAlreadyActiveError(
            f"Scenario '{scenario_id}' is already active; clear it before re-triggering."
        )

    # Two active scenarios must never both hold an explicit status
    # override on the same module (e.g. habitat_breach targeting
    # 'water_recycler' while water_recycler_failure is already active):
    # the second scenario to trigger would snapshot the FIRST scenario's
    # already-modified status as its own "pre-scenario baseline", so
    # clearing them later could restore the wrong value or leave the
    # module stuck at the wrong status. Reject the trigger instead.
    status_target = _status_target_module(state, scenario_id, target_module)
    if status_target is not None:
        for other_id, other_active in state.active_scenarios.items():
            if status_target in other_active.status_baseline:
                raise ScenarioModuleConflictError(
                    f"Module '{status_target}' already has an active emergency status "
                    f"override from scenario '{other_id}'; clear it before triggering "
                    f"'{scenario_id}' against the same module."
                )

    resolved_target = target_module

    if scenario_id == "solar_flare":
        numeric_baseline, status_baseline, changes, impact_summary = _trigger_solar_flare(state)
    elif scenario_id == "water_recycler_failure":
        numeric_baseline, status_baseline, changes, impact_summary = _trigger_water_recycler_failure(state)
    elif scenario_id == "habitat_breach":
        numeric_baseline, status_baseline, changes, impact_summary, resolved_target = _trigger_habitat_breach(
            state, target_module
        )
    else:  # pragma: no cover - guarded above
        raise UnknownScenarioError(f"Unhandled scenario_id '{scenario_id}'.")

    state.active_scenarios[scenario_id] = ActiveScenario(
        scenario_id=scenario_id,
        target_module=resolved_target,
        triggered_at_tick=state.simulation.tick_count,
        numeric_baseline=numeric_baseline,
        status_baseline=status_baseline,
    )

    return resolved_target, changes, impact_summary


def clear_scenario(state: HabitatState, scenario_id: str) -> list[StateChange]:
    """
    Restore the exact fields modified by `scenario_id` back to their
    pre-trigger values, then deactivate it. Does not touch any other
    scenario or any unrelated habitat state.

    Raises:
        UnknownScenarioError: `scenario_id` is not in the catalog at all.
        ScenarioNotActiveError: `scenario_id` is a real scenario but has no
            active instance to clear.
    Both subclass ValueError, so existing `except ValueError` call sites
    keep working unchanged even without catching the specific subclasses.
    """
    if scenario_id not in SCENARIO_CATALOG:
        valid = ", ".join(sorted(SCENARIO_CATALOG))
        raise UnknownScenarioError(f"Unknown scenario_id '{scenario_id}'. Valid scenario ids: {valid}.")

    active = state.active_scenarios.get(scenario_id)
    if active is None:
        raise ScenarioNotActiveError(f"Scenario '{scenario_id}' is not currently active; nothing to clear.")

    changes: list[StateChange] = []

    for key, original_value in active.numeric_baseline.items():
        kind, entity_id, field = key.split(":", 2)
        current_value = _get_numeric(state, key)
        changes.append(
            StateChange(
                target=f"{kind}:{entity_id}", field=field,
                before=current_value, after=original_value,
                note="Restored to its pre-scenario baseline value.",
            )
        )
        _set_numeric(state, key, original_value)

    for module_id, original_status in active.status_baseline.items():
        current_status = state.modules[module_id].status
        changes.append(
            StateChange(
                target=f"module:{module_id}", field="status",
                before=current_status, after=original_status,
                note="Restored to its pre-scenario status.",
            )
        )
        state.modules[module_id].status = original_status

    del state.active_scenarios[scenario_id]
    return changes