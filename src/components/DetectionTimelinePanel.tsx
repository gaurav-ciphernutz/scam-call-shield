import type { DetectionTimeline } from '../types';

interface DetectionTimelinePanelProps {
  timeline: DetectionTimeline;
}

export function DetectionTimelinePanel({ timeline }: DetectionTimelinePanelProps) {
  const {
    events,
    earlyWarningMarginSec,
    isEarlyWarning,
    isPostCallDetection,
    warningVisibleTimeMs,
    playbackStartTimeMs,
    playbackEndTimeMs,
  } = timeline;

  const warningLatencySec =
    warningVisibleTimeMs && playbackStartTimeMs
      ? Math.max(0, Math.round(((warningVisibleTimeMs - playbackStartTimeMs) / 1000) * 100) / 100)
      : null;

  return (
    <div
      className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4"
      role="region"
      aria-label="AI Detection Timeline"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            AI Detection Timeline & Latency
          </h3>
        </div>

        {/* Lead time status badge */}
        <div className="flex items-center gap-2">
          {isEarlyWarning && earlyWarningMarginSec !== null && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-300">
              <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              Early Warning: +{earlyWarningMarginSec.toFixed(2)}s lead time
            </span>
          )}

          {isPostCallDetection && earlyWarningMarginSec !== null && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 border border-amber-300">
              Post-Call Detection ({Math.abs(earlyWarningMarginSec).toFixed(2)}s after playback)
            </span>
          )}

          {!warningVisibleTimeMs && playbackEndTimeMs && (
            <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
              Safe Call (No Scam Warning)
            </span>
          )}
        </div>
      </div>

      {/* Latency metric callouts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Warning Latency</p>
          <p className="text-sm font-bold text-slate-900 mt-0.5 font-mono">
            {warningLatencySec !== null ? `${warningLatencySec.toFixed(2)}s` : '—'}
          </p>
        </div>

        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Early Warning Margin</p>
          <p
            className={`text-sm font-bold mt-0.5 font-mono ${
              isEarlyWarning ? 'text-emerald-700' : isPostCallDetection ? 'text-amber-700' : 'text-slate-900'
            }`}
          >
            {earlyWarningMarginSec !== null ? `${earlyWarningMarginSec > 0 ? '+' : ''}${earlyWarningMarginSec.toFixed(2)}s` : '—'}
          </p>
        </div>

        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Warning Trigger</p>
          <p className="text-sm font-bold text-slate-900 mt-0.5">
            {isEarlyWarning ? 'Mid-Call' : isPostCallDetection ? 'Post-Call' : 'None'}
          </p>
        </div>

        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Clock Standard</p>
          <p className="text-sm font-bold text-slate-900 mt-0.5 font-mono text-[11px]">
            Monotonic (performance.now)
          </p>
        </div>
      </div>

      {/* Step-by-step event log */}
      {events.length > 0 ? (
        <div className="space-y-2 pt-1">
          <p className="text-[11px] font-semibold text-slate-600">Event Audit Trail:</p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {events.map((ev, idx) => (
              <div
                key={ev.id || idx}
                className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50/70 border border-slate-200 text-xs"
              >
                <span className="font-mono text-[10px] text-blue-700 font-bold bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded flex-shrink-0">
                  {ev.playbackTimeSec.toFixed(1)}s
                </span>
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-slate-800">{ev.title}</span>
                  <span className="text-slate-500 ml-2">{ev.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-400 italic">Timeline events will record once audio playback begins.</p>
      )}
    </div>
  );
}
