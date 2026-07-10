"""
ARES backend entrypoint.

Exposes:
  GET  /health          - liveness check
  GET  /state           - current in-memory habitat state
  POST /reset            - reset habitat state to seed values
  POST /tick              - advance the simulation by N simulated hours (default 1)
  GET  /sustainability  - Habitat Sustainability Index (0-100) for current state
  GET  /prediction       - emergency shortage prediction per resource

Optimization, scenario injection, and persistence still live outside this
file — this is the state + tick + sustainability + prediction foundation
those future modules will build on.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.models import HabitatState, PredictionResponse, SustainabilityResponse, TickRequest, TickResponse
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
