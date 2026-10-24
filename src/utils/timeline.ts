/**
 * Monotonic Detection Timeline tracking for Scam Call Shield.
 *
 * Uses browser performance.now() for monotonic elapsed time calculations
 * alongside ISO 8601 timestamps for audit logging.
 */

import type { DetectionTimeline, DetectionTimelineEvent, RiskLevel } from '../types';

export function createInitialTimeline(): DetectionTimeline {
  return {
    playbackStartTimeMs: null,
    firstAssessmentTimeMs: null,
    warningVisibleTimeMs: null,
    playbackEndTimeMs: null,
    totalDurationSec: 0,
    earlyWarningMarginSec: null,
    isEarlyWarning: false,
    isPostCallDetection: false,
    events: [],
  };
}

export function recordTimelineEvent(
  timeline: DetectionTimeline,
  type: DetectionTimelineEvent['type'],
  playbackTimeSec: number,
  title: string,
  detail: string,
  riskLevel?: RiskLevel,
  nowMs: number = (typeof performance !== 'undefined' ? performance.now() : Date.now()),
): DetectionTimeline {
  const event: DetectionTimelineEvent = {
    id: `${type}_${Math.round(nowMs)}_${timeline.events.length}`,
    type,
    timestampMs: nowMs,
    playbackTimeSec: Math.max(0, Math.round(playbackTimeSec * 10) / 10),
    wallClockIso: new Date().toISOString(),
    title,
    detail,
    riskLevel,
  };

  const updated: DetectionTimeline = {
    ...timeline,
    events: [...timeline.events, event],
  };

  if (type === 'playback_start' && updated.playbackStartTimeMs === null) {
    updated.playbackStartTimeMs = nowMs;
  }

  if (type === 'first_assessment' && updated.firstAssessmentTimeMs === null) {
    updated.firstAssessmentTimeMs = nowMs;
  }

  if (type === 'warning_visible' && updated.warningVisibleTimeMs === null) {
    updated.warningVisibleTimeMs = nowMs;
  }

  if (type === 'playback_end' && updated.playbackEndTimeMs === null) {
    updated.playbackEndTimeMs = nowMs;
    updated.totalDurationSec = playbackTimeSec;
  }

  // Calculate early warning lead time or post-call detection
  if (updated.warningVisibleTimeMs !== null && updated.playbackEndTimeMs !== null) {
    const marginMs = updated.playbackEndTimeMs - updated.warningVisibleTimeMs;
    const marginSec = Math.round((marginMs / 1000) * 100) / 100;
    updated.earlyWarningMarginSec = marginSec;
    updated.isEarlyWarning = marginSec > 0;
    updated.isPostCallDetection = marginSec < 0;
  }

  return updated;
}
