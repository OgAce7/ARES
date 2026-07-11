// ─────────────────────────────────────────────────────────────────────────
// useHabitatData.js
// Single hook that owns all backend connectivity for LunarWorld: initial
// load of GET /state (+ /sustainability, /prediction if available), a
// manual "advance simulation" action wired to POST /tick, and explicit
// loading / backend-unavailable states.
//
// No polling interval is used — this is a manual-simulation-control
// design (see ticking() below), which is the safer of the two options
// given the existing UI ships with no simulation controls at all: it
// avoids surprise background requests, oscillating HUD values while a
// user is mid-hover/inspecting a building, and keeps demo behavior
// deterministic. If continuous auto-play is wanted later, `runTick` is
// the single call site an interval would need to invoke.
//
// >>> MOCK FALLBACK (explicit, off by default) <<<
// Set VITE_ARES_MOCK_FALLBACK=true (e.g. in frontend/.env.local) to fall
// back to the original mockData.js fixtures if the backend can't be
// reached, instead of showing the "backend unavailable" state. This
// exists purely for offline/frontend-only demos and is never silent:
// `isMock` is returned so the UI can flag it.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import { aresApi } from '../services/aresApi';
import {
  adaptResources,
  adaptSustainability,
  adaptModuleStatus,
  adaptActiveScenarios,
  adaptAstronauts,
} from '../services/adapters';
import { RESOURCES as MOCK_RESOURCES, SUSTAINABILITY as MOCK_SUSTAINABILITY, MODULE_STATUS as MOCK_MODULE_STATUS } from '../data/mockData';

const MOCK_FALLBACK_ENABLED = import.meta.env.VITE_ARES_MOCK_FALLBACK === 'true';

export const LOAD_STATUS = {
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error',
};

export function useHabitatData() {
  const [status, setStatus] = useState(LOAD_STATUS.LOADING);
  const [errorMessage, setErrorMessage] = useState(null);
  const [isMock, setIsMock] = useState(false);
  const [resources, setResources] = useState(MOCK_RESOURCES);
  const [sustainability, setSustainability] = useState(MOCK_SUSTAINABILITY);
  const [moduleStatus, setModuleStatus] = useState(MOCK_MODULE_STATUS);
  const [activeScenarios, setActiveScenarios] = useState({});
  const [astronauts, setAstronauts] = useState([]);
  const [tickCount, setTickCount] = useState(0);
  const [isTicking, setIsTicking] = useState(false);
  const [movingAstronautId, setMovingAstronautId] = useState(null);

  const previousScoreRef = useRef(null);
  const mountedRef = useRef(true);
  useEffect(() => {
  mountedRef.current = true;

  return () => {
    mountedRef.current = false;
  };
}, []);

  // Sustainability and prediction are treated as optional ("if available"):
  // if either call fails, the resource/module data from /state and /tick
  // still loads and renders — those two are just left at their last-known
  // values rather than blocking the whole UI.
  const applyState = useCallback(async (habitatState) => {
    let sustainabilityData = null;
    let predictionData = null;
    try {
      sustainabilityData = await aresApi.getSustainability();
    } catch {
      /* sustainability endpoint optional/unavailable — keep prior value */
    }
    try {
      predictionData = await aresApi.getPrediction();
    } catch {
      /* prediction endpoint optional/unavailable — keep prior value */
    }

    if (!mountedRef.current) return;

    setResources(adaptResources(habitatState.resources, predictionData));
    setModuleStatus(adaptModuleStatus(habitatState.modules, habitatState.astronauts, habitatState.active_scenarios));
    setActiveScenarios(adaptActiveScenarios(habitatState.active_scenarios));
    setAstronauts(adaptAstronauts(habitatState.astronauts));
    setTickCount(habitatState.simulation.tick_count);
    if (sustainabilityData) {
      setSustainability(adaptSustainability(sustainabilityData, previousScoreRef.current));
      previousScoreRef.current = sustainabilityData.overall_score;
    }
  }, []);

  const loadAll = useCallback(async () => {
    setStatus(LOAD_STATUS.LOADING);
    setErrorMessage(null);
    try {
      const habitatState = await aresApi.getState();
      setIsMock(false);
      await applyState(habitatState);
      if (mountedRef.current) setStatus(LOAD_STATUS.READY);
    } catch (err) {
      if (!mountedRef.current) return;
      if (MOCK_FALLBACK_ENABLED) {
        setIsMock(true);
        setResources(MOCK_RESOURCES);
        setSustainability(MOCK_SUSTAINABILITY);
        setModuleStatus(MOCK_MODULE_STATUS);
        setStatus(LOAD_STATUS.READY);
      } else {
        setStatus(LOAD_STATUS.ERROR);
        setErrorMessage(err.message);
      }
    }
  }, [applyState]);

  useEffect(() => {
    // Idiomatic fetch-on-mount: loadAll() only calls setState after its
    // awaited network calls resolve, not synchronously during the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll();
  }, [loadAll]);

  const runTick = useCallback(async (simulatedHours = 1) => {
    if (isMock) return; // no live simulation to advance in mock mode
    setIsTicking(true);
    try {
      const tickResponse = await aresApi.tick(simulatedHours);
      await applyState(tickResponse.state);
      setStatus(LOAD_STATUS.READY);
      setErrorMessage(null);
    } catch (err) {
      if (mountedRef.current) {
        setStatus(LOAD_STATUS.ERROR);
        setErrorMessage(err.message);
      }
    } finally {
      if (mountedRef.current) setIsTicking(false);
    }
  }, [applyState, isMock]);

  // Relocates a single astronaut via POST /astronauts/{id}/move, then
  // re-applies the returned state so resources/moduleStatus/astronauts all
  // stay in sync (occupancy load only actually shifts on the next tick —
  // see simulation.py — but the astronaut's own current_location, and
  // therefore its rendered position, updates immediately).
  const moveAstronaut = useCallback(async (astronautId, targetModuleBackendId) => {
    if (isMock) return { ok: false, error: 'Unavailable while running on mock data.' };
    setMovingAstronautId(astronautId);
    try {
      const updatedState = await aresApi.moveAstronaut(astronautId, targetModuleBackendId);
      await applyState(updatedState);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    } finally {
      if (mountedRef.current) setMovingAstronautId(null);
    }
  }, [applyState, isMock]);

  // Lightweight refresh used after POST /optimize/apply: re-pulls /state
  // (+ sustainability/prediction) and re-runs applyState, but — unlike
  // loadAll() — never toggles the whole-page LOADING/ERROR banners, so a
  // council reallocation doesn't flash the entire HUD while its own
  // panel is already showing success/error feedback.
  const refreshState = useCallback(async () => {
    if (isMock) return;
    const habitatState = await aresApi.getState();
    await applyState(habitatState);
  }, [applyState, isMock]);

  return {
    status,
    errorMessage,
    isMock,
    resources,
    sustainability,
    moduleStatus,
    activeScenarios,
    astronauts,
    tickCount,
    isTicking,
    runTick,
    retry: loadAll,
    refreshState,
    moveAstronaut,
    movingAstronautId,
  };
}