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

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
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
const FINAL_MAX_RETRIES = 2;

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
  const currentTimeRef = useRef<number>(0);
  const haveAssessTranscriptRef = useRef<boolean>(false);

  // In-flight guard, final wrap-up queue, and rate coordination refs
  const isAssessingRef = useRef<boolean>(false);
  const pendingFinalPosRef = useRef<number | null>(null);
  const activeAbortRef = useRef<AbortController | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDispatchedAtRef = useRef<number>(0);
  const nextAllowedAssessTimeRef = useRef<number>(0);
  const consecutiveErrorsRef = useRef<number>(0);
  const timelineRef = useRef<DetectionTimeline>(createInitialTimeline());

  const clearPendingTimers = useCallback(() => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    pendingFinalPosRef.current = null;
    activeAbortRef.current?.abort();
    activeAbortRef.current = null;
    isAssessingRef.current = false;
  }, []);

  // Initialize services once and clean up on unmount
  useEffect(() => {
    geminiRef.current = new GeminiLiveService();
    streamingRef.current = new AudioStreamingService();

    return () => {
      runIdRef.current++;
      clearPendingTimers();
      void geminiRef.current?.disconnect();
      streamingRef.current?.destroy();
    };
  }, [clearPendingTimers]);

  const setError = useCallback((error: string) => {
    setState(prev => ({ ...prev, error, connectionState: 'error', assessmentStatus: 'error' }));
  }, []);

  /**
   * Apply a validated assessment update deterministically, recording timeline milestones
   * without allowing stale or lower-risk results to overwrite high-risk warnings.
   */
  const applyAssessmentUpdate = useCallback(
    (
      incoming: ScamAssessment,
      audioPosSec: number,
      sourceLabel: string,
      preserveTranscript?: string,
    ): ScamAssessment => {
      if (timelineRef.current.firstAssessmentTimeMs === null && incoming.riskLevel !== 'unknown') {
        timelineRef.current = recordTimelineEvent(
          timelineRef.current,
          'first_assessment',
          audioPosSec,
          'First Assessment Received',
          `Initial signal (${sourceLabel}): ${incoming.riskLevel.toUpperCase()}`,
          incoming.riskLevel,
        );
      }

      const prevRisk = assessmentRef.current?.riskLevel ?? 'unknown';
      const merged = mergeAssessments(assessmentRef.current, {
        ...incoming,
        transcript: preserveTranscript,
      });
      assessmentRef.current = merged;

      if (
        merged.riskLevel === 'high' &&
        timelineRef.current.warningVisibleTimeMs === null
      ) {
        const categories = merged.redFlags.map(f => f.category).join(', ');
        timelineRef.current = recordTimelineEvent(
          timelineRef.current,
          'warning_visible',
          audioPosSec,
          'High-Risk Warning Visible',
          categories
            ? `Identified fraud vectors: ${categories}`
            : `Triggered by ${sourceLabel}: ${merged.warning || 'Scam detected'}`,
          'high',
        );
      } else if (
        merged.riskLevel === 'medium' &&
        prevRisk !== 'medium' &&
        prevRisk !== 'high'
      ) {
        timelineRef.current = recordTimelineEvent(
          timelineRef.current,
          'risk_escalation',
          audioPosSec,
          'Suspicious Activity Escalation',
          `Elevated to MEDIUM risk (${sourceLabel})`,
          'medium',
        );
      }

      return merged;
    },
    [],
  );

  /**
   * Execute the final end-of-call assessment with bounded retry on transient errors.
   */
  const executeFinalAssessment = useCallback(
    (runId: number, finalPos: number, attempt = 0) => {
      const streaming = streamingRef.current;
      if (
        runId !== runIdRef.current ||
        !streaming ||
        assessmentRef.current?.assessmentComplete
      ) {
        return;
      }

      const fullPcm = streaming.pcmBase64UpTo(finalPos);
      if (!fullPcm) return;

      isAssessingRef.current = true;
      const finalAbort = new AbortController();
      activeAbortRef.current = finalAbort;

      setState(prev => ({
        ...prev,
        assessmentStatus: attempt > 0 ? 'retrying' : 'analyzing',
      }));

      requestAssessment(fullPcm, true, finalAbort.signal, REQUEST_TIMEOUT_MS)
        .then(finalResult => {
          if (runId !== runIdRef.current) return;

          if (finalResult.transcript) {
            haveAssessTranscriptRef.current = true;
          }

          const merged = applyAssessmentUpdate(
            { ...finalResult, assessmentComplete: true },
            finalPos,
            'Final assessment',
            finalResult.transcript,
          );

          timelineRef.current = recordTimelineEvent(
            timelineRef.current,
            'assessment_complete',
            finalPos,
            'Final Assessment Complete',
            `Final verdict: ${merged.riskLevel.toUpperCase()}`,
            merged.riskLevel,
          );

          setState(prev => ({
            ...prev,
            assessment: merged,
            transcript: merged.transcript ?? finalResult.transcript ?? prev.transcript,
            timeline: timelineRef.current,
            assessmentStatus: 'complete',
            error: null,
          }));
        })
        .catch((err: unknown) => {
          if (runId !== runIdRef.current) return;
          const isAborted =
            finalAbort.signal.aborted ||
            (err instanceof Error && err.name === 'AbortError');
          if (isAborted && !(err instanceof AssessmentError && err.isTimeout)) {
            return;
          }

          if (attempt < FINAL_MAX_RETRIES) {
            const delayMs = 1200 * (attempt + 1);
            setState(prev => ({ ...prev, assessmentStatus: 'retrying' }));
            retryTimerRef.current = setTimeout(() => {
              retryTimerRef.current = null;
              executeFinalAssessment(runId, finalPos, attempt + 1);
            }, delayMs);
          } else {
            // Preserve any existing incremental assessment and mark complete gracefully
            if (assessmentRef.current) {
              const completed = { ...assessmentRef.current, assessmentComplete: true };
              assessmentRef.current = completed;
              setState(prev => ({
                ...prev,
                assessment: completed,
                assessmentStatus: 'complete',
              }));
            } else {
              setState(prev => ({ ...prev, assessmentStatus: 'idle' }));
            }
          }
        })
        .finally(() => {
          if (runId === runIdRef.current && activeAbortRef.current === finalAbort) {
            isAssessingRef.current = false;
            activeAbortRef.current = null;
          }
        });
    },
    [applyAssessmentUpdate],
  );

  const selectCall = useCallback(
    (call: DemoCall) => {
      runIdRef.current++;
      clearPendingTimers();

      if (geminiRef.current?.connected) {
        void geminiRef.current.disconnect();
      }
      streamingRef.current?.stop();

      selectedCallRef.current = call;
      assessmentRef.current = null;
      appliedUptoRef.current = 0;
      currentTimeRef.current = 0;
      lastDispatchedAtRef.current = 0;
      nextAllowedAssessTimeRef.current = 0;
      consecutiveErrorsRef.current = 0;
      haveAssessTranscriptRef.current = false;

      const freshTimeline = createInitialTimeline();
      timelineRef.current = freshTimeline;

      setState({
        ...INITIAL_STATE,
        selectedCall: call,
        timeline: freshTimeline,
      });

      // Pre-load audio for instant playback start
      streamingRef.current?.load(call.audioFile).catch(err => {
        console.warn('[useScamShield] Pre-load failed:', err);
      });
    },
    [clearPendingTimers],
  );

  const play = useCallback(async () => {
    const call = selectedCallRef.current;
    if (!call) {
      setError('Please select a call first.');
      return;
    }

    const gemini = geminiRef.current;
    const streaming = streamingRef.current;
    if (!gemini || !streaming) return;

    // If paused, resume without resetting session
    if (streaming.currentState === 'paused' && gemini.connected) {
      streaming.resume();
      setState(prev => ({ ...prev, streamingState: 'streaming', error: null }));
      return;
    }

    // Fresh start: abort any existing requests and reset state
    const runId = ++runIdRef.current;
    clearPendingTimers();

    appliedUptoRef.current = 0;
    currentTimeRef.current = 0;
    lastDispatchedAtRef.current = 0;
    nextAllowedAssessTimeRef.current = 0;
    consecutiveErrorsRef.current = 0;
    haveAssessTranscriptRef.current = false;
    assessmentRef.current = null;

    const freshTimeline = createInitialTimeline();
    timelineRef.current = freshTimeline;

    setState(prev => ({
      ...prev,
      connectionState: 'connecting',
      transcript: '',
      assessment: null,
      error: null,
      streamingState: 'loading',
      timeline: freshTimeline,
      assessmentStatus: 'idle',
    }));

    try {
      // 1. Load audio buffer (uses memoized cache if already preloaded)
      await streaming.load(call.audioFile);
      if (runId !== runIdRef.current) return;

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
          const clean = text.trim();
          if (!clean) return;
          setState(prev => ({
            ...prev,
            transcript: prev.transcript ? `${prev.transcript} ${clean}` : clean,
          }));
        },
        onAssessment: (live) => {
          if (runId !== runIdRef.current) return;
          // Guard against a late low/unknown Live assessment regressing a completed assessment
          const merged = applyAssessmentUpdate(
            live,
            currentTimeRef.current,
            'Live engine',
            undefined,
          );

          setState(prev => ({
            ...prev,
            assessment: merged,
            timeline: timelineRef.current,
          }));
        },
        onError: (err) => {
          if (runId !== runIdRef.current) return;
          setError(`Analysis error: ${err.message}`);
          streaming.stop();
        },
      });

      if (runId !== runIdRef.current) return;

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
            const finalPos = streaming.duration || currentTimeRef.current;
            currentTimeRef.current = finalPos;

            timelineRef.current = recordTimelineEvent(
              timelineRef.current,
              'playback_end',
              finalPos,
              'Playback Completed',
              `Audio stream reached end (${finalPos.toFixed(1)}s)`,
            );

            // If an incremental assessment is currently in flight, let it finish and
            // trigger final assessment deterministically in its .finally() block (no polling interval).
            if (isAssessingRef.current) {
              pendingFinalPosRef.current = finalPos;
            } else {
              executeFinalAssessment(runId, finalPos);
            }
          }

          setState(prev => ({
            ...prev,
            streamingState: newState,
            timeline: timelineRef.current,
          }));
        },

        onProgress: (currentTime, duration) => {
          if (runId !== runIdRef.current) return;
          currentTimeRef.current = currentTime;

          setState(prev =>
            prev.currentTime === currentTime && prev.duration === duration
              ? prev
              : { ...prev, currentTime, duration },
          );

          // ─── Coordinated Incremental Assessment Dispatch ────────────────────────
          // 1. Skip if before initial offset (speaker greeting) or already completed
          if (
            currentTime < INITIAL_ASSESS_OFFSET_SEC ||
            assessmentRef.current?.assessmentComplete
          ) {
            return;
          }

          // 2. Strict In-Flight Guard: never send overlapping requests
          if (isAssessingRef.current) return;

          // 3. Check backoff window (e.g. following a 429 or 502)
          if (currentTime < nextAllowedAssessTimeRef.current) return;

          // 4. Check assessment cadence pacing
          if (currentTime - lastDispatchedAtRef.current < MIN_ASSESS_INTERVAL_SEC) return;

          // 5. Skip dispatching an incremental request right at the very end of the clip
          // (within 0.35s of completion) so the final wrap-up request can run immediately on end
          if (duration > 0 && duration - currentTime < 0.35) return;

          const pcm = streaming.pcmBase64UpTo(currentTime);
          if (!pcm) return;

          // Lock in-flight guard
          isAssessingRef.current = true;
          lastDispatchedAtRef.current = currentTime;

          setState(prev =>
            prev.assessmentStatus === 'analyzing'
              ? prev
              : { ...prev, assessmentStatus: 'analyzing' },
          );

          const abortController = new AbortController();
          activeAbortRef.current = abortController;

          requestAssessment(pcm, false, abortController.signal, REQUEST_TIMEOUT_MS)
            .then(result => {
              if (runId !== runIdRef.current || currentTime < appliedUptoRef.current) return;

              appliedUptoRef.current = currentTime;
              consecutiveErrorsRef.current = 0;

              if (result.transcript) {
                haveAssessTranscriptRef.current = true;
              }

              const merged = applyAssessmentUpdate(
                result,
                currentTime,
                'Incremental engine',
                result.transcript,
              );

              setState(prev => ({
                ...prev,
                assessment: merged,
                transcript: merged.transcript ?? result.transcript ?? prev.transcript,
                timeline: timelineRef.current,
                assessmentStatus: 'idle',
                error: null,
              }));
            })
            .catch((err: Error) => {
              if (runId !== runIdRef.current) return;

              if (err.name === 'AbortError' || (err instanceof AssessmentError && err.isTimeout)) {
                // Request timed out or cancelled; release quietly and retry on next tick
                setState(prev => ({ ...prev, assessmentStatus: 'idle' }));
                return;
              }

              if (err instanceof AssessmentError && err.isRateLimit) {
                // Bounded exponential backoff on 429
                consecutiveErrorsRef.current++;
                const backoffSec = Math.min(6.0, 2.5 * Math.pow(1.4, consecutiveErrorsRef.current - 1));
                nextAllowedAssessTimeRef.current = currentTimeRef.current + backoffSec;
                setState(prev => ({ ...prev, assessmentStatus: 'throttled' }));
                return;
              }

              // Service error (502/503/network)
              consecutiveErrorsRef.current++;
              const retryDelaySec = Math.min(4.5, 1.8 * consecutiveErrorsRef.current);
              nextAllowedAssessTimeRef.current = currentTimeRef.current + retryDelaySec;

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
                if (activeAbortRef.current === abortController) {
                  activeAbortRef.current = null;
                }

                // If playback ended while this incremental assessment was in flight,
                // immediately dispatch the queued final assessment now.
                const pendingFinalPos = pendingFinalPosRef.current;
                if (pendingFinalPos !== null) {
                  pendingFinalPosRef.current = null;
                  executeFinalAssessment(runId, pendingFinalPos);
                }
              }
            });
        },

        onError: (err) => {
          if (runId !== runIdRef.current) return;
          setError(`Audio error: ${err.message}`);
        },
      });
    } catch (err) {
      if (runId !== runIdRef.current) return;
      const message = err instanceof Error ? err.message : String(err);
      setError(`Failed to start analysis: ${message}`);
    }
  }, [applyAssessmentUpdate, clearPendingTimers, executeFinalAssessment, setError]);

  const pause = useCallback(() => {
    streamingRef.current?.pause();
  }, []);

  const stop = useCallback(() => {
    runIdRef.current++;
    clearPendingTimers();

    void geminiRef.current?.disconnect();
    streamingRef.current?.stop();

    currentTimeRef.current = 0;
    const freshTimeline = createInitialTimeline();
    timelineRef.current = freshTimeline;

    setState(prev => ({
      ...prev,
      streamingState: 'idle',
      connectionState: 'disconnected',
      currentTime: 0,
      assessmentStatus: 'idle',
      timeline: freshTimeline,
    }));
  }, [clearPendingTimers]);

  const restart = useCallback(async () => {
    const call = selectedCallRef.current;
    if (!call) return;

    runIdRef.current++;
    clearPendingTimers();

    await geminiRef.current?.disconnect();
    streamingRef.current?.stop();

    await play();
  }, [clearPendingTimers, play]);

  const actions = useMemo<ScamShieldActions>(
    () => ({ selectCall, play, pause, stop, restart }),
    [selectCall, play, pause, stop, restart],
  );

  return [state, actions];
}

export { DEMO_CALLS };
