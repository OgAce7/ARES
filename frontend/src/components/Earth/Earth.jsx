import { motion } from 'framer-motion';
import './Earth.css';

// Pure CSS/SVG placeholder for Earth, visible in the lunar sky.
// Swap for a real texture later via ASSET_PATHS if desired.
export default function Earth() {
  return (
    <motion.div
      className="ares-earth"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1.6, ease: 'easeOut' }}
      aria-hidden="true"
    >
      <div className="ares-earth-glow" />
      <div className="ares-earth-body">
        <div className="ares-earth-continent ares-earth-continent--a" />
        <div className="ares-earth-continent ares-earth-continent--b" />
        <div className="ares-earth-continent ares-earth-continent--c" />
        <div className="ares-earth-shade" />
      </div>
    </motion.div>
  );
}
