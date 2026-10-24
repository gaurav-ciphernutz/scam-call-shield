import { useScamShield, DEMO_CALLS } from './hooks/useScamShield';
import { CallSelector } from './components/CallSelector';
import { PlaybackControls } from './components/PlaybackControls';
import { StatusBar } from './components/StatusBar';
import { TranscriptPanel } from './components/TranscriptPanel';
import { AssessmentPanel } from './components/AssessmentPanel';
import { WarningBanner } from './components/WarningBanner';
import { ErrorBanner } from './components/ErrorBanner';
import { WelcomePanel } from './components/WelcomePanel';
import { ThreatMeter } from './components/ThreatMeter';
import { DetectionTimelinePanel } from './components/DetectionTimelinePanel';

function App() {
  const [state, actions] = useScamShield();
  const {
    selectedCall,
    streamingState,
    connectionState,
    currentTime,
    duration,
    transcript,
    assessment,
    error,
    timeline,
  } = state;

  const isPlaying = streamingState === 'streaming';
  const isPaused = streamingState === 'paused';
  const isActive = isPlaying || isPaused;
  const hasEnded = streamingState === 'ended';

  return (
    <div className="min-h-screen bg-[#F5F8FF] text-slate-900 flex flex-col font-sans selection:bg-blue-100 selection:text-blue-900">
      {/* 1. Header */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5 sticky top-0 z-30 shadow-2xs">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Blue Shield Logo */}
            <div className="p-2 rounded-xl bg-blue-600 text-white shadow-sm flex-shrink-0">
              <svg className="w-6 h-6" viewBox="0 0 100 100" fill="none">
                <path d="M50 5 L90 20 L90 55 Q90 80 50 95 Q10 80 10 55 L10 20 Z" fill="currentColor" />
                <path d="M35 50 L45 60 L65 40" stroke="white" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                  Scam Call Shield
                </h1>
                <span className="hidden sm:inline-flex text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                  v1.0 Live
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Real-time voice AI protection against phone scams in India
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Gemini Live indicator */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 shadow-2xs">
              <svg className="w-3.5 h-3.5 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L14.4 7.6L20 10L14.4 12.4L12 18L9.6 12.4L4 10L9.6 7.6L12 2Z" />
              </svg>
              <span className="hidden md:inline text-slate-500">Engine:</span>
              <span className="font-semibold text-slate-800">Gemini 3.8 Live</span>
            </div>

            {/* Hackathon Badge */}
            <span className="hidden lg:inline-flex text-[11px] font-semibold text-slate-600 px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200">
              Garbathon 2026
            </span>
          </div>
        </div>
      </header>

      {/* 2. Demo mode notice banner */}
      <div className="bg-blue-50/70 border-b border-blue-100 px-4 py-2">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-xs text-blue-900">
          <p className="flex items-center gap-2">
            <span className="text-blue-600 font-bold" aria-hidden="true">ⓘ</span>
            <span>
              <strong>Demonstration Mode</strong> — Pre-recorded test scenarios representing scam attempts and legitimate calls.
            </span>
          </p>
          <span className="hidden md:inline-block text-[11px] font-mono text-blue-600/80">
            No live telephony or microphone required
          </span>
        </div>
      </div>

      <main className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6 flex-1">
        {/* Error notification */}
        {error && <ErrorBanner message={error} />}

        {/* 3. Scenario Selector Section */}
        <section aria-label="Demo call scenario selection">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                1. Select Call Scenario
              </h2>
              <p className="text-xs text-slate-600">
                Choose an attack vector or legitimate call to simulate an incoming phone conversation.
              </p>
            </div>
            {selectedCall && (
              <span className="text-xs text-blue-700 font-semibold bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                Active: {selectedCall.subtitle}
              </span>
            )}
          </div>

          <CallSelector
            calls={DEMO_CALLS}
            selectedCall={selectedCall}
            onSelect={actions.selectCall}
            disabled={isActive}
          />
        </section>

        {/* 4. Monitoring Workspace when a call is selected */}
        {selectedCall ? (
          <section aria-label="Live monitoring workspace" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  2. Live Audio & AI Monitoring Workspace
                </h2>
                <p className="text-xs text-slate-700 mt-0.5">
                  Simulating incoming audio stream: <strong className="text-slate-900">{selectedCall.title}</strong>
                </p>
              </div>

              {/* Status bar */}
              <StatusBar
                connectionState={connectionState}
                streamingState={streamingState}
                assessment={assessment}
              />
            </div>

            {/* Prominent High-Risk Warning (Placed at top of workspace for instant visibility) */}
            {assessment && assessment.riskLevel === 'high' && (
              <WarningBanner assessment={assessment} />
            )}

            {/* Playback & Waveform Controls */}
            <PlaybackControls
              isPlaying={isPlaying}
              isPaused={isPaused}
              hasEnded={hasEnded}
              currentTime={currentTime}
              duration={duration || undefined}
              onPlay={actions.play}
              onPause={actions.pause}
              onStop={actions.stop}
              onRestart={actions.restart}
            />

            {/* 2-Column Split: Left = Live Transcript | Right = Threat Meter & Evidence Assessment */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
              {/* Left Column: Live Call Transcript with suspicious phrase highlights */}
              <div className="flex flex-col">
                <TranscriptPanel
                  transcript={transcript}
                  redFlags={assessment?.redFlags}
                  isLive={isActive}
                />
              </div>

              {/* Right Column: Threat Meter & Grounded Evidence */}
              <div className="flex flex-col space-y-4">
                <ThreatMeter assessment={assessment} />
                <AssessmentPanel
                  assessment={assessment}
                  isAnalyzing={isActive && !assessment}
                />
              </div>
            </div>

            {/* AI Detection Timeline & Latency Audit Trail */}
            <DetectionTimelinePanel timeline={timeline} />
          </section>
        ) : (
          /* 5. Welcome Panel before a scenario is selected */
          <WelcomePanel />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 mt-auto px-4 py-4 bg-white">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <p>
            Scam Call Shield • Garbathon 2026 Google Voice AI Submission
          </p>
          <p className="text-[11px] text-slate-400">
            Advisory risk signal. Model assessments are probabilistic and do not guarantee safety.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
