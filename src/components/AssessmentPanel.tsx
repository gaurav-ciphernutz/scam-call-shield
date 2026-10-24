import type { ScamAssessment, FlagCategory } from '../types';

interface AssessmentPanelProps {
  assessment: ScamAssessment | null;
  isAnalyzing: boolean;
}

const CATEGORY_LABELS: Record<FlagCategory, string> = {
  urgency: '⚡ Urgency Pressure',
  threat: '⚠️ Threat / Extortion',
  otp_request: '🔑 OTP Theft',
  money_request: '💸 Demand for Money',
  impersonation: '🎭 False Identity',
  credential_request: '🔒 Sensitive Credentials',
};

const CATEGORY_COLORS: Record<FlagCategory, string> = {
  urgency: 'border-amber-200 bg-amber-50 text-amber-800',
  threat: 'border-rose-200 bg-rose-50 text-rose-800',
  otp_request: 'border-purple-200 bg-purple-50 text-purple-800',
  money_request: 'border-rose-200 bg-rose-50 text-rose-800',
  impersonation: 'border-amber-200 bg-amber-50 text-amber-800',
  credential_request: 'border-purple-200 bg-purple-50 text-purple-800',
};

export function AssessmentPanel({ assessment, isAnalyzing }: AssessmentPanelProps) {
  if (isAnalyzing) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center gap-3 text-slate-700">
          <svg className="w-5 h-5 animate-spin text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-slate-900">Gemini is analyzing the call…</p>
            <p className="text-xs text-slate-500">Evaluating speech pattern, speaker intent, and potential fraud vectors</p>
          </div>
        </div>
      </div>
    );
  }

  if (!assessment) return null;

  const { redFlags, riskLevel } = assessment;

  const riskConfig = {
    low: {
      container: 'border-emerald-200 bg-emerald-50/40',
      badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      label: '✅ Low Risk',
      subtitle: 'No strong scam signals detected so far. This does not guarantee that the call is safe.',
    },
    medium: {
      container: 'border-amber-200 bg-amber-50/40',
      badge: 'bg-amber-100 text-amber-800 border-amber-300',
      label: '⚠️ Medium Risk',
      subtitle: 'Some suspicious signals detected. Proceed with extreme caution.',
    },
    high: {
      container: 'border-rose-300 bg-rose-50/60 shadow-xs ring-1 ring-rose-400/20',
      badge: 'bg-rose-100 text-rose-800 border-rose-300',
      label: '🚨 High Risk — SCAM LIKELY',
      subtitle: 'Strong evidence of fraudulent manipulation detected. Do not follow instructions.',
    },
    unknown: {
      container: 'border-slate-200 bg-slate-50',
      badge: 'bg-slate-200 text-slate-700 border-slate-300',
      label: '🔍 Assessing…',
      subtitle: 'Gathering audio to produce an evidence-grounded risk assessment.',
    },
  };

  const config = riskConfig[riskLevel];

  return (
    <div className={`rounded-xl border p-4 shadow-sm transition-all ${config.container}`}>
      {/* Header status */}
      <div className="flex items-center justify-between gap-3 mb-3 pb-3 border-b border-slate-200/80">
        <div>
          <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-md border ${config.badge}`}>
            {config.label}
          </span>
          <p className="text-xs text-slate-600 mt-1.5 leading-snug">{config.subtitle}</p>
        </div>
        {assessment.assessmentComplete && (
          <span className="text-[11px] font-mono font-semibold text-emerald-700 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            Final
          </span>
        )}
      </div>

      {/* Red Flags List */}
      {redFlags.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs text-slate-600 font-semibold uppercase tracking-wider">
            <span>Evidence Detected</span>
            <span className="font-mono text-rose-600 font-bold">
              {redFlags.length} {redFlags.length === 1 ? 'flag' : 'flags'}
            </span>
          </div>

          <div className="space-y-2">
            {redFlags.map((flag, i) => (
              <div
                key={i}
                className="rounded-lg border p-3 bg-white border-slate-200 shadow-2xs space-y-1.5"
              >
                <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded border ${CATEGORY_COLORS[flag.category]}`}>
                  {CATEGORY_LABELS[flag.category]}
                </span>
                <blockquote className="text-xs text-slate-800 italic border-l-2 border-rose-500 pl-2.5 my-1">
                  "{flag.evidence}"
                </blockquote>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  {flag.explanation}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {riskLevel !== 'unknown' && redFlags.length === 0 && (
        <div className="p-3 rounded-lg bg-white border border-slate-200 text-xs text-slate-500 italic">
          No specific scam red flags identified in this segment.
        </div>
      )}
    </div>
  );
}
