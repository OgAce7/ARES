"""
ARES backend entrypoint.

Exposes:
  GET  /health  - liveness check
  GET  /state   - current in-memory habitat state
  POST /reset   - reset habitat state to seed values
  POST /tick    - advance the simulation by N simulated hours (default 1)

Prediction, optimization, and persistence still live outside this file —
this is the state + tick foundation those future modules will build on.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.models import HabitatState, TickRequest, TickResponse
from app.simulation import run_tick
from app.state import habitat_state, reset_state

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
