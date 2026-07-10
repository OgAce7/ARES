import { motion } from 'framer-motion';
import './Astronaut.css';

// Simple CSS-built astronaut placeholder with a gentle idle bob + drift.
// Swap the internal markup for a sprite/asset later via ASSET_PATHS.astronaut.
export default function Astronaut({ astronaut }) {
  const { position, driftDelay } = astronaut;

  return (
    <motion.div
      className="ares-astronaut"
      style={{ left: `${position.x}%`, top: `${position.y}%` }}
      animate={{
        x: [0, 10, -6, 0],
        y: [0, -3, 2, 0],
      }}
      transition={{
        duration: 9,
        delay: driftDelay,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
      aria-hidden="true"
    >
      <motion.div
        className="ares-astronaut-figure"
        animate={{ y: [0, -3, 0] }}
        transition={{
          duration: 2.2,
          delay: driftDelay,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        <div className="ares-astronaut-visor" />
        <div className="ares-astronaut-helmet" />
        <div className="ares-astronaut-body" />
        <div className="ares-astronaut-arm ares-astronaut-arm--left" />
        <div className="ares-astronaut-arm ares-astronaut-arm--right" />
        <div className="ares-astronaut-leg ares-astronaut-leg--left" />
        <div className="ares-astronaut-leg ares-astronaut-leg--right" />
        <div className="ares-astronaut-shadow" />
      </motion.div>
    </motion.div>
  );
}
