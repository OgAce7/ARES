// ─────────────────────────────────────────────────────────────────────────
// aresApi.js
// Minimal fetch wrapper around the ARES FastAPI backend. All network calls
// for the frontend should go through this file rather than scattering
// fetch() calls across components.
//
// Base URL can be overridden at build time with VITE_ARES_API_URL
// (e.g. in a .env.local) for deployments where the backend isn't on
// localhost:8000. The FastAPI backend already whitelists the Vite dev
// origins (http://localhost:5173 / 127.0.0.1:5173) in its CORS config.
// ─────────────────────────────────────────────────────────────────────────

export const API_BASE_URL = import.meta.env.VITE_ARES_API_URL || 'http://localhost:8000';

// Thrown for both network failures (backend unreachable) and non-2xx
// HTTP responses, so callers can present a single "something's wrong"
// state while still inspecting `.isNetworkError` / `.status` if needed.
export class AresApiError extends Error {
  constructor(message, { status = null, isNetworkError = false, cause } = {}) {
    super(message);
    this.name = 'AresApiError';
    this.status = status;
    this.isNetworkError = isNetworkError;
    if (cause) this.cause = cause;
  }
}

async function request(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    // fetch() itself throws for network-level failures (backend down,
    // CORS misconfiguration, DNS, etc.) — this is the "backend unavailable" case.
    throw new AresApiError(`Could not reach ARES backend at ${API_BASE_URL}${path}`, {
      isNetworkError: true,
      cause: err,
    });
  }

  if (!response.ok) {
    let detail = '';
    try {
      const payload = await response.json();
      detail = payload?.detail ? `: ${payload.detail}` : '';
    } catch {
      // response body wasn't JSON (or was empty) — ignore, use status only
    }
    throw new AresApiError(`ARES backend returned ${response.status} for ${path}${detail}`, {
      status: response.status,
    });
  }

  // 204 / empty body safety
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export const aresApi = {
  getHealth: () => request('/health'),
  getState: () => request('/state'),
  resetState: () => request('/reset', { method: 'POST' }),
  tick: (simulatedHours = 1) => request('/tick', { method: 'POST', body: { simulated_hours: simulatedHours } }),
  getSustainability: () => request('/sustainability'),
  getPrediction: () => request('/prediction'),
  optimizePreview: () => request('/optimize/preview', { method: 'POST' }),
  optimizeApply: (plan = null) => request('/optimize/apply', { method: 'POST', body: { plan } }),
  getScenarios: () => request('/scenarios'),
  triggerScenario: (scenarioId, targetModule = null) =>
    request('/scenario/trigger', {
      method: 'POST',
      body: { scenario_id: scenarioId, target_module: targetModule },
    }),
  clearScenario: (scenarioId) =>
    request('/scenario/clear', { method: 'POST', body: { scenario_id: scenarioId } }),
  moveAstronaut: (astronautId, targetModule) =>
    request(`/astronauts/${astronautId}/move`, {
      method: 'POST',
      body: { target_module: targetModule },
    }),
};