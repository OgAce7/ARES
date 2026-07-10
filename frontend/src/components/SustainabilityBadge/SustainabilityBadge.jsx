import { useState } from 'react';
import { motion } from 'framer-motion';
import { Leaf, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import './SustainabilityBadge.css';

const TREND_ICON = { up: TrendingUp, down: TrendingDown, stable: Minus };

export default function SustainabilityBadge({ sustainability }) {
  const [hovered, setHovered] = useState(false);
  const TrendIcon = TREND_ICON[sustainability.trend] || Minus;

  // Circular progress ring math
  const radius = 17;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (sustainability.score / 100) * circumference;

  return (
    <div
      className="ares-sustainability-badge"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="ares-sustainability-ring">
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
      <div className="ares-sustainability-body">
        <span className="ares-sustainability-label">{sustainability.label}</span>
        <span className="ares-sustainability-score">
          {sustainability.score}
          <TrendIcon size={12} strokeWidth={2.5} />
        </span>
      </div>

      {hovered && (
        <motion.div
          className="ares-sustainability-tooltip"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
        >
          {sustainability.summary}
        </motion.div>
      )}
    </div>
  );
}