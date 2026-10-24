/**
 * Browser-side Gemini Live session using a short-lived ephemeral token.
 * Model, system prompt and modalities are locked server-side in the token.
 * The permanent API key never reaches the browser.
 */
import { GoogleGenAI, type Session, type LiveServerMessage } from '@google/genai';
import type { ScamAssessment } from '../types';
import { parseAssessment } from '../utils/assessmentUtils';
import { BACKEND_URL } from '../utils/constants';

export interface GeminiLiveCallbacks {
  onTranscript: (text: string) => void;
  onAssessment: (assessment: ScamAssessment) => void;
  onError: (error: Error) => void;
  onConnected: () => void;
  onDisconnected: () => void;
}

export class GeminiLiveService {
  private session: Session | null = null;
  private callbacks: GeminiLiveCallbacks | null = null;
  private isConnected = false;
  private generation = 0; // guards against stale callbacks from old sessions
  private modelText = '';
  private awaitingAssessment = false;
  chunksSent = 0;

  async connect(callbacks: GeminiLiveCallbacks): Promise<void> {
    const gen = ++this.generation;
    this.callbacks = callbacks;
    this.chunksSent = 0;

    let token: string;
    let model: string;
    try {
      const res = await fetch(`${BACKEND_URL}/api/token`, { method: 'POST' });
      if (!res.ok) throw new Error(`Token request failed (${res.status})`);
      ({ token, model } = (await res.json()) as { token: string; model: string });
    } catch (e) {
      throw new Error(`Could not reach the backend for a session token: ${(e as Error).message}`);
    }

    // Ephemeral tokens require v1alpha on the client as well.
    const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: 'v1alpha' } });
    this.session = await ai.live.connect({
      model,
      callbacks: {
        onopen: () => {
          if (gen !== this.generation) return;
          this.isConnected = true;
          callbacks.onConnected();
        },
        onmessage: (m: LiveServerMessage) => {
          if (gen === this.generation) this.handleMessage(m);
        },
        onerror: () => {
          if (gen === this.generation) callbacks.onError(new Error('Gemini Live connection error'));
        },
        onclose: (e: CloseEvent) => {
          if (gen !== this.generation) return;
          this.isConnected = false;
          if (e.code !== 1000) {
            const expired = /expired|token/i.test(e.reason || '');
            callbacks.onError(new Error(expired ? 'Session token expired' : `Connection closed (${e.code})`));
          }
          callbacks.onDisconnected();
        },
      },
    });
  }

  private handleMessage(m: LiveServerMessage): void {
    const sc = m.serverContent;
    if (!sc || !this.callbacks) return;

    if (sc.inputTranscription?.text) this.callbacks.onTranscript(sc.inputTranscription.text);

    // Model reply text arrives as text parts (TEXT modality) or output transcription (AUDIO modality)
    for (const p of sc.modelTurn?.parts ?? []) if (p.text) this.modelText += p.text;
    if (sc.outputTranscription?.text) this.modelText += sc.outputTranscription.text;

    if (sc.turnComplete || sc.generationComplete) {
      const text = this.modelText.trim();
      this.modelText = '';
      this.awaitingAssessment = false;
      if (!text) return;
      const assessment = parseAssessment(text);
      if (assessment) this.callbacks.onAssessment(assessment);
      else console.warn('[GeminiLive] Ignored malformed assessment');
    }
  }

  /** Send one PCM chunk: signed 16-bit LE, mono, 16 kHz, base64. */
  sendAudioChunk(base64Pcm: string): void {
    if (!this.session || !this.isConnected) return;
    this.session.sendRealtimeInput({ audio: { data: base64Pcm, mimeType: 'audio/pcm;rate=16000' } });
    this.chunksSent++;
  }

  get isAwaitingAssessment(): boolean {
    return this.awaitingAssessment;
  }

  /** Ask for an incremental assessment of the call so far. Skipped if one is pending. */
  requestAssessment(final = false): void {
    if (!this.session || !this.isConnected || (this.awaitingAssessment && !final)) return;
    this.awaitingAssessment = true;
    this.session.sendRealtimeInput({
      text: final
        ? 'ASSESS (final): the call has ended. Set assessmentComplete to true.'
        : 'ASSESS: give your assessment of the call heard so far.',
    });
  }

  /** Signals end of the audio stream. */
  endAudio(): void {
    if (!this.session || !this.isConnected) return;
    this.session.sendRealtimeInput({ audioStreamEnd: true });
  }

  async disconnect(): Promise<void> {
    this.generation++; // invalidate callbacks
    try { this.session?.close(); } catch { /* ignore */ }
    this.session = null;
    this.isConnected = false;
    this.modelText = '';
    this.awaitingAssessment = false;
    this.callbacks = null;
  }

  get connected(): boolean {
    return this.isConnected;
  }
}
