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
