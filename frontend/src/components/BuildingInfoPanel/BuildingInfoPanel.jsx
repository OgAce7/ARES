import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import * as Icons from 'lucide-react';
import { X, Users, Landmark } from 'lucide-react';
import { STATUS_META } from '../../data/worldConfig';
import './BuildingInfoPanel.css';

export default function BuildingInfoPanel({ building, moduleStatus, onClose, onOpenCouncil }) {
  useEffect(() => {
    if (!building) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [building, onClose]);

  return (
    <AnimatePresence>
      {building && (
        <motion.div
          className="ares-info-panel"
          initial={{ opacity: 0, x: 24, scale: 0.97 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 24, scale: 0.97 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          role="region"
          aria-label={`${building.name} details`}
        >
          <PanelContent
            building={building}
            moduleStatus={moduleStatus}
            onClose={onClose}
            onOpenCouncil={onOpenCouncil}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PanelContent({ building, moduleStatus, onClose, onOpenCouncil }) {
  const Icon = Icons[building.icon] || Icons.Building2;
  const statusMeta = STATUS_META[moduleStatus?.status] || STATUS_META.stable;
  const isCouncil = building.id === 'council';

  return (
    <>
      <div className="ares-info-panel-header">
        <div className="ares-info-panel-icon">
          <Icon size={18} strokeWidth={2.2} />
        </div>
        <div className="ares-info-panel-heading">
          <h3>{building.name}</h3>
          <span
            className="ares-info-panel-status"
            style={{ '--ares-status-color': statusMeta.color }}
          >
            <i /> {statusMeta.label}
          </span>
        </div>
        <button
          type="button"
          className="ares-info-panel-close"
          onClick={onClose}
          aria-label="Close panel"
        >
          <X size={16} />
        </button>
      </div>

      <p className="ares-info-panel-description">{building.description}</p>

      {moduleStatus && (
        <div className="ares-info-panel-stats">
          <div className="ares-info-panel-stat">
            <Users size={13} />
            <span>{moduleStatus.crew} crew on site</span>
          </div>
          {moduleStatus.stats.map((stat) => (
            <div className="ares-info-panel-stat" key={stat.label}>
              <span className="ares-info-panel-stat-label">{stat.label}</span>
              <span className="ares-info-panel-stat-value">{stat.value}</span>
            </div>
          ))}
        </div>
      )}

      {isCouncil && (
        <button
          type="button"
          className="ares-info-panel-council-cta"
          onClick={onOpenCouncil}
        >
          <Landmark size={14} strokeWidth={2.2} />
          Enter Council Chamber
        </button>
      )}
    </>
  );
}