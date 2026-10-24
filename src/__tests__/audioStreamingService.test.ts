/**
 * Integration-style tests for AudioStreamingService.
 * Uses mocked audio data and Gemini service — no live calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioStreamingService } from '../services/audioStreamingService';

// Mock the audio utilities
vi.mock('../utils/audioUtils', () => ({
  fetchAndDecodeAudio: vi.fn(),
  buildChunks: vi.fn(),
  float32ToInt16: vi.fn(() => new Int16Array(0)),
  int16ToBase64: vi.fn(() => ''),
}));

import { fetchAndDecodeAudio, buildChunks } from '../utils/audioUtils';

const mockFetchAndDecodeAudio = fetchAndDecodeAudio as ReturnType<typeof vi.fn>;
const mockBuildChunks = buildChunks as ReturnType<typeof vi.fn>;

// Build fake chunks (100ms each)
const makeFakeChunks = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    data: 'AAAA',
    index: i,
    startTime: i * 0.1,
    duration: 0.1,
  }));

const FAKE_DECODED = {
  samples: new Float32Array(1600),
  sampleRate: 16000,
  duration: 1.0,
};

describe('AudioStreamingService', () => {
  let service: AudioStreamingService;

  const mockGemini = {
    connected: true,
    sendAudioChunk: vi.fn(),
    endAudio: vi.fn(),
    requestAssessment: vi.fn(),
  };

  const mockCallbacks = {
    onStateChange: vi.fn(),
    onProgress: vi.fn(),
    onError: vi.fn(),
  };

  beforeEach(() => {
    service = new AudioStreamingService();
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockFetchAndDecodeAudio.mockResolvedValue(FAKE_DECODED);
    mockBuildChunks.mockReturnValue(makeFakeChunks(10));
  });

  afterEach(() => {
    service.destroy();
    vi.useRealTimers();
  });

  it('starts in idle state', () => {
    expect(service.currentState).toBe('idle');
  });

  it('transitions to idle after load', async () => {
    await service.load('/audio/test.wav');
    expect(service.currentState).toBe('idle');
  });

  it('transitions to streaming after start', async () => {
    await service.load('/audio/test.wav');
    service.start(mockGemini as never, mockCallbacks);
    expect(service.currentState).toBe('streaming');
    expect(mockCallbacks.onStateChange).toHaveBeenCalledWith('streaming');
  });

  it('sends audio chunks at real-time pace', async () => {
    await service.load('/audio/test.wav');
    service.start(mockGemini as never, mockCallbacks);

    // After 0ms, only chunk 0 should have been sent (immediately)
    await vi.advanceTimersByTimeAsync(0);
    expect(mockGemini.sendAudioChunk).toHaveBeenCalledTimes(1);

    // After 100ms, chunk 1 should have been sent
    await vi.advanceTimersByTimeAsync(100);
    expect(mockGemini.sendAudioChunk).toHaveBeenCalledTimes(2);

    // After 500ms total, chunks 0–5 should have been sent
    await vi.advanceTimersByTimeAsync(400);
    expect(mockGemini.sendAudioChunk).toHaveBeenCalledTimes(6);
  });

  it('transitions to ended after all chunks are sent', async () => {
    await service.load('/audio/test.wav');
    service.start(mockGemini as never, mockCallbacks);

    // Advance past all 10 chunks (10 * 100ms = 1000ms)
    await vi.advanceTimersByTimeAsync(1100);
    expect(service.currentState).toBe('ended');
    expect(mockCallbacks.onStateChange).toHaveBeenCalledWith('ended');
  });

  it('calls sendEndOfStream when all chunks sent', async () => {
    await service.load('/audio/test.wav');
    service.start(mockGemini as never, mockCallbacks);
    await vi.advanceTimersByTimeAsync(1100);
    expect(mockGemini.endAudio).toHaveBeenCalledTimes(1);
    expect(mockGemini.requestAssessment).toHaveBeenCalledWith(true);
  });

  it('reports progress callbacks', async () => {
    await service.load('/audio/test.wav');
    service.start(mockGemini as never, mockCallbacks);
    await vi.advanceTimersByTimeAsync(150);
    expect(mockCallbacks.onProgress).toHaveBeenCalled();
  });

  it('pauses streaming correctly', async () => {
    await service.load('/audio/test.wav');
    service.start(mockGemini as never, mockCallbacks);
    await vi.advanceTimersByTimeAsync(200); // send chunks 0-1

    service.pause();
    expect(service.currentState).toBe('paused');

    const callsBeforePause = mockGemini.sendAudioChunk.mock.calls.length;
    await vi.advanceTimersByTimeAsync(500); // time passes but paused
    expect(mockGemini.sendAudioChunk.mock.calls.length).toBe(callsBeforePause);
  });

  it('resumes from paused state', async () => {
    await service.load('/audio/test.wav');
    service.start(mockGemini as never, mockCallbacks);
    await vi.advanceTimersByTimeAsync(200);
    service.pause();

    const callsBefore = mockGemini.sendAudioChunk.mock.calls.length;
    service.resume();
    expect(service.currentState).toBe('streaming');

    await vi.advanceTimersByTimeAsync(200);
    expect(mockGemini.sendAudioChunk.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('stop resets to idle', async () => {
    await service.load('/audio/test.wav');
    service.start(mockGemini as never, mockCallbacks);
    await vi.advanceTimersByTimeAsync(200);
    service.stop();
    expect(service.currentState).toBe('idle');
  });

  it('does not send chunks after stop', async () => {
    await service.load('/audio/test.wav');
    service.start(mockGemini as never, mockCallbacks);
    await vi.advanceTimersByTimeAsync(100);
    service.stop();

    const callsAtStop = mockGemini.sendAudioChunk.mock.calls.length;
    await vi.advanceTimersByTimeAsync(500);
    expect(mockGemini.sendAudioChunk.mock.calls.length).toBe(callsAtStop);
  });

  it('returns error when starting without loading', () => {
    service.start(mockGemini as never, mockCallbacks);
    expect(mockCallbacks.onError).toHaveBeenCalled();
  });

  it('reports duration from decoded audio', async () => {
    await service.load('/audio/test.wav');
    expect(service.duration).toBe(1.0);
  });

  it('destroy stops all activity', async () => {
    await service.load('/audio/test.wav');
    service.start(mockGemini as never, mockCallbacks);
    service.destroy();
    const callsAtDestroy = mockGemini.sendAudioChunk.mock.calls.length;
    await vi.advanceTimersByTimeAsync(500);
    expect(mockGemini.sendAudioChunk.mock.calls.length).toBe(callsAtDestroy);
  });
});
