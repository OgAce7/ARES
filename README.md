# ARES — Autonomous Resource Equilibrium System

A gamified lunar habitat resource simulation: an interactive 2.5D colony with
live oxygen/water/energy monitoring, a shortage-prediction engine, a
sustainability index, controlled emergency scenarios, occupancy-aware
astronaut movement, and a Council House allocation (reallocation) workflow.

- **Backend**: FastAPI (Python), in-memory simulation state, no database.
- **Frontend**: React + Vite, calling the backend over HTTP (CORS-enabled
  for `localhost:5173` / `127.0.0.1:5173`).

## Run the backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Backend is now live at `http://localhost:8000` (interactive API docs at
`http://localhost:8000/docs`).

## Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend is now live at `http://localhost:5173` and talks to the backend at
`http://localhost:8000` by default. To point it at a different backend URL,
create `frontend/.env.local` with:

```
VITE_ARES_API_URL=http://your-backend-host:8000
```

## Demo sequence

1. Load the app — the colony renders in its normal, stable state.
2. Click **Simulate Event** (top HUD) and trigger an emergency scenario
   (Solar Flare, Water Recycler Failure, or Habitat Breach).
3. Watch the affected resource chip and the Sustainability badge react;
   hover a resource chip or the Sustainability badge for the detailed
   projection/breakdown.
4. Click the **Council Chamber** building, then **Enter Council Chamber**.
5. Click **Request Allocation Recommendation** to preview a reallocation
   plan (state is unchanged at this point).
6. Click **Approve Reallocation** to apply it — the Council shows the
   before/after sustainability and predicted-shortage improvement, and the
   HUD/resource chips update to match.
7. Use **Reset** (top HUD) at any point to restore the habitat to its seed
   state for a repeat run.

## Notes

- All resource figures, module demands, and scenario magnitudes are
  illustrative simulation data, not real NASA figures.
- The simulation only advances when you click **Advance +1h** — there is no
  background polling, so the demo stays deterministic.
