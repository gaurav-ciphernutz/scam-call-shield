interface ErrorBannerProps {
  message: string;
}

export function ErrorBanner({ message }: ErrorBannerProps) {
  return (
    <div
      className="bg-rose-50 border border-rose-200 rounded-xl p-4 shadow-sm"
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div className="p-1 rounded-md bg-rose-100 text-rose-700 flex-shrink-0 mt-0.5">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm-1.72 6.97a.75.75 0 10-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 101.06 1.06L12 13.06l1.72 1.72a.75.75 0 101.06-1.06L13.06 12l1.72-1.72a.75.75 0 10-1.06-1.06L12 10.94l-1.72-1.72z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div>
          <p className="text-sm font-bold text-rose-800">System Notification</p>
          <p className="text-xs text-rose-700 mt-0.5 leading-relaxed">{message}</p>
          <p className="text-[11px] text-slate-500 mt-1">
            Ensure the local backend server is running (<code className="text-blue-600 font-mono">npm run dev:server</code>) and GEMINI_API_KEY is configured.
          </p>
        </div>
      </div>
    </div>
  );
}
