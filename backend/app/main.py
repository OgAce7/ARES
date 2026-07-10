"""
ARES backend entrypoint.

Exposes:
  GET  /health             - liveness check
  GET  /state              - current in-memory habitat state
  POST /reset               - reset habitat state to seed values
  POST /tick                 - advance the simulation by N simulated hours (default 1)
  GET  /sustainability     - Habitat Sustainability Index (0-100) for current state
  GET  /prediction          - emergency shortage prediction per resource
  POST /optimize/preview    - proposed reallocation plan, state unchanged
  POST /optimize/apply      - apply a plan (given or freshly computed) to live state

Scenario injection, persistence, and LLM logic still live outside this
file — this is the state + tick + sustainability + prediction +
allocation foundation those future modules will build on.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.models import (
    ApplyOptimizationRequest,
    HabitatState,
    OptimizationPlan,
    PredictionResponse,
    SustainabilityResponse,
    TickRequest,
    TickResponse,
)
from app.optimization import apply_plan, generate_plan
from app.prediction import compute_prediction
from app.simulation import run_tick
from app.state import habitat_state, reset_state
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
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/state", response_model=HabitatState)
def get_state() -> HabitatState:
    return habitat_state


@app.post("/reset", response_model=HabitatState)
def reset() -> HabitatState:
    return reset_state()


@app.post("/tick", response_model=TickResponse)
def tick(request: TickRequest | None = None) -> TickResponse:
    simulated_hours = request.simulated_hours if request else 1.0
    updated_state, resource_deltas, status_changes = run_tick(habitat_state, simulated_hours)
    return TickResponse(
        state=updated_state,
        resource_deltas=resource_deltas,
        status_changes=status_changes,
    )


@app.get("/sustainability", response_model=SustainabilityResponse)
def sustainability() -> SustainabilityResponse:
    overall_score, classification, component_scores, key_factors = compute_sustainability_index(habitat_state)
    return SustainabilityResponse(
        overall_score=overall_score,
        classification=classification,
        component_scores=component_scores,
        key_factors=key_factors,
    )


@app.get("/prediction", response_model=PredictionResponse)
def prediction() -> PredictionResponse:
    return compute_prediction(habitat_state)


@app.post("/optimize/preview", response_model=OptimizationPlan)
def optimize_preview() -> OptimizationPlan:
    """Compute a reallocation plan without mutating state."""
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
    plan = request.plan if request and request.plan else generate_plan(habitat_state)
    return apply_plan(habitat_state, plan)