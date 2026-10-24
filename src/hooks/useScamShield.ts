/**
 * useScamShield - Main orchestration hook for Scam Call Shield.
 *
 * Manages:
 * - Demo call selection and audio pre-loading
 * - Gemini Live connection lifecycle (v1alpha WebSocket via ephemeral token)
 * - Audio streaming lifecycle (16 kHz mono signed 16-bit PCM chunks)
 * - Coordinated non-overlapping incremental assessments with in-flight guard
 * - Bounded backoff for 429/502/503/timeout
 * - Detection timeline and monotonic clock metrics
 * - Transcript accumulation and exact phrase evidence synchronization
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  DemoCall,
  ScamAssessment,
  ConnectionState,
  DetectionTimeline,
  AssessmentStatus,
} from '../types';
import { GeminiLiveService } from '../services/geminiLiveService';
import { AudioStreamingService, type StreamingState } from '../services/audioStreamingService';
import { mergeAssessments } from '../utils/assessmentUtils';
import { requestAssessment, AssessmentError } from '../services/assessService';
import { createInitialTimeline, recordTimelineEvent } from '../utils/timeline';
import { DEMO_CALLS } from '../utils/constants';

export interface ScamShieldState {
  selectedCall: DemoCall | null;
  streamingState: StreamingState;
  connectionState: ConnectionState;
  currentTime: number;
  duration: number;
  transcript: string;
  assessment: ScamAssessment | null;
  error: string | null;
  timeline: DetectionTimeline;
  assessmentStatus: AssessmentStatus;
}

export interface ScamShieldActions {
  selectCall: (call: DemoCall) => void;
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  restart: () => Promise<void>;
}

// Assessment interval: 1.6s pacing ensures rapid turn-around with in-flight serialization.
// Initial offset of 1.8s allows the opening identity claim to be captured in the first evaluation.
const MIN_ASSESS_INTERVAL_SEC = 1.6;
const INITIAL_ASSESS_OFFSET_SEC = 1.8;
const REQUEST_TIMEOUT_MS = 9000;

const INITIAL_STATE: ScamShieldState = {
  selectedCall: null,
  streamingState: 'idle',
  connectionState: 'disconnected',
  currentTime: 0,
  duration: 0,
  transcript: '',
  assessment: null,
  error: null,
  timeline: createInitialTimeline(),
  assessmentStatus: 'idle',
};

export function useScamShield(): [ScamShieldState, ScamShieldActions] {
  const [state, setState] = useState<ScamShieldState>(INITIAL_STATE);

  const geminiRef = useRef<GeminiLiveService | null>(null);
  const streamingRef = useRef<AudioStreamingService | null>(null);
  const assessmentRef = useRef<ScamAssessment | null>(null);
  const selectedCallRef = useRef<DemoCall | null>(null);
  const runIdRef = useRef<number>(0);
  const appliedUptoRef = useRef<number>(0);
  const haveAssessTranscriptRef = useRef<boolean>(false);

  // In-flight guard and rate coordination refs
  const isAssessingRef = useRef<boolean>(false);
  const activeAbortRef = useRef<AbortController | null>(null);
  const lastDispatchedAtRef = useRef<number>(0);
  const nextAllowedAssessTimeRef = useRef<number>(0);
  const consecutiveErrorsRef = useRef<number>(0);
  const timelineRef = useRef<DetectionTimeline>(createInitialTimeline());

  // Initialize services
  useEffect(() => {
    geminiRef.current = new GeminiLiveService();
    streamingRef.current = new AudioStreamingService();

    return () => {
      activeAbortRef.current?.abort();
      geminiRef.current?.disconnect();
      streamingRef.current?.destroy();
    };
  }, []);

  const setError = useCallback((error: string) => {
    setState(prev => ({ ...prev, error, connectionState: 'error', assessmentStatus: 'error' }));
  }, []);

  const selectCall = useCallback((call: DemoCall) => {
    // Abort active in-flight assessment
    activeAbortRef.current?.abort();
    activeAbortRef.current = null;
    isAssessingRef.current = false;

    if (geminiRef.current?.connected) {
      geminiRef.current.disconnect();
    }
    streamingRef.current?.stop();

    runIdRef.current++;
    selectedCallRef.current = call;
    assessmentRef.current = null;
    appliedUptoRef.current = 0;
    lastDispatchedAtRef.current = 0;
    nextAllowedAssessTimeRef.current = 0;
    consecutiveErrorsRef.current = 0;
    timelineRef.current = createInitialTimeline();

    setState({
      ...INITIAL_STATE,
      selectedCall: call,
      timeline: createInitialTimeline(),
    });

    // Pre-load audio for instant playback start
    streamingRef.current?.load(call.audioFile).catch(err => {
      console.warn('[useScamShield] Pre-load failed:', err);
    });
  }, []);

  const play = useCallback(async () => {
    const call = selectedCallRef.current;
    if (!call) {
      setError('Please select a call first.');
      return;
    }

    const gemini = geminiRef.current!;
    const streaming = streamingRef.current!;

    // If paused, resume
    if (streaming.currentState === 'paused' && gemini.connected) {
      streaming.resume();
      setState(prev => ({ ...prev, streamingState: 'streaming', error: null }));
      return;
    }

    // Fresh start: abort any existing requests and reset state
    activeAbortRef.current?.abort();
    activeAbortRef.current = null;
    isAssessingRef.current = false;

    const runId = ++runIdRef.current;
    appliedUptoRef.current = 0;
    lastDispatchedAtRef.current = 0;
    nextAllowedAssessTimeRef.current = 0;
    consecutiveErrorsRef.current = 0;
    haveAssessTranscriptRef.current = false;
    assessmentRef.current = null;

    timelineRef.current = createInitialTimeline();

    setState(prev => ({
      ...prev,
      connectionState: 'connecting',
      transcript: '',
      assessment: null,
      error: null,
      streamingState: 'loading',
      timeline: timelineRef.current,
      assessmentStatus: 'idle',
    }));

    try {
      // 1. Load audio buffer
      await streaming.load(call.audioFile);

      // 2. Connect to Gemini Live
      await gemini.connect({
        onConnected: () => {
          if (runId !== runIdRef.current) return;
          setState(prev => ({ ...prev, connectionState: 'connected' }));
        },
        onDisconnected: () => {
          if (runId !== runIdRef.current) return;
          setState(prev => ({ ...prev, connectionState: 'disconnected' }));
        },
        onTranscript: (text) => {
          if (runId !== runIdRef.current || haveAssessTranscriptRef.current) return;
          setState(prev => ({
            ...prev,
            transcript: prev.transcript ? prev.transcript + ' ' + text : text,
          }));
        },
        onAssessment: (live) => {
          if (runId !== runIdRef.current) return;
          const update = { ...live, transcript: undefined };
          const merged = mergeAssessments(assessmentRef.current, update);
          assessmentRef.current = merged;

          // Record high-risk warning timeline event if escalating
          if (merged.riskLevel === 'high' && timelineRef.current.warningVisibleTimeMs === null) {
            timelineRef.current = recordTimelineEvent(
              timelineRef.current,
              'warning_visible',
              state.currentTime,
              'High-Risk Warning Visible',
              `Triggered by Live engine: ${merged.warning || 'Scam detected'}`,
              'high',
            );
          }

          setState(prev => ({
            ...prev,
            assessment: merged,
            timeline: { ...timelineRef.current },
          }));
        },
        onError: (err) => {
          if (runId !== runIdRef.current) return;
          setError(`Analysis error: ${err.message}`);
          streaming.stop();
        },
      });

      // 3. Start audio playback and synchronized streaming
      streaming.start(gemini, {
        onStateChange: (newState) => {
          if (runId !== runIdRef.current) return;

          if (newState === 'streaming' && timelineRef.current.playbackStartTimeMs === null) {
            timelineRef.current = recordTimelineEvent(
              timelineRef.current,
              'playback_start',
              0,
              'Playback Started',
              `Streaming 16 kHz PCM audio for "${call.title}"`,
            );
          }

          if (newState === 'ended') {
            const finalPos = streamingRef.current?.duration || state.currentTime;
            timelineRef.current = recordTimelineEvent(
              timelineRef.current,
              'playback_end',
              finalPos,
              'Playback Completed',
              `Audio stream reached end (${finalPos.toFixed(1)}s)`,
            );

            const triggerFinal = () => {
              if (runId !== runIdRef.current || assessmentRef.current?.assessmentComplete) return;
              const fullPcm = streaming.pcmBase64UpTo(finalPos);
              if (!fullPcm) return;

              isAssessingRef.current = true;
              const finalAbort = new AbortController();
              activeAbortRef.current = finalAbort;

              requestAssessment(fullPcm, true, finalAbort.signal)
                .then(finalResult => {
                  if (runId !== runIdRef.current) return;
                  timelineRef.current = recordTimelineEvent(
                    timelineRef.current,
                    'assessment_complete',
                    finalPos,
                    'Final Assessment Complete',
                    `Final verdict: ${finalResult.riskLevel.toUpperCase()}`,
                    finalResult.riskLevel,
                  );
                  const merged = mergeAssessments(assessmentRef.current, finalResult);
                  assessmentRef.current = merged;
                  setState(prev => ({
                    ...prev,
                    assessment: merged,
                    transcript: finalResult.transcript ?? prev.transcript,
                    timeline: { ...timelineRef.current },
                    assessmentStatus: 'complete',
                  }));
                })
                .catch(err => {
                  if (runId === runIdRef.current && err.name !== 'AbortError') {
                    console.warn('[useScamShield] Final assessment error:', err);
                  }
                })
                .finally(() => {
                  if (runId === runIdRef.current) {
                    isAssessingRef.current = false;
                    activeAbortRef.current = null;
                  }
                });
            };

            // If an assessment is currently in flight, do NOT abort it.
            // Let it deliver its result, then trigger final wrap-up once it completes.
            if (isAssessingRef.current) {
              const checkPending = setInterval(() => {
                if (runId !== runIdRef.current) {
                  clearInterval(checkPending);
                  return;
                }
                if (!isAssessingRef.current) {
                  clearInterval(checkPending);
                  triggerFinal();
                }
              }, 200);
            } else {
              triggerFinal();
            }
          }

          setState(prev => ({
            ...prev,
            streamingState: newState,
            timeline: { ...timelineRef.current },
          }));
        },

        onProgress: (currentTime, duration) => {
          if (runId !== runIdRef.current) return;
          setState(prev => ({ ...prev, currentTime, duration }));

          // ─── Coordinated Incremental Assessment Dispatch ────────────────────────
          // 1. Skip if before initial offset (speaker greeting)
          if (currentTime < INITIAL_ASSESS_OFFSET_SEC) return;

          // 2. Strict In-Flight Guard: never send overlapping requests
          if (isAssessingRef.current) return;

          // 3. Check backoff window (e.g. following a 429 or 502)
          if (currentTime < nextAllowedAssessTimeRef.current) return;

          // 4. Check assessment cadence pacing
          if (currentTime - lastDispatchedAtRef.current < MIN_ASSESS_INTERVAL_SEC) return;

          const pcm = streaming.pcmBase64UpTo(currentTime);
          if (!pcm) return;

          // Lock in-flight guard
          isAssessingRef.current = true;
          lastDispatchedAtRef.current = currentTime;

          setState(prev => ({ ...prev, assessmentStatus: 'analyzing' }));

          const abortController = new AbortController();
          activeAbortRef.current = abortController;

          // Bounded timeout to prevent pipeline stalls
          const timeoutId = setTimeout(() => {
            abortController.abort();
          }, REQUEST_TIMEOUT_MS);

          requestAssessment(pcm, false, abortController.signal)
            .then(result => {
              clearTimeout(timeoutId);
              if (runId !== runIdRef.current || currentTime < appliedUptoRef.current) return;

              appliedUptoRef.current = currentTime;
              consecutiveErrorsRef.current = 0;

              // Timeline event: first valid assessment
              if (timelineRef.current.firstAssessmentTimeMs === null) {
                timelineRef.current = recordTimelineEvent(
                  timelineRef.current,
                  'first_assessment',
                  currentTime,
                  'First Assessment Received',
                  `Initial signal: ${result.riskLevel.toUpperCase()}`,
                  result.riskLevel,
                );
              }

              // Timeline event: warning visible
              if (
                result.riskLevel === 'high' &&
                timelineRef.current.warningVisibleTimeMs === null
              ) {
                timelineRef.current = recordTimelineEvent(
                  timelineRef.current,
                  'warning_visible',
                  currentTime,
                  'High-Risk Warning Visible',
                  `Identified fraud vectors: ${result.redFlags.map(f => f.category).join(', ')}`,
                  'high',
                );
              }

              if (result.transcript) haveAssessTranscriptRef.current = true;

              const merged = mergeAssessments(assessmentRef.current, {
                ...result,
                transcript: undefined,
              });
              assessmentRef.current = merged;

              setState(prev => ({
                ...prev,
                assessment: merged,
                transcript: result.transcript ?? prev.transcript,
                timeline: { ...timelineRef.current },
                assessmentStatus: 'idle',
                error: null,
              }));
            })
            .catch((err: Error) => {
              clearTimeout(timeoutId);
              if (runId !== runIdRef.current) return;

              if (err.name === 'AbortError' || (err instanceof AssessmentError && err.isTimeout)) {
                // Request timed out or cancelled; release quietly and retry on next tick
                setState(prev => ({ ...prev, assessmentStatus: 'idle' }));
                return;
              }

              if (err instanceof AssessmentError && err.isRateLimit) {
                // Bounded backoff on 429
                nextAllowedAssessTimeRef.current = currentTime + 3.0;
                setState(prev => ({ ...prev, assessmentStatus: 'throttled' }));
                return;
              }

              // Service error (502/503/network)
              consecutiveErrorsRef.current++;
              nextAllowedAssessTimeRef.current = currentTime + 2.0;

              if (consecutiveErrorsRef.current >= 3) {
                setState(prev => ({
                  ...prev,
                  assessmentStatus: 'error',
                  error: `AI assessment paused (${err.message})`,
                }));
              } else {
                setState(prev => ({ ...prev, assessmentStatus: 'retrying' }));
              }
            })
            .finally(() => {
              if (runId === runIdRef.current) {
                isAssessingRef.current = false;
                activeAbortRef.current = null;
              }
            });
        },

        onError: (err) => {
          if (runId !== runIdRef.current) return;
          setError(`Audio error: ${err.message}`);
        },
      });

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Failed to start analysis: ${message}`);
    }
  }, [setError, state.currentTime]);

  const pause = useCallback(() => {
    streamingRef.current?.pause();
  }, []);

  const stop = useCallback(() => {
    runIdRef.current++;
    activeAbortRef.current?.abort();
    activeAbortRef.current = null;
    isAssessingRef.current = false;

    geminiRef.current?.disconnect();
    streamingRef.current?.stop();

    timelineRef.current = createInitialTimeline();

    setState(prev => ({
      ...prev,
      streamingState: 'idle',
      connectionState: 'disconnected',
      currentTime: 0,
      assessmentStatus: 'idle',
      timeline: createInitialTimeline(),
    }));
  }, []);

  const restart = useCallback(async () => {
    const call = selectedCallRef.current;
    if (!call) return;

    activeAbortRef.current?.abort();
    activeAbortRef.current = null;
    isAssessingRef.current = false;

    await geminiRef.current?.disconnect();
    streamingRef.current?.stop();

    geminiRef.current = new GeminiLiveService();
    streamingRef.current = new AudioStreamingService();

    assessmentRef.current = null;
    timelineRef.current = createInitialTimeline();

    setState({
      ...INITIAL_STATE,
      selectedCall: call,
      timeline: createInitialTimeline(),
    });

    setTimeout(() => play(), 100);
  }, [play]);

  return [
    state,
    { selectCall, play, pause, stop, restart },
  ];
}

export { DEMO_CALLS };
