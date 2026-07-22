"""
Pydantic data models for the ARES habitat simulation.

This file defines the SHAPE of the simulation state only.
No simulation, prediction, or optimization logic lives here.
"""

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """Output of GET /health."""

    status: str


class Resource(BaseModel):
    """A single global resource pool (oxygen, water, or energy).

    Note: these Field bounds are validated on construction (e.g. seed
    data, or a future request body) but NOT on later in-place mutation
    via plain attribute assignment (e.g. `resource.current_level = x`),
    since Pydantic v2 only validates on assignment if explicitly
    configured to. simulation.py and scenario.py rely on that existing,
    unvalidated-assignment behavior to keep working unchanged.
    """

    name: str
    unit: str
    current_level: float = Field(ge=0, description="Must be non-negative.")
    max_capacity: float = Field(gt=0, description="Must be positive; a zero-capacity resource is meaningless.")
    critical_threshold: float = Field(ge=0)  # below this level, the resource is in a critical state
    generation_rate: float = Field(ge=0)  # amount produced per simulated hour
    base_consumption_rate: float = Field(ge=0)  # baseline amount consumed per simulated hour


class ModuleResourceDemand(BaseModel):
    """How much of each resource a module demands, at full (100%) allocation."""

    oxygen: float = Field(ge=0)
    water: float = Field(ge=0)
    energy: float = Field(ge=0)


class ModuleAllocation(BaseModel):
    """Current vs. minimum-safe allocation percentages (0-100) per resource."""

    oxygen: float = Field(ge=0, le=100)
    water: float = Field(ge=0, le=100)
    energy: float = Field(ge=0, le=100)


class HabitatModule(BaseModel):
    """A single physical module within the habitat (e.g. greenhouse, medical bay)."""

    id: str
    display_name: str
    resource_demand: ModuleResourceDemand
    current_allocation: ModuleAllocation
    minimum_safe_allocation: ModuleAllocation
    criticality_weight: float = Field(
        ge=0, le=1, description="Relative importance (0-1) when optimization logic arbitrates tradeoffs."
    )
    status: str  # e.g. "nominal", "degraded", "critical", "offline"


class Astronaut(BaseModel):
    """A single crew member and their baseline resource demands."""

    id: str
    name: str
    role: str
    current_location: str = Field(min_length=1)  # module id where the astronaut currently is
    oxygen_demand_per_hour: float = Field(ge=0)
    water_demand_per_day: float = Field(ge=0)
    activity_multiplier: float = Field(gt=0)  # scales demand based on current activity level


class MoveAstronautRequest(BaseModel):
    """Input to POST /astronauts/{id}/move."""

    target_module: str = Field(min_length=1, description="Target module id; must be non-empty.")


class SimulationMeta(BaseModel):
    """Bookkeeping for the simulation clock."""

    tick_count: int
    elapsed_simulated_hours: float
    notes: str = "All values are illustrative simulation data, not real NASA figures."


class ActiveScenario(BaseModel):
    """
    Bookkeeping for a currently-active emergency scenario modifier, including
    the pre-scenario baseline values needed to cleanly restore state later
    via POST /scenario/clear.
    """

    scenario_id: str
    target_module: str | None = None
    triggered_at_tick: int
    numeric_baseline: dict[str, float]  # "kind:entity_id:field" -> original value
    status_baseline: dict[str, str]  # module_id -> original module.status


class HabitatState(BaseModel):
    """The full in-memory state of the lunar habitat simulation."""

    resources: dict[str, Resource]
    modules: dict[str, HabitatModule]
    astronauts: list[Astronaut]
    simulation: SimulationMeta
    active_scenarios: dict[str, ActiveScenario] = Field(default_factory=dict)


class TickRequest(BaseModel):
    """Optional input to POST /tick."""

    simulated_hours: float = Field(
        default=1.0,
        gt=0,
        le=100_000,
        description="Hours to advance the simulation by (0, 100000].",
    )


