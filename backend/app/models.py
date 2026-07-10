"""
Pydantic data models for the ARES habitat simulation.

This file defines the SHAPE of the simulation state only.
No simulation, prediction, or optimization logic lives here.
"""

from pydantic import BaseModel, Field


class Resource(BaseModel):
    """A single global resource pool (oxygen, water, or energy)."""

    name: str
    unit: str
    current_level: float
    max_capacity: float
    critical_threshold: float  # below this level, the resource is in a critical state
    generation_rate: float  # amount produced per simulated hour
    base_consumption_rate: float  # baseline amount consumed per simulated hour


class ModuleResourceDemand(BaseModel):
    """How much of each resource a module demands, at full (100%) allocation."""

    oxygen: float
    water: float
    energy: float


class ModuleAllocation(BaseModel):
    """Current vs. minimum-safe allocation percentages (0-100) per resource."""

    oxygen: float
    water: float
    energy: float


class HabitatModule(BaseModel):
    """A single physical module within the habitat (e.g. greenhouse, medical bay)."""

    id: str
    display_name: str
    resource_demand: ModuleResourceDemand
    current_allocation: ModuleAllocation
    minimum_safe_allocation: ModuleAllocation
    criticality_weight: float  # relative importance when future optimization logic arbitrates tradeoffs
    status: str  # e.g. "nominal", "degraded", "critical", "offline"


class Astronaut(BaseModel):
    """A single crew member and their baseline resource demands."""

    id: str
    name: str
    role: str
    current_location: str  # module id where the astronaut currently is
    oxygen_demand_per_hour: float
    water_demand_per_day: float
    activity_multiplier: float  # scales demand based on current activity level


class SimulationMeta(BaseModel):
    """Bookkeeping for the simulation clock."""

    tick_count: int
    elapsed_simulated_hours: float
    notes: str = "All values are illustrative simulation data, not real NASA figures."


class HabitatState(BaseModel):
    """The full in-memory state of the lunar habitat simulation."""

    resources: dict[str, Resource]
    modules: dict[str, HabitatModule]
    astronauts: list[Astronaut]
    simulation: SimulationMeta


class TickRequest(BaseModel):
    """Optional input to POST /tick."""

    simulated_hours: float = Field(default=1.0, gt=0, description="Hours to advance the simulation by.")


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



