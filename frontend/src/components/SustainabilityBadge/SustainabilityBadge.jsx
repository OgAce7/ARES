import { useState } from 'react';
import { motion } from 'framer-motion';
import { Leaf, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import './SustainabilityBadge.css';

const TREND_ICON = { up: TrendingUp, down: TrendingDown, stable: Minus };

export default function SustainabilityBadge({ sustainability }) {
  const [hovered, setHovered] = useState(false);
  const TrendIcon = TREND_ICON[sustainability.trend] || Minus;
  const detailId = 'ares-sustainability-detail';

  // Circular progress ring math
  const radius = 17;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (sustainability.score / 100) * circumference;

  return (
    <div
      className="ares-sustainability-badge"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      tabIndex={0}
      role="group"
      aria-label={`Sustainability: ${sustainability.label}, score ${sustainability.score}, trend ${sustainability.trend}`}
      aria-describedby={detailId}
    >
      <div className="ares-sustainability-ring" aria-hidden="true">
        <svg width="42" height="42" viewBox="0 0 42 42">
          <circle cx="21" cy="21" r={radius} className="ares-sustainability-ring-track" />
          <motion.circle
            cx="21"
            cy="21"
            r={radius}
            className="ares-sustainability-ring-fill"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            transform="rotate(-90 21 21)"
          />
        </svg>
        <Leaf size={15} className="ares-sustainability-leaf" />
      </div>
      <div className="ares-sustainability-body" aria-hidden="true">
        <span className="ares-sustainability-label">{sustainability.label}</span>
        <span className="ares-sustainability-score">
          {sustainability.score}
          <TrendIcon size={12} strokeWidth={2.5} />
        </span>
      </div>

      <span id={detailId} className="ares-sr-only">{sustainability.summary}</span>

      {hovered && (
        <motion.div
          className="ares-sustainability-tooltip"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          aria-hidden="true"
        >
          {sustainability.summary}
        </motion.div>
      )}
    </div>
  );
}