class TickResponse(BaseModel):
    """Result of advancing the simulation by one tick."""

    state: HabitatState
    resource_deltas: dict[str, float]  # net change in current_level per resource over this tick
    status_changes: list[str]  # human-readable notes on any resource/module status transitions


class SustainabilityComponentScores(BaseModel):
    """The four 0-100 sub-scores that make up the overall sustainability index."""

    resource_stability: float
    reserve_longevity: float
    allocation_efficiency: float
    emergency_resilience: float


class SustainabilityResponse(BaseModel):
    """Result of GET /sustainability."""

    overall_score: float
    classification: str  # "Thriving" | "Stable" | "Vulnerable" | "Critical"
    component_scores: SustainabilityComponentScores
    key_factors: list[str]  # short, human-readable notes on what is driving the score


class ResourcePrediction(BaseModel):
    """Shortage prediction for a single resource."""

    resource: str
    current_level: float
    critical_threshold: float
    net_rate_per_hour: float  # positive = growing, negative = depleting
    hours_to_critical: float | None  # None if not currently depleting
    risk_level: str  # "safe" | "watch" | "warning" | "critical"
    primary_factors: list[str]  # plain-language notes on what's driving the net rate


class PredictionResponse(BaseModel):
    """Result of GET /prediction."""

    resources: list[ResourcePrediction]
    nearest_shortage: str | None  # resource name with the soonest predicted critical crossing, if any
    hours_to_nearest_critical: float | None
    overall_risk: str  # the most severe risk_level across all resources


class ModuleAllocationChange(BaseModel):
    """Before/after allocation for a single module, with deterministic reasons."""

    module_id: str
    display_name: str
    before: ModuleAllocation
    after: ModuleAllocation
    protected: bool
    reasons: list[str]


class ResourceEffect(BaseModel):
    """Before/after outlook for a single resource, used to explain plan impact."""

    resource: str
    hours_to_critical_before: float | None
    hours_to_critical_after: float | None
    risk_before: str
    risk_after: str


class OptimizationPlan(BaseModel):
    """Result of POST /optimize/preview and POST /optimize/apply."""

    generated_at_tick: int
    applied: bool = False
    module_changes: list[ModuleAllocationChange]
    protected_modules: list[str]
    unresolved_shortages: list[str]
    predicted_effect: list[ResourceEffect]
    sustainability_before: float
    sustainability_after: float
    sustainability_delta: float
    summary: list[str]


class ApplyOptimizationRequest(BaseModel):
    """Optional input to POST /optimize/apply."""

    plan: OptimizationPlan | None = None


class ScenarioInfo(BaseModel):
    """Static metadata describing one available emergency scenario."""

    scenario_id: str
    name: str
    description: str
    requires_target_module: bool
    effect_summary: list[str]  # plain-language list of what the scenario modifies


class StateChange(BaseModel):
    """A single explicit state field change made by a scenario trigger/clear."""

    target: str  # e.g. "resource:energy" or "module:solar_farm"
    field: str  # e.g. "generation_rate" or "current_allocation.energy"
    before: float | str
    after: float | str
    note: str


class ScenarioTriggerRequest(BaseModel):
    """Input to POST /scenario/trigger."""

    scenario_id: str = Field(min_length=1)
    target_module: str | None = Field(default=None, min_length=1)


class ScenarioTriggerResponse(BaseModel):
    """Result of POST /scenario/trigger."""

    scenario_id: str
    target_module: str | None
    triggered_at_tick: int
    state_changes: list[StateChange]
    impact_summary: list[str]


class ScenarioClearRequest(BaseModel):
    """Input to POST /scenario/clear."""

    scenario_id: str = Field(min_length=1)


class ScenarioClearResponse(BaseModel):
    """Result of POST /scenario/clear."""

    scenario_id: str
    cleared_at_tick: int
    state_changes: list[StateChange]
    note: str