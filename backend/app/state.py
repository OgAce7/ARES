"""
In-memory state management for the ARES habitat simulation.

Holds the single source of truth (HabitatState) for the running process,
plus the seed data used to build/reset it. No persistence, no database —
this is intentionally simple for a hackathon build. Future simulation,
prediction, and optimization modules are expected to import
`habitat_state` and mutate it directly (or via helper functions added
here later).
"""

from app.models import (
    Astronaut,
    HabitatModule,
    HabitatState,
    ModuleAllocation,
    ModuleResourceDemand,
    Resource,
    SimulationMeta,
)


def _seed_resources() -> dict[str, Resource]:
    """Believable but explicitly simulated starting resource pools."""
    return {
        "oxygen": Resource(
            name="oxygen",
            unit="kPa_equivalent_liters",
            current_level=850.0,
            max_capacity=1000.0,
            critical_threshold=200.0,
            generation_rate=45.0,
            base_consumption_rate=38.0,
        ),
        "water": Resource(
            name="water",
            unit="liters",
            current_level=2200.0,
            max_capacity=3000.0,
            critical_threshold=500.0,
            generation_rate=60.0,
            base_consumption_rate=55.0,
        ),
        "energy": Resource(
            name="energy",
            unit="kWh",
            current_level=420.0,
            max_capacity=600.0,
            critical_threshold=100.0,
            generation_rate=75.0,
            base_consumption_rate=68.0,
        ),
    }


def _seed_modules() -> dict[str, HabitatModule]:
    """Believable but explicitly simulated starting habitat modules."""

    def module(
        id_: str,
        name: str,
        demand: tuple[float, float, float],
        current_alloc: tuple[float, float, float],
        min_alloc: tuple[float, float, float],
        weight: float,
        status: str,
    ) -> HabitatModule:
        return HabitatModule(
            id=id_,
            display_name=name,
            resource_demand=ModuleResourceDemand(
                oxygen=demand[0], water=demand[1], energy=demand[2]
            ),
            current_allocation=ModuleAllocation(
                oxygen=current_alloc[0], water=current_alloc[1], energy=current_alloc[2]
            ),
            minimum_safe_allocation=ModuleAllocation(
                oxygen=min_alloc[0], water=min_alloc[1], energy=min_alloc[2]
            ),
            criticality_weight=weight,
            status=status,
        )

    return {
        "habitat_alpha": module(
            "habitat_alpha", "Habitat Module Alpha",
            demand=(12.0, 10.0, 15.0), current_alloc=(100.0, 100.0, 100.0),
            min_alloc=(60.0, 60.0, 50.0), weight=0.9, status="nominal",
        ),
        "habitat_beta": module(
            "habitat_beta", "Habitat Module Beta",
            demand=(12.0, 10.0, 15.0), current_alloc=(100.0, 100.0, 100.0),
            min_alloc=(60.0, 60.0, 50.0), weight=0.9, status="nominal",
        ),
        "medical_bay": module(
            "medical_bay", "Medical Bay",
            demand=(8.0, 6.0, 10.0), current_alloc=(100.0, 100.0, 100.0),
            min_alloc=(80.0, 70.0, 70.0), weight=1.0, status="nominal",
        ),
        "research_lab": module(
            "research_lab", "Research Laboratory",
            demand=(6.0, 4.0, 20.0), current_alloc=(90.0, 90.0, 85.0),
            min_alloc=(30.0, 20.0, 20.0), weight=0.5, status="nominal",
        ),
        "greenhouse": module(
            "greenhouse", "Greenhouse",
            demand=(5.0, 15.0, 12.0), current_alloc=(100.0, 100.0, 100.0),
            min_alloc=(40.0, 60.0, 40.0), weight=0.8, status="nominal",
        ),
        "council": module(
            "council", "Council Chamber",
            demand=(4.0, 2.0, 6.0), current_alloc=(80.0, 80.0, 80.0),
            min_alloc=(20.0, 10.0, 20.0), weight=0.3, status="nominal",
        ),
        "solar_farm": module(
            "solar_farm", "Solar Farm",
            demand=(2.0, 1.0, 0.0), current_alloc=(100.0, 100.0, 100.0),
            min_alloc=(50.0, 50.0, 0.0), weight=0.95, status="nominal",
        ),
        "water_recycler": module(
            "water_recycler", "Water Recycler",
            demand=(3.0, 0.0, 18.0), current_alloc=(100.0, 100.0, 100.0),
            min_alloc=(50.0, 0.0, 50.0), weight=0.95, status="nominal",
        ),
    }


def _seed_astronauts() -> list[Astronaut]:
    """Four fictional crew members with baseline demand figures."""
    return [
        Astronaut(
            id="astro_01",
            name="Mira Solano",
            role="Commander",
            current_location="council",
            oxygen_demand_per_hour=0.84,
            water_demand_per_day=3.5,
            activity_multiplier=1.0,
        ),
        Astronaut(
            id="astro_02",
            name="Jonas Ekwueme",
            role="Botanist",
            current_location="greenhouse",
            oxygen_demand_per_hour=0.9,
            water_demand_per_day=3.8,
            activity_multiplier=1.2,
        ),
        Astronaut(
            id="astro_03",
            name="Priya Nakamura",
            role="Medical Officer",
            current_location="medical_bay",
            oxygen_demand_per_hour=0.82,
            water_demand_per_day=3.4,
            activity_multiplier=0.9,
        ),
        Astronaut(
            id="astro_04",
            name="Theo Kastrinos",
            role="Systems Engineer",
            current_location="solar_farm",
            oxygen_demand_per_hour=0.88,
            water_demand_per_day=3.6,
            activity_multiplier=1.1,
        ),
    ]


def build_initial_state() -> HabitatState:
    """Construct a fresh HabitatState from seed data."""
    return HabitatState(
        resources=_seed_resources(),
        modules=_seed_modules(),
        astronauts=_seed_astronauts(),
        simulation=SimulationMeta(tick_count=0, elapsed_simulated_hours=0.0),
    )


# Single in-memory instance shared across the running process.
habitat_state: HabitatState = build_initial_state()


def reset_state() -> HabitatState:
    """Reset the shared in-memory state back to seed values."""
    global habitat_state
    habitat_state = build_initial_state()
    return habitat_state