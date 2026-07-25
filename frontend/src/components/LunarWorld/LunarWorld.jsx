import { useMemo, useState } from 'react';
import { BUILDINGS, AMBIENT_LIGHTS, CRATERS, CREW_ANCHOR_OFFSETS } from '../../data/worldConfig';
import { FRONTEND_TO_BACKEND_ID } from '../../services/adapters';
import { useHabitatData, LOAD_STATUS } from '../../hooks/useHabitatData';
import Starfield from '../Starfield/Starfield';
import Earth from '../Earth/Earth';
import Building from '../Building/Building';
import Astronaut from '../Astronaut/Astronaut';
import ResourceHUD from '../ResourceHUD/ResourceHUD';
import SustainabilityBadge from '../SustainabilityBadge/SustainabilityBadge';
import BuildingInfoPanel from '../BuildingInfoPanel/BuildingInfoPanel';
import AstronautProfileCard from '../AstronautProfileCard/AstronautProfileCard';
import CouncilPanel from '../CouncilPanel/CouncilPanel';
import EventSimulator from '../EventSimulator/EventSimulator';
import './LunarWorld.css';

// Fixed building anchor points, keyed by frontend building id — the only
// valid places an astronaut can be rendered. No free-form coordinates.
const BUILDING_POSITION_BY_ID = Object.fromEntries(BUILDINGS.map((b) => [b.id, b.position]));
const BUILDING_IDS = new Set(BUILDINGS.map((b) => b.id));

// Maps each active scenario to the single building visual-reaction effect
// it drives, and which building that effect lands on. habitat_breach's
// target is dynamic (whichever module was actually breached), the other
// two always target the same fixed facility.
function buildScenarioEffects(activeScenarios) {
  const effects = {};
  if (activeScenarios?.solar_flare) {
    effects['solar-farm'] = 'energy-instability';
  }
  if (activeScenarios?.water_recycler_failure) {
    effects['water-recycler'] = 'water-alert';
  }
  const breach = activeScenarios?.habitat_breach;
  if (breach?.targetModuleId) {
    effects[breach.targetModuleId] = 'oxygen-leak';
  }
  return effects;
}

// Resolves each astronaut's screen position from its live
// current_location. Astronauts sharing a module fan out across a
// predefined set of fixed offsets (CREW_ANCHOR_OFFSETS) around that
// building's anchor point so they don't stack exactly on top of one
// another — still no free-form placement, just a handful of fixed spots.
function resolveAstronautPositions(astronauts) {
  const countByLocation = {};
  const positions = {};
  for (const astronaut of astronauts) {
    const idx = countByLocation[astronaut.locationId] ?? 0;
    countByLocation[astronaut.locationId] = idx + 1;
    const anchor = BUILDING_POSITION_BY_ID[astronaut.locationId] ?? BUILDING_POSITION_BY_ID.council;
    const offset = CREW_ANCHOR_OFFSETS[idx % CREW_ANCHOR_OFFSETS.length];
    positions[astronaut.id] = { x: anchor.x + offset.dx, y: anchor.y + offset.dy };
  }
  return positions;
}

