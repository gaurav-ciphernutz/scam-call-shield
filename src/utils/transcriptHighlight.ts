/**
 * Exact Phrase Highlighting for Scam Call Shield transcripts.
 *
 * Rules:
 * 1. Highlights ONLY suspicious phrases matched to actual transcript text.
 * 2. Unmatched model evidence is never injected or synthesized into the transcript.
 * 3. Supports Gujarati, Hindi (Devanagari), and English text.
 * 4. Returns structured TranscriptSegment array for pure React rendering (NO dangerouslySetInnerHTML).
 */

import type { RedFlag, TranscriptSegment } from '../types';

interface MatchSpan {
  start: number;
  end: number;
  flag: RedFlag;
}

/**
 * Clean quote marks or leading/trailing punctuation from evidence string for substring matching.
 */
function cleanEvidence(evidence: string): string {
  return evidence
    .replace(/^["'«“‘]+|["'»”’]+$/g, '')
    .trim();
}

export function highlightTranscript(
  transcript: string,
  redFlags: RedFlag[],
): TranscriptSegment[] {
  if (!transcript) return [];
  if (!redFlags || redFlags.length === 0) {
    return [{ text: transcript, isHighlighted: false }];
  }

  const spans: MatchSpan[] = [];
  const lowerTranscript = transcript.toLowerCase();

  for (const flag of redFlags) {
    const rawTarget = cleanEvidence(flag.evidence);
    if (!rawTarget || rawTarget.length < 2) continue;

    // Search in transcript (exact search first, then case-insensitive for Latin)
    let startIdx = transcript.indexOf(rawTarget);
    if (startIdx === -1) {
      startIdx = lowerTranscript.indexOf(rawTarget.toLowerCase());
    }

    if (startIdx !== -1) {
      const endIdx = startIdx + rawTarget.length;
      // Check for overlap with existing spans
      const overlaps = spans.some(
        s => (startIdx >= s.start && startIdx < s.end) || (endIdx > s.start && endIdx <= s.end)
      );
      if (!overlaps) {
        spans.push({
          start: startIdx,
          end: endIdx,
          flag,
        });
      }
    }
  }

  if (spans.length === 0) {
    return [{ text: transcript, isHighlighted: false }];
  }

  // Sort spans by start index
  spans.sort((a, b) => a.start - b.start);

  const segments: TranscriptSegment[] = [];
  let cursor = 0;

  for (const span of spans) {
    if (span.start > cursor) {
      segments.push({
        text: transcript.slice(cursor, span.start),
        isHighlighted: false,
      });
    }

    segments.push({
      text: transcript.slice(span.start, span.end),
      isHighlighted: true,
      flag: span.flag,
    });

    cursor = span.end;
  }

  if (cursor < transcript.length) {
    segments.push({
      text: transcript.slice(cursor),
      isHighlighted: false,
    });
  }

  return segments;
}
