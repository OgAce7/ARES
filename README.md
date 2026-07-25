# 🌕 ARES — Autonomous Resource Equilibrium System

<p align="center">
  <em>An AI-assisted lunar habitat management platform for simulating, predicting, and optimizing critical life-support resources.</em>
</p>

<p align="center">
  <a href="#"><img src="https://img.shields.io/badge/backend-FastAPI-009688?logo=fastapi&logoColor=white" alt="FastAPI"></a>
  <a href="#"><img src="https://img.shields.io/badge/frontend-React_19-61DAFB?logo=react&logoColor=black" alt="React"></a>
  <a href="#"><img src="https://img.shields.io/badge/bundler-Vite-646CFF?logo=vite&logoColor=white" alt="Vite"></a>
  <a href="#"><img src="https://img.shields.io/badge/python-3.11+-3776AB?logo=python&logoColor=white" alt="Python"></a>
  <a href="#"><img src="https://img.shields.io/badge/status-prototype-yellow" alt="Status"></a>
</p>

---

## 📖 Introduction

ARES is a simulation-driven mission control dashboard for a lunar habitat. It models oxygen, water, and energy as living systems — consumed by crew and modules, replenished by facilities like the solar farm, water recycler, and greenhouse — and gives an operator the tools to monitor, forecast, and act on that state in real time.

Behind a 2.5D lunar colony rendered entirely in CSS/SVG and Framer Motion sits a real FastAPI backend running a deterministic simulation engine: every resource curve, sustainability score, and shortage prediction on screen is computed from actual habitat state, not scripted or randomized. The goal is to demonstrate how autonomous decision-support — prediction, optimization, and emergency response — can make a resource-constrained habitat more resilient, without hiding the reasoning behind the numbers.

---

## ✨ Features

- 🌍 **Interactive lunar habitat map** — click any module or crew member to inspect live status
- 📊 **Real-time resource simulation** — oxygen, water, and energy tracked per module, per tick
- 📈 **Shortage prediction** — projects hours-to-critical for each resource from its current rate
- ⚡ **Autonomous resource optimization** — the "Council" computes an explainable reallocation plan, previewed before it's applied
- 🚨 **Controlled emergency scenarios** — trigger a solar flare, water recycler failure, or habitat breach and watch the habitat react
- 🌱 **Sustainability Index** — a single 0–100 score built from four transparent sub-components
- 🧑‍🚀 **Crew relocation** — move astronauts between modules and see local resource demand shift accordingly
- ⏱️ **Manual time control** — advance the simulation hour by hour, on demand, with no background polling
- 🛰️ **Modular FastAPI + React architecture** — simulation, prediction, optimization, and scenario logic are independent, composable engines

---

## 🏗️ Architecture

ARES is two independently deployable applications that communicate over a plain HTTP/JSON API — there is no shared code, database, or websocket layer.

```
┌─────────────────────────────┐        HTTP / JSON        ┌───────────────────────────────┐
│           Frontend           │  ─────────────────────▶  │            Backend             │
│   React 19 + Vite + Framer   │  ◀─────────────────────  │      FastAPI + Pydantic v2      │
│   2.5D lunar colony visual   │                            │   in-memory habitat state       │
└─────────────────────────────┘                            └───────────────────────────────┘
                                                                          │
                                                     ┌────────────────────┼────────────────────┐
                                                     ▼                    ▼                     ▼
                                          ┌───────────────────┐ ┌──────────────────┐ ┌────────────────────┐
                                          │ Simulation Engine  │ │ Prediction Engine │ │ Optimization Engine │
                                          │ (app/simulation.py)│ │ (app/prediction.py)│ │(app/optimization.py)│
                                          └───────────────────┘ └──────────────────┘ └────────────────────┘
                                                     │                                          │
                                                     ▼                                          ▼
                                          ┌───────────────────┐                     ┌──────────────────────┐
                                          │ Sustainability     │                     │ Scenario Engine       │
                                          │ Index (app/        │                     │ (app/scenario.py)      │
                                          │ sustainability.py) │                     │                        │
                                          └───────────────────┘                     └──────────────────────┘
```

**Backend engines**, all deterministic and side-effect-free against a single shared `HabitatState`:

