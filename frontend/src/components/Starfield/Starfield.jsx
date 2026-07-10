import { useMemo } from 'react';
import { motion } from 'framer-motion';
import './Starfield.css';

// Deterministic pseudo-random star field generated once per mount.
// Purely decorative — no data dependency.
function generateStars(count, seed = 1) {
  let s = seed;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  return Array.from({ length: count }, (_, i) => ({
    id: `star-${i}`,
    x: rand() * 100,
    y: rand() * 62, // keep stars in the upper sky band
    size: rand() * 1.8 + 0.5,
    delay: rand() * 4,
    duration: rand() * 3 + 2,
  }));
}

export default function Starfield({ count = 120 }) {
  const stars = useMemo(() => generateStars(count), [count]);

  return (
    <div className="ares-starfield" aria-hidden="true">
      {stars.map((star) => (
        <motion.span
          key={star.id}
          className="ares-star"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: star.size,
            height: star.size,
          }}
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{
            duration: star.duration,
            delay: star.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}
