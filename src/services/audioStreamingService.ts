/**
 * Audio streaming service for Scam Call Shield.
 *
 * Manages the playback-synchronized streaming of prerecorded audio
 * to the Gemini Live API. Handles chunking, timing, pause/resume/stop.
 */

import {
  float32ToInt16,
  int16ToBase64,
  fetchAndDecodeAudio,
  buildChunks,
  type DecodedAudio,
  type AudioChunk,
} from '../utils/audioUtils';
import { AUDIO_CONFIG } from '../utils/constants';
import type { GeminiLiveService } from './geminiLiveService';

export type StreamingState = 'idle' | 'loading' | 'streaming' | 'paused' | 'ended' | 'error';

export interface StreamingCallbacks {
  onStateChange: (state: StreamingState) => void;
  onProgress: (currentTime: number, duration: number) => void;
  onError: (error: Error) => void;
}

const CHUNK_DURATION_MS = AUDIO_CONFIG.chunkDurationMs;

export class AudioStreamingService {
  private state: StreamingState = 'idle';
  private decoded: DecodedAudio | null = null;
  private cachedInt16: Int16Array | null = null;
  private chunks: AudioChunk[] = [];
  private currentChunkIndex = 0;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private streamStartTime = 0; // wall clock ms when streaming started
  private pausedAt = 0; // audio position in ms when paused
  private callbacks: StreamingCallbacks | null = null;
  private gemini: GeminiLiveService | null = null;
  private currentUrl = '';
  private loadPromise: Promise<void> | null = null;
  private loadGeneration = 0;
  private audible: HTMLAudioElement | null = null;
  private lastEncodedSampleCount = -1;
  private lastEncodedBase64: string | null = null;

  /** Audible playback so the user hears the call; the streamed PCM is what Gemini receives. */
  private playAudible(fromSec: number): void {
    try {
      if (typeof Audio === 'undefined') return;
      if (!this.audible) this.audible = new Audio(this.currentUrl);
      this.audible.currentTime = fromSec;
      void this.audible.play()?.catch(() => {});
    } catch { /* playback is best-effort */ }
  }

  private stopAudible(reset = false): void {
    try {
      if (!this.audible) return;
      this.audible.pause();
      if (reset) this.audible.currentTime = 0;
    } catch { /* ignore */ }
  }

  private releaseAudible(): void {
    try {
      if (!this.audible) return;
      this.audible.pause();
      this.audible.removeAttribute('src');
      this.audible.load?.();
    } catch { /* ignore */ }
    this.audible = null;
  }

  /**
   * Load and decode an audio file for streaming.
   * Deduplicates concurrent loads for the same URL and guards against stale completions.
   */
  async load(url: string): Promise<void> {
    if (url === this.currentUrl && this.decoded) return; // already loaded
    if (url === this.currentUrl && this.loadPromise) return this.loadPromise; // load in progress

    const gen = ++this.loadGeneration;
    this.stop();
    this.setState('loading');
    this.currentUrl = url;
    this.decoded = null;
    this.cachedInt16 = null;
    this.chunks = [];
    this.lastEncodedSampleCount = -1;
    this.lastEncodedBase64 = null;
    this.releaseAudible();

    const task = (async () => {
      try {
        const decoded = await fetchAndDecodeAudio(url);
        if (gen !== this.loadGeneration) return;
        this.decoded = decoded;
        this.cachedInt16 = decoded.int16Samples ?? float32ToInt16(decoded.samples);
        this.chunks = buildChunks(decoded);
        this.setState('idle');
      } catch (err) {
        if (gen !== this.loadGeneration) return;
        const error = err instanceof Error ? err : new Error(String(err));
        this.setState('error');
        this.callbacks?.onError(error);
        throw error;
      } finally {
        if (gen === this.loadGeneration) {
          this.loadPromise = null;
        }
      }
    })();

    this.loadPromise = task;
    return task;
  }

  /**
   * Start or resume streaming to Gemini.
   */
  start(gemini: GeminiLiveService, callbacks: StreamingCallbacks): void {
    if (!this.decoded || !this.chunks.length) {
      callbacks.onError(new Error('Audio not loaded. Call load() first.'));
      return;
    }

    this.gemini = gemini;
    this.callbacks = callbacks;

    if (this.state === 'paused') {
      this.resume();
    } else {
      this.currentChunkIndex = 0;
      this.pausedAt = 0;
      this.streamStartTime = performance.now();
      this.setState('streaming');
      this.playAudible(0);
      this.scheduleNextChunk();
    }
  }

