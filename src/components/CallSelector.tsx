import type { DemoCall } from '../types';

interface CallSelectorProps {
  calls: DemoCall[];
  selectedCall: DemoCall | null;
  onSelect: (call: DemoCall) => void;
  disabled?: boolean;
}

const RISK_BADGE = {
  high: 'bg-rose-50 text-rose-700 border-rose-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  unknown: 'bg-slate-100 text-slate-700 border-slate-200',
};

const FLAG_ICON: Record<string, string> = {
  'gu-scam': '🇮🇳',
  'hi-scam': '🇮🇳',
  'en-kyc-scam': '🏦',
  'en-genuine': '🛵',
};

const LANG_LABEL: Record<string, string> = {
  gu: 'ગુજરાતી (gu)',
  hi: 'हिंदी (hi)',
  en: 'English (en)',
};

export function CallSelector({ calls, selectedCall, onSelect, disabled }: CallSelectorProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
      {calls.map((call) => {
        const isSelected = selectedCall?.id === call.id;
        const isGenuine = call.expectedRisk === 'low';

        return (
          <button
            key={call.id}
            onClick={() => !disabled && onSelect(call)}
            disabled={disabled}
            aria-pressed={isSelected}
            aria-label={`Select ${call.subtitle}`}
            className={[
              'relative text-left p-4 rounded-xl border transition-all duration-150 flex flex-col justify-between group shadow-2xs',
              'focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2',
              isSelected
                ? 'bg-blue-50/50 border-blue-600 ring-2 ring-blue-600/20 shadow-md'
                : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-xs',
              disabled && !isSelected ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
            ].join(' ')}
          >
            <div>
              {/* Header row: Flag + Badges */}
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-base" role="img" aria-hidden="true">
                    {FLAG_ICON[call.id] ?? '📞'}
                  </span>
                  <span className="text-[11px] font-mono font-medium text-slate-500">
                    {LANG_LABEL[call.language] || call.language.toUpperCase()}
                  </span>
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    RISK_BADGE[call.expectedRisk]
                  }`}
                >
                  {isGenuine ? 'Genuine Call' : 'Scam Attack'}
                </span>
              </div>

              {/* Title & subtitle */}
              <h3 className="font-semibold text-slate-900 text-sm leading-snug group-hover:text-blue-600 transition-colors">
                {call.title}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{call.subtitle}</p>

              {/* Preview excerpt */}
              <div className="mt-3 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <p className="text-[11px] text-slate-600 italic line-clamp-2 leading-relaxed">
                  "{call.script.split('\n')[0].trim()}"
                </p>
              </div>
            </div>

            {/* Selected pill footer */}
            <div className="mt-3.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
              {isSelected ? (
                <span className="flex items-center gap-1.5 font-semibold text-blue-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                  Selected Channel
                </span>
              ) : (
                <span className="text-slate-400 group-hover:text-slate-600 transition-colors">
                  Click to select
                </span>
              )}
              <span className="text-slate-400 font-mono text-[10px]">
                {isGenuine ? 'Safe Ref' : 'Threat'}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
