"""
ARES backend entrypoint.

Exposes the habitat state foundation only:
  GET  /health  - liveness check
  GET  /state   - current in-memory habitat state
  POST /reset   - reset habitat state to seed values

No simulation tick logic, prediction, optimization, or persistence
lives here — this is the foundation those future modules will build on.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.models import HabitatState
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