  /**
   * Pause streaming.
   */
  pause(): void {
    if (this.state !== 'streaming') return;
    this.pausedAt = this.currentChunkIndex * CHUNK_DURATION_MS;
    this.clearTimeout();
    this.stopAudible();
    this.setState('paused');
  }

  /**
   * Resume streaming after a pause.
   */
  resume(): void {
    if (this.state !== 'paused') return;
    this.streamStartTime = performance.now() - this.pausedAt;
    this.setState('streaming');
    this.playAudible(this.pausedAt / 1000);
    this.scheduleNextChunk();
  }

  /**
   * Stop and reset to the beginning.
   */
  stop(): void {
    this.clearTimeout();
    this.currentChunkIndex = 0;
    this.pausedAt = 0;
    this.stopAudible(true);
    this.setState('idle');
  }

  /**
   * Restart from the beginning.
   */
  restart(gemini: GeminiLiveService): void {
    this.stop();
    if (this.callbacks) {
      this.start(gemini, this.callbacks);
    }
  }

  private scheduleNextChunk(): void {
    if (this.state !== 'streaming' || !this.chunks.length) return;

    if (this.currentChunkIndex >= this.chunks.length) {
      // All chunks sent
      this.setState('ended');
      this.gemini?.endAudio();
      this.gemini?.requestAssessment(true);
      this.stopAudible();
      if (this.decoded) {
        this.callbacks?.onProgress(this.decoded.duration, this.decoded.duration);
      }
      return;
    }

    const chunk = this.chunks[this.currentChunkIndex];

    // Calculate when this chunk should be sent relative to stream start
    const targetMs = chunk.startTime * 1000;
    const elapsedMs = performance.now() - this.streamStartTime;
    const delayMs = Math.max(0, targetMs - elapsedMs);

    this.timeoutId = setTimeout(() => {
      if (this.state !== 'streaming') return;

      // Send chunk to Gemini
      this.gemini?.sendAudioChunk(chunk.data);

      // Report progress
      if (this.decoded) {
        this.callbacks?.onProgress(
          chunk.startTime + chunk.duration,
          this.decoded.duration,
        );
      }

      this.currentChunkIndex++;
      this.scheduleNextChunk();
    }, delayMs);
  }

  private clearTimeout(): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  private setState(newState: StreamingState): void {
    if (this.state === newState) return;
    this.state = newState;
    this.callbacks?.onStateChange(newState);
  }

  /** Cumulative 16 kHz mono s16le PCM (base64) for the first `sec` seconds, i.e. what has been streamed so far. */
  pcmBase64UpTo(sec: number): string | null {
    if (!this.decoded) return null;
    const n = Math.min(this.decoded.samples.length, Math.floor(sec * this.decoded.sampleRate));
    if (n < this.decoded.sampleRate * 0.5) return null;

    if (n === this.lastEncodedSampleCount && this.lastEncodedBase64 !== null) {
      return this.lastEncodedBase64;
    }

    const int16Source =
      this.cachedInt16 && this.cachedInt16.length >= n
        ? this.cachedInt16.subarray(0, n)
        : float32ToInt16(this.decoded.samples.subarray(0, n));

    const encoded = int16ToBase64(int16Source);
    this.lastEncodedSampleCount = n;
    this.lastEncodedBase64 = encoded;
    return encoded;
  }

  get currentState(): StreamingState {
    return this.state;
  }

  get duration(): number {
    return this.decoded?.duration ?? 0;
  }

  get currentTime(): number {
    if (this.state === 'paused') return this.pausedAt / 1000;
    if (this.state === 'streaming') {
      return Math.min(
        (performance.now() - this.streamStartTime) / 1000,
        this.decoded?.duration ?? 0,
      );
    }
    if (this.state === 'ended') return this.decoded?.duration ?? 0;
    return 0;
  }

  /**
   * Clean up all resources.
   */
  destroy(): void {
    this.loadGeneration++;
    this.loadPromise = null;
    this.clearTimeout();
    this.releaseAudible();
    this.decoded = null;
    this.cachedInt16 = null;
    this.chunks = [];
    this.lastEncodedSampleCount = -1;
    this.lastEncodedBase64 = null;
    this.callbacks = null;
    this.gemini = null;
    this.state = 'idle';
  }
}
