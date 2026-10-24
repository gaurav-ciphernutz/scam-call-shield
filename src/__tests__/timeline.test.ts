import { describe, it, expect } from 'vitest';
import { createInitialTimeline, recordTimelineEvent } from '../utils/timeline';

describe('DetectionTimeline', () => {
  it('initializes with clean default values', () => {
    const timeline = createInitialTimeline();
    expect(timeline.playbackStartTimeMs).toBeNull();
    expect(timeline.firstAssessmentTimeMs).toBeNull();
    expect(timeline.warningVisibleTimeMs).toBeNull();
    expect(timeline.playbackEndTimeMs).toBeNull();
    expect(timeline.earlyWarningMarginSec).toBeNull();
    expect(timeline.events).toHaveLength(0);
  });

  it('records playback start and timestamps accurately', () => {
    const t0 = createInitialTimeline();
    const t1 = recordTimelineEvent(t0, 'playback_start', 0, 'Playback Started', 'Audio stream started', undefined, 1000);

    expect(t1.playbackStartTimeMs).toBe(1000);
    expect(t1.events).toHaveLength(1);
    expect(t1.events[0].type).toBe('playback_start');
  });

  it('calculates early warning lead time when warning appears before end', () => {
    let t = createInitialTimeline();
    t = recordTimelineEvent(t, 'playback_start', 0, 'Start', 'start', undefined, 1000);
    t = recordTimelineEvent(t, 'first_assessment', 4.5, 'First Assess', 'medium', 'medium', 5500);
    // Warning visible at +8.0s (timestamp 9000)
    t = recordTimelineEvent(t, 'warning_visible', 8.0, 'Warning Visible', 'threat detected', 'high', 9000);
    // Playback ends at 15.0s (timestamp 16000)
    t = recordTimelineEvent(t, 'playback_end', 15.0, 'Playback Complete', 'end', undefined, 16000);

    expect(t.warningVisibleTimeMs).toBe(9000);
    expect(t.playbackEndTimeMs).toBe(16000);
    // Margin = (16000 - 9000) / 1000 = +7.00s
    expect(t.earlyWarningMarginSec).toBe(7);
    expect(t.isEarlyWarning).toBe(true);
    expect(t.isPostCallDetection).toBe(false);
  });

  it('honestly labels post-call detection when warning appears after end', () => {
    let t = createInitialTimeline();
    t = recordTimelineEvent(t, 'playback_start', 0, 'Start', 'start', undefined, 1000);
    // Playback ends at 13.0s (timestamp 14000)
    t = recordTimelineEvent(t, 'playback_end', 13.0, 'End', 'end', undefined, 14000);
    // Warning visible after call at timestamp 16500 (+2.5s post-call)
    t = recordTimelineEvent(t, 'warning_visible', 13.0, 'Warning Visible', 'late arrival', 'high', 16500);

    expect(t.earlyWarningMarginSec).toBe(-2.5);
    expect(t.isEarlyWarning).toBe(false);
    expect(t.isPostCallDetection).toBe(true);
  });
});
