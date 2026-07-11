# ARES Setup Guide

This document contains the setup and deployment instructions for the ARES (Autonomous Resource Equilibrium System) project.

ARES is two apps working together: a FastAPI backend that runs the actual habitat simulation, and a React + Vite
frontend that visualizes it as a 2.5D lunar colony. You need both running at once, each in its own terminal — the
frontend calls the backend over plain HTTP.
Repo github.com/OgAce7/ARES
Backend backend/  —  FastAPI, runs on port 8000
Frontend frontend/  —  Vite + React, runs on port 5173

# 1. Before you start
Make sure these are installed:
Tool Version Check with
Python 3.11+ python3 --version
Node.js 18+ node --version
npm comes with Node npm --version
Git any git --version

# 2. Get the code
git clone https://github.com/OgAce7/ARES.git
cd ARES
code .
That last line opens it in VS Code. backend/ and frontend/ are independent — set each one up separately below.

# 3. Start the backend
In a VS Code terminal:
cd backend
python3 -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
You'll know it's up when Uvicorn says Application startup complete. Quick sanity check: open
localhost:8000/health in a browser, you should get back {"status":"ok"}. (There's also auto-generated API
docs at localhost:8000/docs if you want to poke around.)
Tip: point VS Code at this .venv as the interpreter (bottom-right corner, or Cmd/Ctrl+Shift+P fi "Python: Select Interpreter") so
IntelliSense doesn't complain about missing imports.

# 4. Start the frontend
Leave the backend running, open a second terminal:
cd frontend
npm install
npm run dev
Vite will print a URL, normally localhost:5173 — open that. The backend already allows requests from that exact
origin, so nothing else to configure as long as it lands on the default port.

# 5. How to tell it's actually working
l The colony scene loads: buildings, astronauts, starfield.
l The HUD top-right shows real oxygen/water/energy numbers and a sustainability score — these come straight from
the backend, not placeholder data.
l Clicking a building shows its actual allocation percentages.
l Hitting "Advance +1h" ticks the simulation forward and the numbers move.
Stuck on “Connecting to ARES backend…”? That was a real bug at one point but it's fixed in this repo
now. If you somehow still hit it: check the backend terminal is still alive, hard-refresh the page, and peek at
the browser console — a CORS/network error there usually just means one of the two apps isn't on its
expected port.

# 6. Config reference
Setting Value Where
Backend port 8000--port flag on uvicorn
Frontend port 5173 Vite default
Frontend fi backend URLlocalhost:8000 frontend/src/services/aresApi.js
Override backend URL VITE_ARES_API_URL frontend/.env.local (optional)
Ports already taken? Start uvicorn with a different --port, add that origin to allow_origins in backend/app/main.py, and set
VITE_ARES_API_URL in frontend/.env.local to match.

# 7. API endpoints, quick reference
Method Path Does what
GET /health Liveness check
GET /state Full habitat state
POST /reset Reset to seed values
POST /astronauts/{id}/move Relocate a crew member
POST /tick Advance sim by N hours
GET /sustainability Sustainability index
GET /prediction Shortage risk per resource
GET /scenarios Available emergency scenarios
POST /scenario/trigger Trigger a scenario
POST /scenario/clear Clear a scenario
POST /optimize/preview Preview a reallocation
POST /optimize/apply Apply a reallocation

# 8. If something breaks
pip install complains about “externally managed environment”
The venv isn't activated — you should see (.venv) in your prompt before running pip.
npm install hangs or errors out
rm -rf node_modules and try again. Sometimes a stale lockfile is the culprit.
Blank page in the browser
Check node --version is 18+. This Vite version won't run on older Node.
CORS error in the console
The frontend needs to be on localhost:5173 exactly. If it grabbed a different port because 5173 was busy, either free up
5173 or add the new origin to allow_origins in backend/app/main.py.
"Advance +1h" button does nothing
Look at the backend terminal for errors, and check that localhost:8000/state loads directly in a browser.
Both servers hot-reload, so you shouldn't need to restart anything between demo runs. Ctrl+C in either terminal stops it.