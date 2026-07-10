import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  Landmark,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Leaf,
} from 'lucide-react';
import { aresApi } from '../../services/aresApi';
import './CouncilPanel.css';

// Council interaction stages. `preview` holds the plan returned by
// POST /optimize/preview (state unchanged); `applied` holds the plan
// returned by POST /optimize/apply after the user approves it.
const STAGE = {
  IDLE: 'idle',
  LOADING_PREVIEW: 'loading_preview',
  PREVIEW: 'preview',
  APPLYING: 'applying',
  APPLIED: 'applied',
  ERROR: 'error',
};

const RESOURCE_LABEL = { oxygen: 'O2', water: 'H2O', energy: 'PWR' };

// A module "gains" or "surrenders" if any of its three resource
// allocations moved; which bucket it falls in is decided by the net
// direction of change. Modules with no numeric movement (protected or
// simply untouched by this plan) don't belong in either list.
function classifyChange(change) {
  const resources = ['oxygen', 'water', 'energy'];
  let net = 0;
  let moved = false;
  for (const r of resources) {
    const delta = change.after[r] - change.before[r];
    if (Math.abs(delta) > 0.01) moved = true;
    net += delta;
  }
  if (!moved) return 'unchanged';
  return net > 0 ? 'gaining' : 'surrendering';
}

function ResourceDeltaRow({ change }) {
  const resources = ['oxygen', 'water', 'energy'];
  return (
    <div className="ares-council-delta-row">
      {resources.map((r) => {
        const delta = change.after[r] - change.before[r];
        if (Math.abs(delta) < 0.01) return null;
        return (
          <span
            key={r}
            className={`ares-council-delta-chip ${delta > 0 ? 'is-up' : 'is-down'}`}
          >
            {RESOURCE_LABEL[r]} {Math.round(change.before[r])}%
            <span className="ares-council-delta-arrow">→</span>
            {Math.round(change.after[r])}%
          </span>
        );
      })}
    </div>
  );
}

