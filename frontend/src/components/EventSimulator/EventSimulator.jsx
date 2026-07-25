import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Sun,
  Droplets,
  Wind,
  X,
  Loader2,
  ShieldOff,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { aresApi } from '../../services/aresApi';
import './EventSimulator.css';

// Fixed, backend-confirmed scenario ids (see GET /scenarios). Names,
// descriptions, and effect summaries are still pulled live from the
// backend rather than hardcoded — this list only decides icon + display
// order for the compact control.
const SCENARIO_ORDER = [
  { id: 'solar_flare', icon: Sun },
  { id: 'water_recycler_failure', icon: Droplets },
  { id: 'habitat_breach', icon: Wind },
];

export default function EventSimulator({ activeScenarios, isMock, disabled, onScenarioChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [catalog, setCatalog] = useState(null);
  const [catalogError, setCatalogError] = useState(null);
  const [pendingId, setPendingId] = useState(null);
  const [notification, setNotification] = useState(null);

  const activeIds = Object.keys(activeScenarios ?? {});
  const isCatalogLoading = isOpen && !catalog && !catalogError;

  useEffect(() => {
    if (!isOpen || catalog || catalogError) return;
    aresApi
      .getScenarios()
      .then((list) => setCatalog(Object.fromEntries(list.map((s) => [s.scenario_id, s]))))
      .catch((err) => setCatalogError(err.message));
  }, [isOpen, catalog, catalogError]);

  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(null), 6000);
    return () => clearTimeout(timer);
  }, [notification]);

  const trigger = async (scenarioId) => {
    setPendingId(scenarioId);
    setNotification(null);
    try {
      const result = await aresApi.triggerScenario(scenarioId);
      const headline = catalog?.[scenarioId]?.name ?? scenarioId;
      setNotification({
        type: 'success',
        title: `${headline} triggered`,
        detail: result.impact_summary?.[0] ?? 'Habitat state updated.',
      });
      await onScenarioChange?.();
    } catch (err) {
      setNotification({ type: 'error', title: 'Scenario trigger failed', detail: err.message });
    } finally {
      setPendingId(null);
    }
  };

  const clear = async (scenarioId) => {
    setPendingId(scenarioId);
    setNotification(null);
    try {
      const result = await aresApi.clearScenario(scenarioId);
      const headline = catalog?.[scenarioId]?.name ?? scenarioId;
      setNotification({
        type: 'success',
        title: `${headline} cleared`,
        detail: result.note,
      });
      await onScenarioChange?.();
    } catch (err) {
      setNotification({ type: 'error', title: 'Scenario clear failed', detail: err.message });
    } finally {
      setPendingId(null);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <div className="ares-eventsim">
      <button
        type="button"
        className={`ares-eventsim-toggle${activeIds.length > 0 ? ' has-active' : ''}`}
        onClick={() => setIsOpen((v) => !v)}
        disabled={disabled}
        title="Simulate an emergency event (POST /scenario/trigger)"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <AlertTriangle size={13} strokeWidth={2.2} />
        Simulate Event
        {activeIds.length > 0 && (
          <span className="ares-eventsim-badge-count" aria-label={`${activeIds.length} active scenarios`}>
            {activeIds.length}
          </span>
        )}
      </button>

      {activeIds.length > 0 && !isOpen && (
        <div className="ares-eventsim-active-strip">
          {activeIds.map((id) => (
            <span key={id} className="ares-eventsim-active-pill">
              <span className="ares-eventsim-active-dot" />
              {catalog?.[id]?.name ?? id.replace(/_/g, ' ')}
              <button
                type="button"
                onClick={() => clear(id)}
                disabled={disabled || pendingId === id}
                aria-label={`Clear ${catalog?.[id]?.name ?? id.replace(/_/g, ' ')}`}
                title="Clear scenario (POST /scenario/clear)"
              >
                {pendingId === id ? <Loader2 size={11} className="ares-eventsim-spin" /> : <ShieldOff size={11} />}
              </button>
            </span>
          ))}
        </div>
      )}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="ares-eventsim-panel"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            role="region"
            aria-label="Emergency Scenarios"
          >
            <div className="ares-eventsim-panel-head">
              <span>Emergency Scenarios</span>
              <button type="button" onClick={() => setIsOpen(false)} aria-label="Close emergency scenarios panel">
                <X size={14} />
              </button>
            </div>

            {catalogError && (
              <div className="ares-eventsim-error" role="alert">
                {catalogError}
              </div>
            )}

            <div className="ares-eventsim-list">
              {SCENARIO_ORDER.map(({ id, icon: Icon }) => {
                const meta = catalog?.[id];
                const isActive = Boolean(activeScenarios?.[id]);
                const isPending = pendingId === id;
                return (
                  <div className={`ares-eventsim-card${isActive ? ' is-active' : ''}`} key={id}>
                    <div className="ares-eventsim-card-icon">
                      <Icon size={15} strokeWidth={2.2} />
                    </div>
                    <div className="ares-eventsim-card-body">
                      {isCatalogLoading ? (
                        <>
                          <div className="ares-skeleton-row ares-skeleton-row--sm ares-skeleton-row--short" />
                          <div className="ares-skeleton-row ares-skeleton-row--sm ares-skeleton-row--wide" />
                        </>
                      ) : (
                        <>
                          <span className="ares-eventsim-card-name">{meta?.name ?? id.replace(/_/g, ' ')}</span>
                          {meta?.description && <p>{meta.description}</p>}
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      className="ares-eventsim-card-action"
                      onClick={() => (isActive ? clear(id) : trigger(id))}
                      disabled={disabled || isPending}
                    >
                      {isPending ? (
                        <Loader2 size={13} className="ares-eventsim-spin" />
                      ) : isActive ? (
                        'Clear'
                      ) : (
                        'Trigger'
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            {isMock && <p className="ares-eventsim-mock-note">Unavailable while running on mock data.</p>}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {notification && (
          <motion.div
            className={`ares-eventsim-toast ares-eventsim-toast--${notification.type}`}
            initial={{ opacity: 0, y: -8, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -8, x: '-50%' }}
            transition={{ duration: 0.2 }}
            role={notification.type === 'error' ? 'alert' : 'status'}
            aria-live={notification.type === 'error' ? 'assertive' : 'polite'}
          >
            {notification.type === 'success' ? (
              <CheckCircle2 size={14} strokeWidth={2.4} aria-hidden="true" />
            ) : (
              <XCircle size={14} strokeWidth={2.4} aria-hidden="true" />
            )}
            <div>
              <strong>{notification.title}</strong>
              <span>{notification.detail}</span>
            </div>
            <button type="button" onClick={() => setNotification(null)} aria-label="Dismiss notification">
              <X size={12} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}