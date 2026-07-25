import { motion } from 'framer-motion';
import './Astronaut.css';

// Renders one crew member at a fixed building-anchor position (see
// LunarWorld.jsx for how x/y are resolved from the astronaut's live
// current_location + CREW_ANCHOR_OFFSETS in worldConfig.js). The outer
// element's `left`/`top` are animated by Framer Motion whenever x/y
// change, which is what produces the "walk" between modules when an
// astronaut is relocated — there is no pathfinding, just an interpolated
// move from the old fixed anchor to the new one.
export default function Astronaut({ astronaut, x, y, driftDelay, isActive, isMoving, onSelect, onHover }) {
  const { id, name } = astronaut;

  return (
    <motion.button
      type="button"
      className={`ares-astronaut${isActive ? ' is-active' : ''}${isMoving ? ' is-moving' : ''}`}
      style={{ left: `${x}%`, top: `${y}%` }}
      animate={{ left: `${x}%`, top: `${y}%` }}
      transition={{ duration: 1.1, ease: 'easeInOut' }}
      onClick={() => onSelect(id)}
      onMouseEnter={() => onHover(id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(id)}
      onBlur={() => onHover(null)}
      aria-label={`${name} — view crew details`}
    >
      <motion.div
        className="ares-astronaut-drift"
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
      <span className="ares-astronaut-nametag">{name.split(' ')[0]}</span>
    </motion.button>
  );
}