| Engine | Responsibility |
| --- | --- |
| **Simulation** (`simulation.py`) | Advances state by *N* simulated hours: resource generation, consumption, occupancy load, and status thresholds |
| **Prediction** (`prediction.py`) | Projects each resource's current net rate forward to estimate hours-until-critical |
| **Sustainability** (`sustainability.py`) | Combines resource stability, reserve longevity, allocation efficiency, and emergency resilience into a single 0–100 score |
| **Optimization** (`optimization.py`) | Generates an explainable reallocation plan across modules, respecting protected minimum-safe allocations |
| **Scenario** (`scenario.py`) | Triggers/clears one of three controlled emergency events by mutating explicit state fields the other engines already read |

Every engine reuses the exact same resource formulas, so the numbers shown in the dashboard, the prediction panel, and the Council's reallocation plan always stay consistent with one another. State lives in memory on the backend process — restarting the server (or calling `POST /reset`) returns the habitat to its seed configuration.

---

## 📂 Project Structure

```
ARES
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app + route definitions
│   │   ├── models.py          # Pydantic request/response/domain models
│   │   ├── state.py           # Shared in-memory HabitatState + seed data
│   │   ├── simulation.py      # Tick engine (resource generation/consumption)
│   │   ├── prediction.py      # Shortage/hours-to-critical projection
│   │   ├── sustainability.py  # Habitat Sustainability Index
│   │   ├── optimization.py    # Council reallocation engine
│   │   ├── scenario.py        # Emergency scenario trigger/clear engine
│   │   └── utils.py           # Shared constants + helpers
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── components/        # Building, Astronaut, CouncilPanel, EventSimulator, HUD, etc.
│   │   ├── data/               # worldConfig.js (layout) + mockData.js (offline fallback)
│   │   ├── hooks/              # useHabitatData — backend polling/state hook
│   │   ├── services/           # aresApi.js (HTTP client) + adapters.js (id mapping)
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   └── package.json
│
├── screenshots/
├── README.md
└── SETUP.md
```

---

## 🖥️ Tech Stack

