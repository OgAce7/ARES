import { useState } from 'react';
import { motion } from 'framer-motion';
import * as Icons from 'lucide-react';
import './ResourceHUD.css';

const TREND_ICON = {
  up: 'TrendingUp',
  down: 'TrendingDown',
  stable: 'Minus',
};

function ResourceChip({ id, resource, isHovered, onHover }) {
  const Icon = Icons[resource.icon] || Icons.Gauge;
  const TrendIcon = Icons[TREND_ICON[resource.trend]] || Icons.Minus;
  const riskClass = resource.risk === 'critical' || resource.risk === 'warning' ? ` ares-resource-chip--risk-${resource.risk}` : '';

  return (
    <div
      className={`ares-resource-chip${isHovered ? ' is-hovered' : ''} ares-resource-chip--${resource.trend}${riskClass}`}
      onMouseEnter={() => onHover(id)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="ares-resource-chip-icon">
        <Icon size={15} strokeWidth={2.2} />
      </div>
      <div className="ares-resource-chip-body">
        <span className="ares-resource-chip-label">{resource.label}</span>
        <div className="ares-resource-bar">
          <motion.div
            className="ares-resource-bar-fill"
            initial={{ width: 0 }}
            animate={{ width: `${resource.value}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
          />
        </div>
      </div>
      <div className="ares-resource-chip-value">
        <span>{resource.value}{resource.unit}</span>
        <TrendIcon size={11} strokeWidth={2.5} />
      </div>

      {isHovered && (
        <motion.div
          className="ares-resource-tooltip"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
        >
          {resource.detail}
        </motion.div>
      )}
    </div>
  );
}

export default function ResourceHUD({ resources }) {
  const [hovered, setHovered] = useState(null);

  return (
    <div className="ares-resource-hud">
      {Object.entries(resources).map(([id, resource]) => (
        <ResourceChip
          key={id}
          id={id}
          resource={resource}
          isHovered={hovered === id}
          onHover={setHovered}
        />
      ))}
    </div>
  );
}