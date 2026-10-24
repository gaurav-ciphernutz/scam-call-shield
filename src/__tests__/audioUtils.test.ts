/**
 * Unit tests for audio pipeline utilities.
 * Tests use synthetic in-memory audio data — no live API calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  float32ToInt16,
  int16ToBase64,
  buildChunks,
  decodeAudioBuffer,
} from '../utils/audioUtils';

// ─── float32ToInt16 ─────────────────────────────────────────────────────────

describe('float32ToInt16', () => {
  it('converts zero signal to zero', () => {
    const input = new Float32Array([0, 0, 0]);
    const result = float32ToInt16(input);
    expect(Array.from(result)).toEqual([0, 0, 0]);
  });

  it('converts +1.0 to max positive Int16', () => {
    const result = float32ToInt16(new Float32Array([1.0]));
    expect(result[0]).toBe(32767);
  });

  it('converts -1.0 to min negative Int16', () => {
    const result = float32ToInt16(new Float32Array([-1.0]));
    expect(result[0]).toBe(-32768);
  });

  it('clamps values above 1.0', () => {
    const result = float32ToInt16(new Float32Array([2.0]));
    expect(result[0]).toBe(32767);
  });

  it('clamps values below -1.0', () => {
    const result = float32ToInt16(new Float32Array([-2.0]));
    expect(result[0]).toBe(-32768);
  });

  it('converts 0.5 approximately correctly', () => {
    const result = float32ToInt16(new Float32Array([0.5]));
    expect(result[0]).toBeCloseTo(16383, -1);
  });

  it('preserves sample count', () => {
    const input = new Float32Array(1000);
    const result = float32ToInt16(input);
    expect(result.length).toBe(1000);
  });
});

// ─── int16ToBase64 ───────────────────────────────────────────────────────────

describe('int16ToBase64', () => {
  it('produces a non-empty string', () => {
    const int16 = new Int16Array([0, 100, -100]);
    const result = int16ToBase64(int16);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('is valid base64', () => {
    const int16 = new Int16Array(100);
    const result = int16ToBase64(int16);
    expect(() => atob(result)).not.toThrow();
  });

  it('round-trips correctly', () => {
    const original = new Int16Array([0, 1000, -1000, 32767, -32768]);
    const base64 = int16ToBase64(original);
    const decoded = atob(base64);
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) {
      bytes[i] = decoded.charCodeAt(i);
    }
    const recovered = new Int16Array(bytes.buffer);
    expect(Array.from(recovered)).toEqual(Array.from(original));
  });

  it('handles large buffers without stack overflow', () => {
    const int16 = new Int16Array(100000);
    expect(() => int16ToBase64(int16)).not.toThrow();
  });
});

// ─── buildChunks ─────────────────────────────────────────────────────────────

describe('buildChunks', () => {
  const makeSamples = (count: number) => {
    const samples = new Float32Array(count);
    for (let i = 0; i < count; i++) samples[i] = Math.sin(i / 16);
    return samples;
  };

  it('produces chunks of ~100ms each', () => {
    // 16000 samples = 1 second → expect 10 chunks of 1600 samples
    const decoded = { samples: makeSamples(16000), sampleRate: 16000, duration: 1.0 };
    const chunks = buildChunks(decoded);
    expect(chunks.length).toBe(10);
  });

  it('chunks have sequential indices', () => {
    const decoded = { samples: makeSamples(4800), sampleRate: 16000, duration: 0.3 };
    const chunks = buildChunks(decoded);
    chunks.forEach((chunk, i) => {
      expect(chunk.index).toBe(i);
    });
  });

  it('chunk start times are monotonically increasing', () => {
    const decoded = { samples: makeSamples(16000), sampleRate: 16000, duration: 1.0 };
    const chunks = buildChunks(decoded);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].startTime).toBeGreaterThan(chunks[i - 1].startTime);
    }
  });

  it('first chunk starts at 0', () => {
    const decoded = { samples: makeSamples(3200), sampleRate: 16000, duration: 0.2 };
    const chunks = buildChunks(decoded);
    expect(chunks[0].startTime).toBe(0);
  });

  it('each chunk has base64 data string', () => {
    const decoded = { samples: makeSamples(1600), sampleRate: 16000, duration: 0.1 };
    const chunks = buildChunks(decoded);
    for (const chunk of chunks) {
      expect(typeof chunk.data).toBe('string');
      expect(chunk.data.length).toBeGreaterThan(0);
    }
  });

  it('handles audio shorter than one chunk', () => {
    const decoded = { samples: makeSamples(800), sampleRate: 16000, duration: 0.05 };
    const chunks = buildChunks(decoded);
    expect(chunks.length).toBe(1);
    expect(chunks[0].index).toBe(0);
  });

  it('handles empty audio gracefully', () => {
    const decoded = { samples: new Float32Array(0), sampleRate: 16000, duration: 0 };
    const chunks = buildChunks(decoded);
    expect(chunks.length).toBe(0);
  });
});

// ─── decodeAudioBuffer ───────────────────────────────────────────────────────

describe('decodeAudioBuffer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns decoded audio at target sample rate', async () => {
    const mockSamples = new Float32Array([0.1, -0.1, 0.2]);
    const mockAudioBuffer = {
      sampleRate: 16000,
      numberOfChannels: 1,
      length: 3,
      getChannelData: vi.fn().mockReturnValue(mockSamples),
    };

    (global.AudioContext as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      sampleRate: 16000,
      decodeAudioData: vi.fn().mockResolvedValue(mockAudioBuffer),
      close: vi.fn().mockResolvedValue(undefined),
    }));

    const arrayBuffer = new ArrayBuffer(100);
    const result = await decodeAudioBuffer(arrayBuffer);

    expect(result.sampleRate).toBe(16000);
    expect(result.samples).toBeInstanceOf(Float32Array);
    expect(result.duration).toBeGreaterThan(0);
  });

  it('performs resampling when source rate differs from target', async () => {
    const mockSamples = new Float32Array(44100); // 1 second at 44.1kHz
    const mockAudioBuffer = {
      sampleRate: 44100,
      numberOfChannels: 1,
      length: 44100,
      getChannelData: vi.fn().mockReturnValue(mockSamples),
    };

    const resampledSamples = new Float32Array(16000); // expected output
    const mockRenderedBuffer = {
      getChannelData: vi.fn().mockReturnValue(resampledSamples),
    };

    const mockOfflineCtx = {
      createBuffer: vi.fn().mockReturnValue({
        copyToChannel: vi.fn(),
      }),
      createBufferSource: vi.fn().mockReturnValue({
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
      }),
      destination: {},
      startRendering: vi.fn().mockResolvedValue(mockRenderedBuffer),
    };

    (global.AudioContext as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      sampleRate: 16000,
      decodeAudioData: vi.fn().mockResolvedValue(mockAudioBuffer),
      close: vi.fn().mockResolvedValue(undefined),
    }));

    (global.OfflineAudioContext as ReturnType<typeof vi.fn>).mockImplementation(() => mockOfflineCtx);

    const arrayBuffer = new ArrayBuffer(100);
    const result = await decodeAudioBuffer(arrayBuffer);
    expect(result.samples.length).toBe(16000);
  });
});
