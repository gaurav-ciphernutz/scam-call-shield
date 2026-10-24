import { calculateThreatScore, THREAT_THRESHOLDS } from '../utils/threatScore';
import type { ScamAssessment } from '../types';

interface ThreatMeterProps {
  assessment: ScamAssessment | null;
}

export function ThreatMeter({ assessment }: ThreatMeterProps) {
  const threat = calculateThreatScore(assessment);
  const { score, category, label, breakdown } = threat;

  const categoryStyles = {
    safe: {
      barColor: 'bg-emerald-500',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      textColor: 'text-emerald-700',
      glow: 'shadow-emerald-500/20',
    },
    suspicious: {
      barColor: 'bg-amber-500',
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
      textColor: 'text-amber-700',
      glow: 'shadow-amber-500/20',
    },
    high: {
      barColor: 'bg-rose-600',
      badgeColor: 'bg-rose-100 text-rose-800 border-rose-300 animate-pulse',
      textColor: 'text-rose-700 font-extrabold',
      glow: 'shadow-rose-600/30',
    },
    evaluating: {
      barColor: 'bg-slate-300',
      badgeColor: 'bg-slate-100 text-slate-700 border-slate-300',
      textColor: 'text-slate-500',
      glow: '',
    },
  }[category];

  return (
    <div
      className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3"
      role="region"
      aria-label="Live Scam Threat Meter"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Live Threat Meter
          </h3>
        </div>

        <span
          className={`inline-flex items-center text-xs font-bold px-2.5 py-0.5 rounded-full border ${categoryStyles.badgeColor}`}
          aria-live="polite"
        >
          {label}
        </span>
      </div>

      {/* Threat Bar with Defined Tiers */}
      <div className="space-y-1.5">
        <div
          className="h-3 w-full bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200 relative"
          role="meter"
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={label}
        >
          {/* Threshold markers */}
          <div
            className="absolute top-0 bottom-0 left-[25%] w-0.5 bg-slate-300 z-10"
            title="Safe / Suspicious Threshold (25)"
          />
          <div
            className="absolute top-0 bottom-0 left-[65%] w-0.5 bg-slate-300 z-10"
            title="Suspicious / High Risk Threshold (65)"
          />

          <div
            className={`h-full rounded-full transition-all duration-300 ${categoryStyles.barColor} ${categoryStyles.glow}`}
            style={{ width: `${Math.max(score > 0 ? 3 : 0, score)}%` }}
          />
        </div>

        {/* Legend */}
        <div className="flex justify-between text-[10px] text-slate-500 font-medium px-0.5">
          <span>Safe (0–{THREAT_THRESHOLDS.safeMax})</span>
          <span className="text-center">Suspicious ({THREAT_THRESHOLDS.safeMax + 1}–{THREAT_THRESHOLDS.suspiciousMax})</span>
          <span className="text-right text-rose-600 font-semibold">High Risk ({THREAT_THRESHOLDS.suspiciousMax + 1}–100)</span>
        </div>
      </div>

      {/* Deterministic Evidence Breakdown */}
      {breakdown.length > 0 && category !== 'evaluating' && (
        <div className="pt-2 border-t border-slate-100">
          <p className="text-[11px] font-semibold text-slate-600 mb-1">
            Grounded Score Breakdown:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {breakdown.map((item, idx) => (
              <span
                key={idx}
                className="text-[10px] font-mono bg-slate-50 border border-slate-200 text-slate-700 px-2 py-0.5 rounded"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-slate-400 italic">
        Advisory threat estimate derived deterministically from speech evidence. Not a calibrated statistical probability.
      </p>
    </div>
  );
}