**Frontend**
- [React 19](https://react.dev/)
- [Vite](https://vite.dev/)
- [Framer Motion](https://motion.dev/) — animation
- [lucide-react](https://lucide.dev/) — icons
- Plain CSS (custom properties, no CSS framework)

**Backend**
- [FastAPI](https://fastapi.tiangolo.com/)
- [Pydantic v2](https://docs.pydantic.dev/) — data validation & serialization
- [Uvicorn](https://www.uvicorn.org/) — ASGI server
- Python 3.11+, in-memory state (no database)

**Core systems**
- Habitat simulation (tick) engine
- Shortage prediction engine
- Autonomous reallocation (optimization) engine
- Controlled emergency scenario engine
- Sustainability index

---

## 📸 Screenshots

| Dashboard | Resource Simulation |
| --- | --- |
| ![Dashboard](screenshots/dashboard.png) | ![Simulation](screenshots/simulation.png) |

| Optimization Engine | Emergency Scenario |
| --- | --- |
| ![Optimization](screenshots/optimization.png) | ![Emergency](screenshots/emergency.png) |

> Screenshots reflect the current dashboard build. If you update the UI, please refresh these images so the README stays accurate.

---

## 🔌 API Endpoints

Base URL (local dev): `http://localhost:8000` · Interactive docs: `http://localhost:8000/docs`

| Method | Path | Description |
| --- | --- | --- |
| `GET`  | `/health` | Liveness check |
| `GET`  | `/state` | Full current habitat state |
| `POST` | `/reset` | Reset the habitat to its seed state |
| `POST` | `/astronauts/{id}/move` | Relocate a crew member to a different module |
| `POST` | `/tick` | Advance the simulation by *N* simulated hours (default: 1) |
| `GET`  | `/sustainability` | Habitat Sustainability Index (0–100) with component breakdown |
| `GET`  | `/prediction` | Shortage risk & hours-to-critical per resource |
| `GET`  | `/scenarios` | Metadata for the three available emergency scenarios |
| `POST` | `/scenario/trigger` | Trigger an emergency scenario |
| `POST` | `/scenario/clear` | Clear an active scenario, restoring pre-scenario values |
| `POST` | `/optimize/preview` | Compute a reallocation plan without mutating state |
| `POST` | `/optimize/apply` | Apply a reallocation plan (given or freshly computed) to live state |

Full request/response shapes are defined in `backend/app/models.py` and are browsable live via the auto-generated Swagger UI at `/docs`.

---

## 🔬 Simulation Overview

The habitat is modeled as a set of **modules** (habitat pods, greenhouse, water recycler, solar farm, medical bay, research lab, council chamber) and **astronauts**, sharing three tracked resources: **oxygen**, **water**, and **energy**.

1. **Tick engine** — each `POST /tick` advances the simulation by *N* hours. Facilities generate resources (solar farm → energy, water recycler → water, greenhouse → oxygen), while modules and the astronauts occupying them consume resources based on baseline demand plus an occupancy/activity load. Every resource is clamped against a `critical_threshold`, and crossing 1.5× that threshold flips a module's status to `warning`, then `critical`.
2. **Prediction** — rather than a trend model, ARES projects the *current instantaneous rate* (generation minus consumption, using the same formulas as the tick engine) forward to estimate how many hours remain before each resource crosses critical. This keeps the prediction always consistent with what the next tick would actually do.
3. **Sustainability Index** — a single explainable score (0–100) combining four weighted components: resource stability, reserve longevity, allocation efficiency, and emergency resilience.
4. **Optimization (the "Council")** — on request, computes a deterministic reallocation plan that shifts allocation percentages toward modules under the most strain, respecting each module's protected minimum-safe allocation and criticality weight. Plans can be **previewed** (no state change) before being **applied**.
5. **Emergency scenarios** — three fixed, deterministic scenarios (`solar_flare`, `water_recycler_failure`, `habitat_breach`) mutate explicit state fields that the tick/prediction/sustainability engines already read, so the rest of the system reacts naturally rather than being told what to display. Clearing a scenario restores exactly the fields it changed.

No part of the simulation uses randomness — the same sequence of actions from the same starting state always produces the same result, which makes the whole system reproducible and easy to reason about.

---

## ⚙️ Installation

### Prerequisites

| Tool | Version | Check with |
| --- | --- | --- |
| Python | 3.11+ | `python3 --version` |
| Node.js | 18+ | `node --version` |
| npm | (bundled with Node) | `npm --version` |
| Git | any | `git --version` |

### Clone the repository

```bash
git clone https://github.com/OgAce7/ARES.git
cd ARES
```

### Backend setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### Frontend setup

```bash
cd frontend
npm install
```

---

## ▶️ Running Locally

Run both apps at once, each in its own terminal — the frontend talks to the backend over plain HTTP.

**1. Start the backend** (from `backend/`, with the virtualenv activated):

```bash
uvicorn app.main:app --reload --port 8000
```

Confirm it's up at [http://localhost:8000/health](http://localhost:8000/health) (should return `{"status":"ok"}`), or explore the interactive docs at [http://localhost:8000/docs](http://localhost:8000/docs).

**2. Start the frontend** (from `frontend/`, in a second terminal):

```bash
npm run dev
```

Open the URL Vite prints — normally [http://localhost:5173](http://localhost:5173).

**3. Verify it's working**

- The colony scene loads: buildings, astronauts, starfield
- The HUD shows live oxygen/water/energy figures and a sustainability score
- Clicking a building shows its real allocation percentages
- "Advance +1h" ticks the simulation forward and the numbers move

For port conflicts, environment overrides, and troubleshooting, see [SETUP.md](SETUP.md).

---

## 🧭 Future Improvements

- [ ] Persist habitat state (database-backed) instead of in-memory only
- [ ] Trend-based, multi-tick prediction (rather than instantaneous-rate projection)
- [ ] WebSocket/streaming updates in place of manual "Advance +1h" polling
- [ ] Authentication and multi-operator support
- [ ] Replace CSS/SVG placeholder art with real building and crew sprites
- [ ] Automated test coverage for the simulation, prediction, and optimization engines
- [ ] Configurable/scenario-authorable emergency events beyond the current fixed three
- [ ] Historical charts for resource and sustainability trends over time

---

## 👥 Contributors

- **Devansh Tiwari**
- **Ayush Pandey**

Contributions, issues, and feature suggestions are welcome — feel free to open a pull request or issue.

---

## 📄 License

This project was built as a hackathon prototype and is intended for educational and demonstration purposes. No formal open-source license has been applied yet; if you'd like to reuse this code, please open an issue to discuss licensing terms.

---

<p align="center">⭐ If you found this project interesting, consider giving it a star!</p>