import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Wind, Droplets, Activity, MapPin, Loader2 } from 'lucide-react';
import { BUILDINGS } from '../../data/worldConfig';
import './AstronautProfileCard.css';

// Compact crew profile shown when an astronaut is clicked or hovered.
// Displays the fields the astronaut demands from the habitat, plus a
// relocation control that calls POST /astronauts/{id}/move (via onMove)
// and lets the crew member's presence — and therefore local resource
// demand — be moved between the same fixed building anchors used to
// render them on the map. No free-form movement: the only valid targets
// are the predefined modules in worldConfig.BUILDINGS.
export default function AstronautProfileCard({ astronaut, isMoving, moveError, onMove, onClose }) {
  const [targetId, setTargetId] = useState('');

  useEffect(() => {
    if (!astronaut) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [astronaut, onClose]);

  return (
    <AnimatePresence>
      {astronaut && (
        <motion.div
          className="ares-astro-card"
          initial={{ opacity: 0, x: -24, scale: 0.97 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -24, scale: 0.97 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          role="region"
          aria-label={`${astronaut.name} crew details`}
        >
          <CardContent
            astronaut={astronaut}
            isMoving={isMoving}
            moveError={moveError}
            targetId={targetId}
            onTargetChange={setTargetId}
            onMove={onMove}
            onClose={onClose}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CardContent({ astronaut, isMoving, moveError, targetId, onTargetChange, onMove, onClose }) {
  const { name, role, locationId, locationName, oxygenDemandPerHour, waterDemandPerDay, activityMultiplier } =
    astronaut;

  const handleRelocate = () => {
    if (!targetId || targetId === locationId) return;
    onMove(astronaut.id, targetId);
  };

  return (
    <>
      <div className="ares-astro-card-header">
        <div className="ares-astro-card-avatar">
          <div className="ares-astro-card-visor" />
        </div>
        <div className="ares-astro-card-heading">
          <h3>{name}</h3>
          <span className="ares-astro-card-role">{role}</span>
        </div>
        <button type="button" className="ares-astro-card-close" onClick={onClose} aria-label="Close panel">
          <X size={16} />
        </button>
      </div>

      <div className="ares-astro-card-stats">
        <div className="ares-astro-card-stat">
          <MapPin size={13} />
          <span>{locationName}</span>
        </div>
        <div className="ares-astro-card-stat">
          <Wind size={13} />
          <span>{oxygenDemandPerHour.toFixed(2)} O₂ / hr</span>
        </div>
        <div className="ares-astro-card-stat">
          <Droplets size={13} />
          <span>{waterDemandPerDay.toFixed(2)} L water / day</span>
        </div>
        <div className="ares-astro-card-stat">
          <Activity size={13} />
          <span>{activityMultiplier.toFixed(2)}× activity load</span>
        </div>
      </div>

      <div className="ares-astro-card-move">
        <label htmlFor="ares-astro-target">Relocate crew member</label>
        <div className="ares-astro-card-move-row">
          <select
            id="ares-astro-target"
            value={targetId}
            onChange={(e) => onTargetChange(e.target.value)}
            disabled={isMoving}
          >
            <option value="" disabled>
              Choose module…
            </option>
            {BUILDINGS.map((b) => (
              <option key={b.id} value={b.id} disabled={b.id === locationId}>
                {b.name}
                {b.id === locationId ? ' (current)' : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="ares-astro-card-move-btn"
            onClick={handleRelocate}
            disabled={isMoving || !targetId || targetId === locationId}
          >
            {isMoving ? <Loader2 size={13} className="ares-astro-card-spin" /> : 'Move'}
          </button>
        </div>
        {moveError && (
          <p className="ares-astro-card-error" role="alert">
            {moveError}
          </p>
        )}
      </div>

      <p className="ares-astro-card-note">Crew movement dynamically shifts local resource demand.</p>
    </>
  );
}