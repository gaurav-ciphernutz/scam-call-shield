export function WelcomePanel() {
  const steps = [
    {
      step: '01',
      title: 'Select a Scenario',
      desc: 'Choose from Gujarati or Hindi Digital Arrest threats, English Bank KYC phishing, or a genuine Swiggy delivery call.',
      icon: (
        <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
      ),
    },
    {
      step: '02',
      title: 'Stream Live Audio',
      desc: 'Audio is decoded, resampled to 16 kHz mono signed PCM, and streamed in real-time chunks to Google Gemini Live.',
      icon: (
        <svg className="w-5 h-5 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
        </svg>
      ),
    },
    {
      step: '03',
      title: 'Real-Time Scam Shield',
      desc: 'Gemini evaluates intent and detects extortion or OTP theft, triggering evidence-backed warnings before the call finishes.',
      icon: (
        <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
      <div className="text-center max-w-xl mx-auto mb-6">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 mb-2">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
          Ready for Live Demonstration
        </span>
        <h3 className="text-base sm:text-lg font-bold text-slate-900">
          How Scam Call Shield Evaluates Calls
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Select any call scenario above to activate the real-time AI security monitoring workspace.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {steps.map((item) => (
          <div
            key={item.step}
            className="bg-slate-50/80 border border-slate-200/90 rounded-xl p-4 flex flex-col justify-between hover:bg-slate-50 transition-colors"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="p-2 rounded-lg bg-white border border-slate-200 shadow-2xs">
                  {item.icon}
                </span>
                <span className="text-xs font-mono font-bold text-slate-400">
                  {item.step}
                </span>
              </div>
              <h4 className="text-sm font-semibold text-slate-900 mb-1">
                {item.title}
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                {item.desc}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
