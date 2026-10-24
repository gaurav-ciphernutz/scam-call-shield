import type { ConnectionState, ScamAssessment } from '../types';
import type { StreamingState } from '../services/audioStreamingService';

interface StatusBarProps {
  connectionState: ConnectionState;
  streamingState: StreamingState;
  assessment: ScamAssessment | null;
}

const CONNECTION_DOT: Record<ConnectionState, string> = {
  disconnected: 'bg-slate-400',
  connecting: 'bg-amber-500 animate-pulse',
  connected: 'bg-emerald-600',
  error: 'bg-rose-600',
};

const CONNECTION_LABEL: Record<ConnectionState, string> = {
  disconnected: 'Not connected',
  connecting: 'Connecting to Gemini…',
  connected: 'Connected',
  error: 'Connection error',
};

const RISK_STYLES = {
  low: 'text-emerald-700 bg-emerald-50 border-emerald-200 shadow-2xs',
  medium: 'text-amber-700 bg-amber-50 border-amber-200 shadow-2xs',
  high: 'text-rose-700 bg-rose-50 border-rose-300 shadow-2xs font-extrabold',
  unknown: 'text-slate-700 bg-slate-100 border-slate-200',
};

const RISK_LABELS = {
  low: '🟢 Low Risk',
  medium: '🟡 Medium Risk',
  high: '🔴 High Risk — SCAM LIKELY',
  unknown: '⚪ Assessing…',
};

export function StatusBar({ connectionState, streamingState, assessment }: StatusBarProps) {
  const riskLevel = assessment?.riskLevel ?? 'unknown';

  return (
    <div className="flex items-center gap-2.5 flex-wrap">
      {/* Gemini Live connection status */}
      <div className="flex items-center gap-2 text-xs text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-1.5 shadow-2xs">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${CONNECTION_DOT[connectionState]}`} aria-hidden="true" />
        <span className="font-medium">{CONNECTION_LABEL[connectionState]}</span>
      </div>

      {/* Streaming state pill */}
      {streamingState === 'streaming' && (
        <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 shadow-2xs">
          <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse flex-shrink-0" aria-hidden="true" />
          <span className="font-semibold">Streaming audio to Gemini</span>
        </div>
      )}
      {streamingState === 'paused' && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 shadow-2xs">
          <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" aria-hidden="true" />
          <span className="font-medium">Paused</span>
        </div>
      )}
      {streamingState === 'loading' && (
        <div className="flex items-center gap-2 text-xs text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-1.5 shadow-2xs">
          <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping flex-shrink-0" aria-hidden="true" />
          <span className="font-medium">Loading audio…</span>
        </div>
      )}

      {/* Risk indicator badge */}
      {assessment && (
        <div
          className={`flex items-center gap-2 text-xs font-bold border rounded-lg px-3 py-1.5 ml-auto transition-all ${RISK_STYLES[riskLevel]}`}
          aria-live="polite"
          aria-label={`Risk level: ${RISK_LABELS[riskLevel]}`}
        >
          {RISK_LABELS[riskLevel]}
        </div>
      )}
    </div>
  );
}
