import { useMemo, useState } from 'react';
import { BUILDINGS, ASTRONAUTS, AMBIENT_LIGHTS, CRATERS } from '../../data/worldConfig';
import { useHabitatData, LOAD_STATUS } from '../../hooks/useHabitatData';
import Starfield from '../Starfield/Starfield';
import Earth from '../Earth/Earth';
import Building from '../Building/Building';
import Astronaut from '../Astronaut/Astronaut';
import ResourceHUD from '../ResourceHUD/ResourceHUD';
import SustainabilityBadge from '../SustainabilityBadge/SustainabilityBadge';
import BuildingInfoPanel from '../BuildingInfoPanel/BuildingInfoPanel';
import './LunarWorld.css';

// LunarWorld is the visual shell of Mission Control: a 2.5D lunar colony
// built entirely from layered CSS/SVG + Framer Motion. Resource/sustainability/
// module data is live, sourced from the ARES FastAPI backend via
// useHabitatData() (see hooks/useHabitatData.js). Selection/hover remain
// local UI state. Simulation time only advances when the user explicitly
// requests it (POST /tick) — there is no background polling.
export default function LunarWorld() {
  const [selectedId, setSelectedId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);

  const {
    status,
    errorMessage,
    isMock,
    resources,
    sustainability,
    moduleStatus,
    tickCount,
    isTicking,
    runTick,
    retry,
  } = useHabitatData();

  const selectedBuilding = useMemo(
    () => BUILDINGS.find((b) => b.id === selectedId) || null,
    [selectedId]
  );

  const handleSelect = (id) => {
    setSelectedId((current) => (current === id ? null : id));
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
            onSelect={handleSelect}
            onHover={setHoveredId}
          />
        ))}

        {ASTRONAUTS.map((astronaut) => (
          <Astronaut key={astronaut.id} astronaut={astronaut} />
        ))}
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
              disabled={isMock || isTicking || status === LOAD_STATUS.LOADING}
              title="Advance the simulation by 1 hour (POST /tick)"
            >
              {isTicking ? 'Advancing…' : `Advance +1h`}
              <span className="ares-tick-count">t={tickCount}</span>
            </button>
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

        {hoveredId && !selectedId && (
          <div className="ares-hud-hint">
            Click {BUILDINGS.find((b) => b.id === hoveredId)?.name} to view details
          </div>
        )}

        <BuildingInfoPanel
          building={selectedBuilding}
          moduleStatus={selectedId ? moduleStatus[selectedId] : null}
          onClose={() => setSelectedId(null)}
        />
      </div>
    </div>
  );
}
