import { motion } from 'framer-motion';
import * as Icons from 'lucide-react';
import { STATUS_META } from '../../data/worldConfig';
import './Building.css';

// Renders a small CSS silhouette appropriate to the building "kind".
// These are intentionally simple so they can be swapped for real art
// later without touching layout/interaction logic.
function BuildingShape({ kind }) {
  switch (kind) {
    case 'dome':
      return (
        <div className="ares-shape ares-shape--dome">
          <div className="ares-shape-dome-glass" />
          <div className="ares-shape-dome-base" />
        </div>
      );
    case 'hab':
      return (
        <div className="ares-shape ares-shape--hab">
          <div className="ares-shape-hab-pod ares-shape-hab-pod--left" />
          <div className="ares-shape-hab-pod ares-shape-hab-pod--right" />
          <div className="ares-shape-hab-link" />
        </div>
      );
    case 'lab':
      return (
        <div className="ares-shape ares-shape--lab">
          <div className="ares-shape-lab-block" />
          <div className="ares-shape-lab-antenna" />
        </div>
      );
    case 'tower':
      return (
        <div className="ares-shape ares-shape--tower">
          <div className="ares-shape-tower-body" />
          <div className="ares-shape-tower-cap" />
        </div>
      );
    case 'tank':
      return (
        <div className="ares-shape ares-shape--tank">
          <div className="ares-shape-tank-cylinder" />
          <div className="ares-shape-tank-pipe" />
        </div>
      );
    case 'panel-array':
      return (
        <div className="ares-shape ares-shape--panel-array">
          <div className="ares-shape-panel" />
          <div className="ares-shape-panel" />
          <div className="ares-shape-panel" />
          <div className="ares-shape-mast" />
        </div>
      );
    case 'capitol':
      return (
        <div className="ares-shape ares-shape--capitol">
          <div className="ares-shape-capitol-beacon" />
          <div className="ares-shape-capitol-dome" />
          <div className="ares-shape-capitol-colonnade">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="ares-shape-capitol-base" />
          <div className="ares-shape-capitol-steps" />
        </div>
      );
    default:
      return <div className="ares-shape ares-shape--hab" />;
  }
}

export default function Building({ building, status, isSelected, effect, onSelect, onHover }) {
  const { id, name, kind, icon, position, scale, elevation, zIndex } = building;
  const statusMeta = STATUS_META[status] || STATUS_META.stable;
  const Icon = Icons[icon] || Icons.Building2;

  return (
    <motion.button
      type="button"
      className={`ares-building ares-building--${status}${isSelected ? ' is-selected' : ''}${
        effect ? ` ares-building--effect-${effect}` : ''
      }`}
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
        zIndex,
        '--ares-building-scale': scale,
        '--ares-building-elevation': `${elevation}px`,
        '--ares-building-status-color': statusMeta.color,
      }}
      onClick={() => onSelect(id)}
      onMouseEnter={() => onHover(id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(id)}
      onBlur={() => onHover(null)}
      whileHover={{ scale: 1.08, y: -4 }}
      whileTap={{ scale: 0.97 }}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      aria-label={`${name} — status ${statusMeta.label}${effect ? `, active event: ${effect.replace('-', ' ')}` : ''}`}
    >
      <span className="ares-building-status-dot" />
      <div className="ares-building-glow" />
      {effect === 'oxygen-leak' && (
        <div className="ares-building-oxygen-leak" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      )}
      <BuildingShape kind={kind} />
      <div className="ares-building-icon">
        <Icon size={14} strokeWidth={2.2} />
      </div>
      <span className="ares-building-label">{name}</span>
    </motion.button>
  );
}