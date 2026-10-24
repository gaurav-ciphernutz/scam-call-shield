import { AudioVisualizer } from './AudioVisualizer';

interface PlaybackControlsProps {
  isPlaying: boolean;
  isPaused: boolean;
  hasEnded: boolean;
  currentTime: number;
  duration?: number;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onRestart: () => void;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function PlaybackControls({
  isPlaying,
  isPaused,
  hasEnded,
  currentTime,
  duration,
  onPlay,
  onPause,
  onStop,
  onRestart,
}: PlaybackControlsProps) {
  const progress = duration && duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;
  const isActive = isPlaying || isPaused;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        {/* Playback status label & digital timer */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isPlaying
                  ? 'bg-blue-600 animate-pulse'
                  : isPaused
                  ? 'bg-amber-500'
                  : hasEnded
                  ? 'bg-emerald-600'
                  : 'bg-slate-400'
              }`}
            />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              {isPlaying
                ? 'Streaming Call Audio'
                : isPaused
                ? 'Analysis Paused'
                : hasEnded
                ? 'Stream Complete'
                : 'Ready to Stream'}
            </span>
          </div>

          <div className="px-2.5 py-1 rounded-md bg-blue-50 border border-blue-200 font-mono text-xs font-bold text-blue-700">
            {formatTime(currentTime)}
            <span className="text-slate-400 mx-1">/</span>
            <span className="text-slate-600">{duration ? formatTime(duration) : '0:00'}</span>
          </div>
        </div>

        {/* Live Audio Waveform visualization */}
        <div className="flex-1 max-w-xs">
          <AudioVisualizer isPlaying={isPlaying} isPaused={isPaused} hasEnded={hasEnded} />
        </div>
      </div>

      {/* Scrubber progress bar */}
      <div className="mb-4">
        <div
          className="h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200"
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Playback progress"
        >
          <div
            className={`h-full rounded-full transition-all duration-200 ${
              isPlaying
                ? 'bg-gradient-to-r from-blue-600 to-cyan-600'
                : isPaused
                ? 'bg-amber-500'
                : hasEnded
                ? 'bg-emerald-600'
                : 'bg-slate-300'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          {/* Primary Play / Pause / Restart Button */}
          {!hasEnded ? (
            <button
              onClick={isPlaying ? onPause : onPlay}
              aria-label={isPlaying ? 'Pause analysis' : isPaused ? 'Resume analysis' : 'Start analysis'}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm transition-all shadow-xs focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                isPlaying
                  ? 'bg-amber-600 hover:bg-amber-700 text-white focus:ring-amber-500'
                  : 'bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-600 shadow-blue-600/20'
              }`}
            >
              {isPlaying ? (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7 0a.75.75 0 01.75-.75H16.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H14.5a.75.75 0 01-.75-.75V5.25z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Pause
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {isPaused ? 'Resume' : 'Analyze Call'}
                </>
              )}
            </button>
          ) : (
            <button
              onClick={onRestart}
              aria-label="Restart analysis"
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M4.755 10.059a7.5 7.5 0 0112.548-3.364l1.903 1.903h-3.183a.75.75 0 100 1.5h4.992a.75.75 0 00.75-.75V4.356a.75.75 0 00-1.5 0v3.18l-1.9-1.9A9 9 0 003.306 9.67a.75.75 0 101.45.388zm15.408 3.352a.75.75 0 00-.919.53 7.5 7.5 0 01-12.548 3.364l-1.902-1.903h3.183a.75.75 0 000-1.5H2.984a.75.75 0 00-.75.75v4.992a.75.75 0 001.5 0v-3.18l1.9 1.9a9 9 0 0015.059-4.035.75.75 0 00-.53-.918z"
                  clipRule="evenodd"
                />
              </svg>
              Analyze Again
            </button>
          )}

          {/* Stop Button */}
          {isActive && (
            <button
              onClick={onStop}
              aria-label="Stop analysis"
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
            >
              <svg className="w-4 h-4 text-rose-600" viewBox="0 0 24 24" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M4.5 7.5a3 3 0 013-3h9a3 3 0 013 3v9a3 3 0 01-3 3h-9a3 3 0 01-3-3v-9z"
                  clipRule="evenodd"
                />
              </svg>
              Stop
            </button>
          )}

          {/* Restart Button (when active) */}
          {isActive && (
            <button
              onClick={onRestart}
              aria-label="Restart from beginning"
              className="p-2.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-transparent hover:border-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
              title="Restart"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M4.755 10.059a7.5 7.5 0 0112.548-3.364l1.903 1.903h-3.183a.75.75 0 100 1.5h4.992a.75.75 0 00.75-.75V4.356a.75.75 0 00-1.5 0v3.18l-1.9-1.9A9 9 0 003.306 9.67a.75.75 0 101.45.388zm15.408 3.352a.75.75 0 00-.919.53 7.5 7.5 0 01-12.548 3.364l-1.902-1.903h3.183a.75.75 0 000-1.5H2.984a.75.75 0 00-.75.75v4.992a.75.75 0 001.5 0v-3.18l1.9 1.9a9 9 0 0015.059-4.035.75.75 0 00-.53-.918z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          )}
        </div>

        <div className="text-[11px] text-slate-500 font-medium">
          PCM 16 kHz mono • 100 ms live chunks
        </div>
      </div>
    </div>
  );
}
