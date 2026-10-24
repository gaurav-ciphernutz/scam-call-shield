import type { ScamAssessment } from '../types';

interface WarningBannerProps {
  assessment: ScamAssessment;
}

export function WarningBanner({ assessment }: WarningBannerProps) {
  const { warning, language } = assessment;

  if (!warning) return null;

  return (
    <div
      className="bg-rose-50 border-2 border-rose-500 rounded-xl p-5 shadow-sm transition-all"
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      <div className="flex items-start gap-4">
        {/* Warning Icon Badge */}
        <div className="flex-shrink-0 p-2.5 rounded-xl bg-rose-100 border border-rose-200 text-rose-700">
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 1.999-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z"
              clipRule="evenodd"
            />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-white font-extrabold text-xs uppercase tracking-wider bg-rose-600 px-2 py-0.5 rounded shadow-2xs">
              ⚠️ Scam Alert
            </span>
            {language !== 'en' && language !== 'unknown' && (
              <span className="text-xs font-bold bg-white text-rose-800 px-2.5 py-0.5 rounded-full border border-rose-300">
                {language === 'gu' ? 'ગુજરાતી' : 'हिंदी'}
              </span>
            )}
          </div>

          {/* Warning text — large, dark, and clear */}
          <p
            className="text-slate-900 font-bold text-base sm:text-lg leading-relaxed tracking-wide"
            lang={language !== 'unknown' ? language : undefined}
          >
            {warning}
          </p>

          {/* Actionable guidance chips */}
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="bg-white border border-rose-200 text-rose-800 px-3 py-1 rounded-full shadow-2xs">
              🚫 Do not transfer money
            </span>
            <span className="bg-white border border-rose-200 text-rose-800 px-3 py-1 rounded-full shadow-2xs">
              🚫 Do not share OTP or PIN
            </span>
            <span className="bg-white border border-rose-200 text-rose-800 px-3 py-1 rounded-full shadow-2xs">
              📞 Dial Cybercrime Helpline: 1930
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
