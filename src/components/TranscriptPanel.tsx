import { memo, useMemo } from 'react';
import type { RedFlag } from '../types';
import { highlightTranscript } from '../utils/transcriptHighlight';

interface TranscriptPanelProps {
  transcript: string;
  redFlags?: RedFlag[];
  isLive: boolean;
}

const EMPTY_FLAGS: RedFlag[] = [];

const CATEGORY_COLORS: Record<string, string> = {
  urgency: 'bg-amber-100 text-amber-900 border-amber-300',
  threat: 'bg-rose-100 text-rose-900 border-rose-400 font-semibold',
  otp_request: 'bg-purple-100 text-purple-900 border-purple-400 font-semibold',
  money_request: 'bg-rose-100 text-rose-900 border-rose-400 font-semibold',
  impersonation: 'bg-amber-100 text-amber-900 border-amber-300',
  credential_request: 'bg-purple-100 text-purple-900 border-purple-400 font-semibold',
};

export const TranscriptPanel = memo(function TranscriptPanel({
  transcript,
  redFlags = EMPTY_FLAGS,
  isLive,
}: TranscriptPanelProps) {
  const segments = useMemo(
    () => highlightTranscript(transcript, redFlags),
    [transcript, redFlags],
  );
  const hasHighlights = useMemo(
    () => segments.some(s => s.isHighlighted),
    [segments],
  );

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 mb-3 pb-2.5 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <h3 className="text-sm font-semibold text-slate-900">Live Call Transcript</h3>
        </div>
        <div className="flex items-center gap-2">
          {hasHighlights && (
            <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
              Suspicious Phrases Highlighted
            </span>
          )}
          {isLive && (
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-ping" />
              Transcribing Live
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-[140px] max-h-64 overflow-y-auto pr-1">
        {transcript ? (
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-sm leading-relaxed font-sans">
            {segments.map((segment, idx) => {
              if (!segment.isHighlighted || !segment.flag) {
                return <span key={idx}>{segment.text}</span>;
              }

              const flag = segment.flag;
              const colorClass = CATEGORY_COLORS[flag.category] || 'bg-rose-100 text-rose-900 border-rose-300';

              return (
                <mark
                  key={idx}
                  className={`border-b-2 px-1 py-0.5 rounded mx-0.5 cursor-help inline-block group relative ${colorClass}`}
                  title={`${flag.category.replace('_', ' ').toUpperCase()}: ${flag.explanation}`}
                >
                  {segment.text}
                  {/* Tooltip on hover */}
                  <span className="hidden group-hover:block absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1.5 z-30 w-64 p-2.5 bg-slate-900 text-white text-[11px] rounded-lg shadow-xl pointer-events-none">
                    <span className="font-bold text-rose-300 uppercase tracking-wide block mb-0.5">
                      {flag.category.replace('_', ' ')}
                    </span>
                    <span className="text-slate-200 leading-snug block">
                      {flag.explanation}
                    </span>
                  </span>
                </mark>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full min-h-[120px] text-slate-400 text-xs italic">
            <svg className="w-6 h-6 mb-2 opacity-50 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
            </svg>
            <p>{isLive ? 'Waiting for transcription…' : 'No transcript available.'}</p>
          </div>
        )}
      </div>
    </div>
  );
});