function ModuleChangeCard({ change, animate }) {
  const bucket = classifyChange(change);
  const Icon = bucket === 'gaining' ? ArrowUpRight : bucket === 'surrendering' ? ArrowDownRight : ShieldCheck;

  return (
    <motion.div
      className={`ares-council-module-card is-${bucket}`}
      initial={animate ? { opacity: 0, y: 6 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <div className="ares-council-module-card-head">
        <Icon size={14} strokeWidth={2.4} />
        <span className="ares-council-module-name">{change.display_name}</span>
        {change.protected && <span className="ares-council-protected-tag">Protected</span>}
      </div>
      <ResourceDeltaRow change={change} />
      {change.reasons?.length > 0 && (
        <ul className="ares-council-reasons">
          {change.reasons.map((reason, i) => (
            <li key={i}>{reason}</li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}

function ImpactRow({ effect }) {
  return (
    <div className="ares-council-impact-row">
      <span className="ares-council-impact-resource">{effect.resource}</span>
      <span className="ares-council-impact-risk">
        {effect.risk_before} <span className="ares-council-impact-arrow">→</span> {effect.risk_after}
      </span>
      {effect.hours_to_critical_before != null && effect.hours_to_critical_after != null && (
        <span className="ares-council-impact-hours">
          {effect.hours_to_critical_before.toFixed(1)}h
          <span className="ares-council-impact-arrow">→</span>
          {effect.hours_to_critical_after.toFixed(1)}h to critical
        </span>
      )}
    </div>
  );
}

export default function CouncilPanel({ open, onClose, onApplied }) {
  const [stage, setStage] = useState(STAGE.IDLE);
  const [plan, setPlan] = useState(null);
  const [appliedPlan, setAppliedPlan] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  const resetAndClose = () => {
    setStage(STAGE.IDLE);
    setPlan(null);
    setAppliedPlan(null);
    setErrorMessage(null);
    onClose();
  };

  const requestRecommendation = async () => {
    setStage(STAGE.LOADING_PREVIEW);
    setErrorMessage(null);
    try {
      const result = await aresApi.optimizePreview();
      setPlan(result);
      setStage(STAGE.PREVIEW);
    } catch (err) {
      setErrorMessage(err.message);
      setStage(STAGE.ERROR);
    }
  };

  const approveReallocation = async () => {
    if (!plan) return;
    setStage(STAGE.APPLYING);
    setErrorMessage(null);
    try {
      const result = await aresApi.optimizeApply(plan);
      setAppliedPlan(result);
      setStage(STAGE.APPLIED);
      // Refresh habitat state in the background so the HUD / building
      // panels reflect the new allocations; the Council keeps showing
      // its own success view regardless of how long that takes.
      onApplied?.();
    } catch (err) {
      setErrorMessage(err.message);
      setStage(STAGE.ERROR);
    }
  };

  const cancel = () => {
    setPlan(null);
    setErrorMessage(null);
    setStage(STAGE.IDLE);
  };

  const activePlan = stage === STAGE.APPLIED ? appliedPlan : plan;
  const gaining = activePlan?.module_changes.filter((c) => classifyChange(c) === 'gaining') ?? [];
  const surrendering = activePlan?.module_changes.filter((c) => classifyChange(c) === 'surrendering') ?? [];
  const protectedChanges = activePlan?.module_changes.filter((c) => c.protected) ?? [];
  const hasSustainabilityDelta =
    activePlan && typeof activePlan.sustainability_delta === 'number' && !Number.isNaN(activePlan.sustainability_delta);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="ares-council-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => {
            if (e.target === e.currentTarget && stage !== STAGE.APPLYING) resetAndClose();
          }}
        >
          <motion.div
            className="ares-council-chamber"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <div className="ares-council-chamber-glow" />

            <div className="ares-council-header">
              <div className="ares-council-header-icon">
                <Landmark size={20} strokeWidth={2} />
              </div>
              <div className="ares-council-header-text">
                <h2>ARES Council</h2>
                <p>Autonomous resource equilibrium — allocation directives</p>
              </div>
              <button
                type="button"
                className="ares-council-close"
                onClick={resetAndClose}
                aria-label="Close Council Chamber"
                disabled={stage === STAGE.APPLYING}
              >
                <X size={16} />
              </button>
            </div>

            <div className="ares-council-body">
              {stage === STAGE.IDLE && (
                <div className="ares-council-idle">
                  <Sparkles size={26} strokeWidth={1.6} className="ares-council-idle-icon" />
                  <p>
                    The Council can compute a reallocation directive across every habitat module,
                    balancing shortages against protected minimum-safe thresholds.
                  </p>
                  <button type="button" className="ares-council-primary-btn" onClick={requestRecommendation}>
                    Request Allocation Recommendation
                  </button>
                </div>
              )}

              {stage === STAGE.LOADING_PREVIEW && (
                <div className="ares-council-loading">
                  <Loader2 size={22} className="ares-council-spin" />
                  <span>The Council is deliberating…</span>
                </div>
              )}

              {stage === STAGE.ERROR && (
                <div className="ares-council-error">
                  <AlertTriangle size={20} strokeWidth={2} />
                  <span>{errorMessage || 'The Council could not complete this request.'}</span>
                  <button type="button" className="ares-council-secondary-btn" onClick={requestRecommendation}>
                    Try Again
                  </button>
                </div>
              )}

              {(stage === STAGE.PREVIEW || stage === STAGE.APPLYING || stage === STAGE.APPLIED) && activePlan && (
                <div className="ares-council-plan">
                  {stage === STAGE.APPLIED && (
                    <div className="ares-council-success-banner">
                      <CheckCircle2 size={16} strokeWidth={2.4} />
                      <span>Reallocation directive applied. Habitat state updated.</span>
                    </div>
                  )}

                  {activePlan.summary?.length > 0 && (
                    <ul className="ares-council-summary">
                      {activePlan.summary.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  )}

                  {hasSustainabilityDelta && (
                    <div className="ares-council-sustainability">
                      <Leaf size={14} strokeWidth={2.2} />
                      <span>
                        Sustainability {activePlan.sustainability_before.toFixed(1)}
                        <span className="ares-council-impact-arrow">→</span>
                        {activePlan.sustainability_after.toFixed(1)}
                      </span>
                      <span className={`ares-council-delta-tag ${activePlan.sustainability_delta >= 0 ? 'is-up' : 'is-down'}`}>
                        {activePlan.sustainability_delta >= 0 ? '+' : ''}
                        {activePlan.sustainability_delta.toFixed(1)}
                      </span>
                    </div>
                  )}

                  {activePlan.predicted_effect?.length > 0 && (
                    <div className="ares-council-section">
                      <h4>Predicted Shortage Improvement</h4>
                      <div className="ares-council-impact-list">
                        {activePlan.predicted_effect.map((effect) => (
                          <ImpactRow key={effect.resource} effect={effect} />
                        ))}
                      </div>
                    </div>
                  )}

                  {gaining.length > 0 && (
                    <div className="ares-council-section">
                      <h4>Modules Gaining Resources</h4>
                      <div className="ares-council-module-list">
                        {gaining.map((c) => (
                          <ModuleChangeCard key={c.module_id} change={c} animate={stage === STAGE.APPLIED} />
                        ))}
                      </div>
                    </div>
                  )}

                  {surrendering.length > 0 && (
                    <div className="ares-council-section">
                      <h4>Modules Surrendering Resources</h4>
                      <div className="ares-council-module-list">
                        {surrendering.map((c) => (
                          <ModuleChangeCard key={c.module_id} change={c} animate={stage === STAGE.APPLIED} />
                        ))}
                      </div>
                    </div>
                  )}

                  {(protectedChanges.length > 0 || activePlan.protected_modules?.length > 0) && (
                    <div className="ares-council-section">
                      <h4>Protected Modules</h4>
                      <div className="ares-council-protected-list">
                        {(protectedChanges.length > 0
                          ? protectedChanges.map((c) => c.display_name)
                          : activePlan.protected_modules
                        ).map((name) => (
                          <span key={name} className="ares-council-protected-pill">
                            <ShieldCheck size={12} strokeWidth={2.2} />
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {activePlan.unresolved_shortages?.length > 0 && (
                    <div className="ares-council-section">
                      <h4>Unresolved Shortages</h4>
                      <ul className="ares-council-unresolved">
                        {activePlan.unresolved_shortages.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {gaining.length === 0 && surrendering.length === 0 && (
                    <p className="ares-council-noop">
                      No reallocation is currently recommended — allocations are already balanced.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="ares-council-actions">
              {stage === STAGE.PREVIEW && (
                <>
                  <button type="button" className="ares-council-secondary-btn" onClick={cancel}>
                    Cancel
                  </button>
                  <button type="button" className="ares-council-primary-btn" onClick={approveReallocation}>
                    Approve Reallocation
                  </button>
                </>
              )}
              {stage === STAGE.APPLYING && (
                <button type="button" className="ares-council-primary-btn" disabled>
                  <Loader2 size={14} className="ares-council-spin" />
                  Applying directive…
                </button>
              )}
              {stage === STAGE.APPLIED && (
                <button type="button" className="ares-council-primary-btn" onClick={resetAndClose}>
                  Close
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}