// LunarWorld is the visual shell of Mission Control: a 2.5D lunar colony
// built entirely from layered CSS/SVG + Framer Motion. Resource/sustainability/
// module/crew data is live, sourced from the ARES FastAPI backend via
// useHabitatData() (see hooks/useHabitatData.js). Selection/hover remain
// local UI state and are shared between buildings and astronauts (their id
// spaces never collide), so only one info panel is ever open at a time.
// Simulation time only advances when the user explicitly requests it
// (POST /tick) — there is no background polling.
export default function LunarWorld() {
  const [selectedId, setSelectedId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [isCouncilOpen, setIsCouncilOpen] = useState(false);
  const [moveError, setMoveError] = useState(null);

  const {
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
    retry,
    refreshState,
    moveAstronaut,
    movingAstronautId,
    resetHabitat,
    isResetting,
  } = useHabitatData();

  const selectedBuilding = useMemo(
    () => BUILDINGS.find((b) => b.id === selectedId) || null,
    [selectedId]
  );

  const displayedAstronaut = useMemo(() => {
    const selected = astronauts.find((a) => a.id === selectedId);
    if (selected) return selected;
    return astronauts.find((a) => a.id === hoveredId) || null;
  }, [astronauts, selectedId, hoveredId]);

  const astronautPositions = useMemo(() => resolveAstronautPositions(astronauts), [astronauts]);

  const scenarioEffects = useMemo(() => buildScenarioEffects(activeScenarios), [activeScenarios]);

  const handleSelect = (id) => {
    setMoveError(null);
    setSelectedId((current) => (current === id ? null : id));
  };

  const handleMoveAstronaut = async (astronautId, targetFrontendId) => {
    setMoveError(null);
    const targetBackendId = FRONTEND_TO_BACKEND_ID[targetFrontendId] ?? targetFrontendId;
    const result = await moveAstronaut(astronautId, targetBackendId);
    if (!result.ok) setMoveError(result.error);
  };

  const handleReset = async () => {
    setSelectedId(null);
    setHoveredId(null);
    setMoveError(null);
    setIsCouncilOpen(false);
    await resetHabitat();
  };

  return (
    <div className="ares-lunar-world">
      {/* ── Sky layer ────────────────────────────────────────────── */}
      <div className="ares-sky">
        <Starfield count={140} />
        <Earth />
        <div className="ares-sky-glow" />
      </div>

      {/* ── Ground / terrain layer ───────────────────────────────── */}
      <div className="ares-terrain">
        {CRATERS.map((crater) => (
          <div
            key={`${crater.x}-${crater.y}`}
            className="ares-crater"
            style={{
              left: `${crater.x}%`,
              top: `${crater.y}%`,
              width: crater.size,
              height: crater.size * 0.4,
            }}
          />
        ))}

        {AMBIENT_LIGHTS.map((light) => (
          <div
            key={light.id}
            className="ares-ambient-light"
            style={{
              left: `${light.x}%`,
              top: `${light.y}%`,
              width: light.radius * 2,
              height: light.radius * 2,
              background: `radial-gradient(circle, ${light.color} 0%, transparent 70%)`,
            }}
          />
        ))}

        {BUILDINGS.map((building) => (
          <Building
            key={building.id}
            building={building}
            status={moduleStatus[building.id]?.status}
            isSelected={selectedId === building.id}
            effect={scenarioEffects[building.id] ?? null}
            onSelect={handleSelect}
            onHover={setHoveredId}
          />
        ))}

        {astronauts.map((astronaut, index) => {
          const pos = astronautPositions[astronaut.id] ?? BUILDING_POSITION_BY_ID.council;
          return (
            <Astronaut
              key={astronaut.id}
              astronaut={astronaut}
              x={pos.x}
              y={pos.y}
              driftDelay={(index % 5) * 0.6}
              isActive={selectedId === astronaut.id || hoveredId === astronaut.id}
              isMoving={movingAstronautId === astronaut.id}
              onSelect={handleSelect}
              onHover={setHoveredId}
            />
          );
        })}
      </div>

      {/* ── HUD overlay layer ────────────────────────────────────── */}
      <div className="ares-hud-layer">
        <div className="ares-hud-top">
          <div className="ares-hud-brand">
            <span className="ares-hud-brand-mark" />
            <div>
              <h1>ARES</h1>
              <p>Autonomous Resource Equilibrium System</p>
            </div>
          </div>
          <div className="ares-hud-top-right">
            {isMock && <span className="ares-mock-badge">MOCK DATA</span>}
            <button
              type="button"
              className="ares-tick-button"
              onClick={() => runTick(1)}
              disabled={isMock || isTicking || isResetting || status === LOAD_STATUS.LOADING}
              title="Advance the simulation by 1 hour (POST /tick)"
            >
              {isTicking ? 'Advancing…' : `Advance +1h`}
              <span className="ares-tick-count ares-success-bump" key={tickCount}>t={tickCount}</span>
            </button>
            <button
              type="button"
              className="ares-reset-button"
              onClick={handleReset}
              disabled={isMock || isResetting || isTicking || status === LOAD_STATUS.LOADING}
              title="Reset the habitat back to its seed state (POST /reset)"
            >
              {isResetting ? 'Resetting…' : 'Reset'}
            </button>
            <EventSimulator
              activeScenarios={activeScenarios}
              isMock={isMock}
              disabled={isMock || status === LOAD_STATUS.LOADING}
              onScenarioChange={refreshState}
            />
            <ResourceHUD resources={resources} />
            <SustainabilityBadge sustainability={sustainability} />
          </div>
        </div>

        {status === LOAD_STATUS.ERROR && (
          <div className="ares-backend-banner ares-backend-banner--error">
            <span>Backend unavailable{errorMessage ? `: ${errorMessage}` : '.'}</span>
            <button type="button" onClick={retry}>Retry</button>
          </div>
        )}

        {status === LOAD_STATUS.LOADING && (
          <div className="ares-backend-banner ares-backend-banner--loading">
            <span className="ares-loading-spinner" />
            <span>Connecting to ARES backend…</span>
          </div>
        )}

        {hoveredId && !selectedId && BUILDING_IDS.has(hoveredId) && (
          <div className="ares-hud-hint">
            Click {BUILDINGS.find((b) => b.id === hoveredId)?.name} to view details
          </div>
        )}

        <BuildingInfoPanel
          building={selectedBuilding}
          moduleStatus={selectedId ? moduleStatus[selectedId] : null}
          onClose={() => setSelectedId(null)}
          onOpenCouncil={() => setIsCouncilOpen(true)}
        />

        <AstronautProfileCard
          astronaut={displayedAstronaut}
          isMoving={displayedAstronaut ? movingAstronautId === displayedAstronaut.id : false}
          moveError={moveError}
          onMove={handleMoveAstronaut}
          onClose={() => {
            setSelectedId(null);
            setHoveredId(null);
            setMoveError(null);
          }}
        />
      </div>

      <CouncilPanel
        open={isCouncilOpen}
        onClose={() => setIsCouncilOpen(false)}
        onApplied={refreshState}
      />
    </div>
  );
}