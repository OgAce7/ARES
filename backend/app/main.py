"""
ARES backend entrypoint.

Exposes:
  GET  /health             - liveness check
  GET  /state              - current in-memory habitat state
  POST /reset               - reset habitat state to seed values
  POST /astronauts/{id}/move - relocate an astronaut to a different module
  POST /tick                 - advance the simulation by N simulated hours (default 1)
  GET  /sustainability     - Habitat Sustainability Index (0-100) for current state
  GET  /prediction          - emergency shortage prediction per resource
  POST /optimize/preview    - proposed reallocation plan, state unchanged
  POST /optimize/apply      - apply a plan (given or freshly computed) to live state

Scenario injection, persistence, and LLM logic still live outside this
file — this is the state + tick + sustainability + prediction +
allocation foundation those future modules will build on.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.models import (
    ApplyOptimizationRequest,
    HabitatState,
    HealthResponse,
    MoveAstronautRequest,
    OptimizationPlan,
    PredictionResponse,
    ScenarioClearRequest,
    ScenarioClearResponse,
    ScenarioInfo,
    ScenarioTriggerRequest,
    ScenarioTriggerResponse,
    SustainabilityResponse,
    TickRequest,
    TickResponse,
)
from app.optimization import apply_plan, generate_plan
from app.prediction import compute_prediction
from app.scenario import (
    ScenarioAlreadyActiveError,
    ScenarioModuleConflictError,
    ScenarioNotActiveError,
    clear_scenario,
    list_scenarios,
    trigger_scenario,
)
from app.simulation import run_tick
from app.state import habitat_state, reset_state, state_lock
from app.sustainability import compute_sustainability_index

app = FastAPI(
    title="ARES Habitat Simulation Backend",
    description="Autonomous Resource Equilibrium System - habitat state foundation.",
    version="0.1.0",
)

# Allow the local React/Vite frontend (default dev port) to call this API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
        "http://localhost:5176",
        "http://127.0.0.1:5176",

        # Production
        "https://ares-alpha.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_origin_regex=r"https://.*\.vercel\.app"
)

@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@app.get("/state", response_model=HabitatState)
def get_state() -> HabitatState:
    with state_lock:
        return habitat_state.model_copy(deep=True)


@app.post("/reset", response_model=HabitatState)
def reset() -> HabitatState:
    with state_lock:
        return reset_state().model_copy(deep=True)


@app.post(
    "/astronauts/{astronaut_id}/move",
    response_model=HabitatState,
    responses={
        404: {"description": "No astronaut exists with the given id."},
        400: {"description": "target_module does not name an existing module."},
        422: {"description": "target_module is missing or empty."},
    },
)
def move_astronaut(astronaut_id: str, request: MoveAstronautRequest) -> HabitatState:
    """
    Relocate a single astronaut to a different habitat module.

    This only updates `Astronaut.current_location`. It does not move any
    resources itself — the next POST /tick naturally reflects the change,
    since `run_tick`'s occupancy-load calculation reads each astronaut's
    current_location fresh every tick (see simulation.py::_occupancy_loads).
    """
    with state_lock:
        astronaut = next((a for a in habitat_state.astronauts if a.id == astronaut_id), None)
        if astronaut is None:
            raise HTTPException(status_code=404, detail=f"Astronaut '{astronaut_id}' not found.")

        if request.target_module not in habitat_state.modules:
            valid = ", ".join(sorted(habitat_state.modules))
            raise HTTPException(
                status_code=400,
                detail=f"Unknown target_module '{request.target_module}'. Valid modules: {valid}.",
            )

        astronaut.current_location = request.target_module
        return habitat_state.model_copy(deep=True)


@app.post(
    "/tick",
    response_model=TickResponse,
    responses={422: {"description": "simulated_hours must be > 0 and <= 100000."}},
)
def tick(request: TickRequest | None = None) -> TickResponse:
    simulated_hours = request.simulated_hours if request else 1.0
    with state_lock:
        updated_state, resource_deltas, status_changes = run_tick(habitat_state, simulated_hours)
        return TickResponse(
            state=updated_state.model_copy(deep=True),
            resource_deltas=resource_deltas,
            status_changes=status_changes,
        )


@app.get("/sustainability", response_model=SustainabilityResponse)
def sustainability() -> SustainabilityResponse:
    with state_lock:
        overall_score, classification, component_scores, key_factors = compute_sustainability_index(habitat_state)
        return SustainabilityResponse(
            overall_score=overall_score,
            classification=classification,
            component_scores=component_scores,
            key_factors=key_factors,
        )


@app.get("/prediction", response_model=PredictionResponse)
def prediction() -> PredictionResponse:
    with state_lock:
        return compute_prediction(habitat_state)


@app.post("/optimize/preview", response_model=OptimizationPlan)
def optimize_preview() -> OptimizationPlan:
    """Compute a reallocation plan without mutating state."""
    with state_lock:
        return generate_plan(habitat_state)


@app.post("/optimize/apply", response_model=OptimizationPlan)
def optimize_apply(request: ApplyOptimizationRequest | None = None) -> OptimizationPlan:
    """
    Apply a reallocation plan to live state. If a plan is supplied in the
    request body (e.g. one previously returned by /optimize/preview), it
    is applied as-is (after re-validating against current minimum-safe
    allocations). Otherwise a fresh plan is computed from current state
    and applied immediately.
    """
    with state_lock:
        plan = request.plan if request and request.plan else generate_plan(habitat_state)
        return apply_plan(habitat_state, plan)


@app.get("/scenarios", response_model=list[ScenarioInfo])
def scenarios() -> list[ScenarioInfo]:
    """Metadata for the three available emergency scenarios."""
    return list_scenarios()


@app.post(
    "/scenario/trigger",
    response_model=ScenarioTriggerResponse,
    responses={
        400: {"description": "Unknown scenario_id, or (habitat_breach) an unknown target_module."},
        409: {
            "description": (
                "The scenario is already active, or its target module's status is already "
                "overridden by a different active scenario."
            )
        },
        422: {"description": "scenario_id or target_module is missing or empty."},
    },
)
def scenario_trigger(request: ScenarioTriggerRequest) -> ScenarioTriggerResponse:
    """
    Trigger one of the three controlled emergency scenarios. Mutates
    explicit state fields in place; existing simulation, prediction, and
    sustainability logic will react to the changed state on their own.
    """
    with state_lock:
        try:
            resolved_target, state_changes, impact_summary = trigger_scenario(
                habitat_state, request.scenario_id, request.target_module
            )
        except (ScenarioAlreadyActiveError, ScenarioModuleConflictError) as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        return ScenarioTriggerResponse(
            scenario_id=request.scenario_id,
            target_module=resolved_target,
            triggered_at_tick=habitat_state.simulation.tick_count,
            state_changes=state_changes,
            impact_summary=impact_summary,
        )


@app.post(
    "/scenario/clear",
    response_model=ScenarioClearResponse,
    responses={
        400: {"description": "Unknown scenario_id."},
        409: {"description": "The scenario is recognized but is not currently active."},
        422: {"description": "scenario_id is missing or empty."},
    },
)
def scenario_clear(request: ScenarioClearRequest) -> ScenarioClearResponse:
    """
    Restore the state fields modified by a previously-triggered scenario
    back to their pre-scenario values, without resetting the rest of the
    habitat.
    """
    with state_lock:
        try:
            state_changes = clear_scenario(habitat_state, request.scenario_id)
        except ScenarioNotActiveError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        return ScenarioClearResponse(
            scenario_id=request.scenario_id,
            cleared_at_tick=habitat_state.simulation.tick_count,
            state_changes=state_changes,
            note=f"Scenario '{request.scenario_id}' cleared; affected fields restored to their pre-scenario values.",
        )