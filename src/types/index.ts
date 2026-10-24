// Core types for Scam Call Shield

export type RiskLevel = 'low' | 'medium' | 'high' | 'unknown';
export type Language = 'gu' | 'hi' | 'en' | 'unknown';
export type FlagCategory =
  | 'urgency'
  | 'threat'
  | 'otp_request'
  | 'money_request'
  | 'impersonation'
  | 'credential_request';

export type PlaybackState = 'idle' | 'playing' | 'paused' | 'ended' | 'error';
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface RedFlag {
  category: FlagCategory;
  evidence: string;
  explanation: string;
}

export interface ScamAssessment {
  riskLevel: RiskLevel;
  language: Language;
  redFlags: RedFlag[];
  warning: string;
  assessmentComplete: boolean;
  transcript?: string;
}

export interface DemoCall {
  id: string;
  title: string;
  subtitle: string;
  language: Language;
  audioFile: string;
  script: string;
  expectedRisk: RiskLevel;
}

export interface AudioStreamConfig {
  sampleRate: number;      // 16000 Hz for Gemini
  channels: number;        // 1 (mono)
  bitDepth: number;        // 16-bit
  chunkDurationMs: number; // ~100ms chunks
}

export interface EphemeralTokenResponse {
  token: string;
  expiresAt: number;
}

// ─── Threat Meter Types ───────────────────────────────────────────────────────

export type ThreatCategory = 'safe' | 'suspicious' | 'high' | 'evaluating';

export interface ThreatScore {
  score: number; // 0 to 100
  category: ThreatCategory;
  label: string; // e.g. "Safe (5/100)", "Suspicious (45/100)", "High Risk (90/100)"
  breakdown: string[]; // deterministic calculation points
}

// ─── Transcript Highlighting Types ────────────────────────────────────────────

export interface TranscriptSegment {
  text: string;
  isHighlighted: boolean;
  flag?: RedFlag;
}

// ─── Detection Timeline Types ─────────────────────────────────────────────────

export type TimelineEventType =
  | 'playback_start'
  | 'first_assessment'
  | 'risk_escalation'
  | 'warning_visible'
  | 'playback_end'
  | 'assessment_complete';

export interface DetectionTimelineEvent {
  id: string;
  type: TimelineEventType;
  timestampMs: number; // Monotonic performance.now()
  playbackTimeSec: number; // Audio position (e.g. 4.2s)
  wallClockIso: string; // ISO 8601 string for auditing
  title: string;
  detail: string;
  riskLevel?: RiskLevel;
}

export interface DetectionTimeline {
  playbackStartTimeMs: number | null;
  firstAssessmentTimeMs: number | null;
  warningVisibleTimeMs: number | null;
  playbackEndTimeMs: number | null;
  totalDurationSec: number;
  earlyWarningMarginSec: number | null; // Positive = lead time before end, Negative = post-call
  isEarlyWarning: boolean;
  isPostCallDetection: boolean;
  events: DetectionTimelineEvent[];
}

export type AssessmentStatus = 'idle' | 'analyzing' | 'throttled' | 'retrying' | 'complete' | 'error';

