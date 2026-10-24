interface AudioVisualizerProps {
  isPlaying: boolean;
  isPaused: boolean;
  hasEnded: boolean;
}

export function AudioVisualizer({ isPlaying, isPaused, hasEnded }: AudioVisualizerProps) {
  // Preset animation delay and height multipliers for 24 frequency bars
  const bars = [
    { height: 'h-3.5', delay: '0.1s' },
    { height: 'h-6', delay: '0.3s' },
    { height: 'h-9', delay: '0.15s' },
    { height: 'h-5', delay: '0.4s' },
    { height: 'h-7', delay: '0.2s' },
    { height: 'h-10', delay: '0.5s' },
    { height: 'h-4', delay: '0.25s' },
    { height: 'h-8', delay: '0.35s' },
    { height: 'h-11', delay: '0.1s' },
    { height: 'h-7', delay: '0.45s' },
    { height: 'h-5', delay: '0.3s' },
    { height: 'h-9', delay: '0.2s' },
    { height: 'h-11', delay: '0.4s' },
    { height: 'h-6', delay: '0.15s' },
    { height: 'h-8', delay: '0.5s' },
    { height: 'h-4', delay: '0.35s' },
    { height: 'h-10', delay: '0.25s' },
    { height: 'h-7', delay: '0.1s' },
    { height: 'h-5', delay: '0.45s' },
    { height: 'h-9', delay: '0.3s' },
    { height: 'h-6', delay: '0.2s' },
    { height: 'h-8', delay: '0.4s' },
    { height: 'h-4', delay: '0.15s' },
    { height: 'h-3.5', delay: '0.5s' },
  ];

  return (
    <div
      className="flex items-end justify-center gap-1 h-11 px-3 py-1 bg-slate-100/90 rounded-lg border border-slate-200"
      aria-hidden="true"
    >
      {bars.map((bar, i) => (
        <span
          key={i}
          className={`w-1 rounded-full transition-all duration-300 ${bar.height} ${
            isPlaying
              ? 'bg-gradient-to-t from-blue-600 to-cyan-500 animate-wave'
              : isPaused
              ? 'bg-amber-500/70 scale-y-50'
              : hasEnded
              ? 'bg-emerald-600/50 scale-y-25'
              : 'bg-slate-300 scale-y-25'
          }`}
          style={isPlaying ? { animationDelay: bar.delay } : undefined}
        />
      ))}
    </div>
  );
}
