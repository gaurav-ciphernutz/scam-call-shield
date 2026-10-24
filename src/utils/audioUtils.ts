/**
 * Audio pipeline utilities for Scam Call Shield.
 *
 * Responsibilities:
 * 1. Fetch and decode audio files using the Web Audio API
 * 2. Resample to 16 kHz mono (required by Gemini Live PCM input)
 * 3. Convert Float32 PCM → Int16 PCM
 * 4. Chunk into ~100 ms segments
 * 5. Base64-encode for transmission
 */

import { AUDIO_CONFIG } from './constants';

export interface DecodedAudio {
  /** Float32 interleaved PCM, already resampled to 16 kHz mono */
  samples: Float32Array;
  /** Pre-computed Int16 LE PCM to avoid repeated conversion during streaming */
  int16Samples?: Int16Array;
  /** Always 16000 */
  sampleRate: number;
  /** Duration in seconds */
  duration: number;
}

export interface AudioChunk {
  /** Base64-encoded Int16 LE PCM */
  data: string;
  /** Chunk index (0-based) */
  index: number;
  /** Start time in seconds relative to audio start */
  startTime: number;
  /** Duration in seconds */
  duration: number;
}

const TARGET_SAMPLE_RATE = AUDIO_CONFIG.sampleRate;
const CHUNK_DURATION_MS = AUDIO_CONFIG.chunkDurationMs;
const SAMPLES_PER_CHUNK = (TARGET_SAMPLE_RATE * CHUNK_DURATION_MS) / 1000; // 1600

// In-memory cache of decoded audio buffers keyed by URL to prevent repeated network fetches and decoding
const decodedAudioCache = new Map<string, Promise<DecodedAudio>>();

/**
 * Fetch an audio file, decode it and resample to 16 kHz mono.
 * Memoizes in-flight and completed decodes by URL.
 */
export async function fetchAndDecodeAudio(url: string): Promise<DecodedAudio> {
  const cached = decodedAudioCache.get(url);
  if (cached) return cached;

  const decodePromise = (async () => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return decodeAudioBuffer(arrayBuffer);
  })();

  decodedAudioCache.set(url, decodePromise);
  try {
    return await decodePromise;
  } catch (err) {
    decodedAudioCache.delete(url);
    throw err;
  }
}

/**
 * Decode an ArrayBuffer containing audio data and resample to 16 kHz mono.
 */
export async function decodeAudioBuffer(arrayBuffer: ArrayBuffer): Promise<DecodedAudio> {
  const audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));

    // Mix down to mono
    const monoSamples = mixDownToMono(audioBuffer);

    // Resample if the source sample rate differs from target
    let finalSamples: Float32Array;
    if (audioBuffer.sampleRate === TARGET_SAMPLE_RATE) {
      finalSamples = monoSamples;
    } else {
      finalSamples = await resample(monoSamples, audioBuffer.sampleRate, TARGET_SAMPLE_RATE);
    }

    const int16Samples = float32ToInt16(finalSamples);

    return {
      samples: finalSamples,
      int16Samples,
      sampleRate: TARGET_SAMPLE_RATE,
      duration: finalSamples.length / TARGET_SAMPLE_RATE,
    };
  } finally {
    await audioContext.close();
  }
}

/**
 * Mix a multi-channel AudioBuffer down to a single mono Float32Array.
 */
function mixDownToMono(audioBuffer: AudioBuffer): Float32Array {
  const { numberOfChannels, length } = audioBuffer;
  if (numberOfChannels === 1) {
    return new Float32Array(audioBuffer.getChannelData(0));
  }

  const mono = new Float32Array(length);
  const scale = 1 / numberOfChannels;

  for (let ch = 0; ch < numberOfChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      mono[i] += channelData[i] * scale;
    }
  }
  return mono;
}

/**
 * Resample Float32 PCM using the Web Audio API's OfflineAudioContext.
 * This performs real resampling, not relabelling.
 */
async function resample(
  samples: Float32Array,
  fromRate: number,
  toRate: number,
): Promise<Float32Array> {
  const sourceDuration = samples.length / fromRate;
  const targetLength = Math.ceil(sourceDuration * toRate);

  const offlineCtx = new OfflineAudioContext(1, targetLength, toRate);

  // Create a source buffer at the original sample rate
  const sourceBuffer = offlineCtx.createBuffer(1, samples.length, fromRate);
  sourceBuffer.copyToChannel(samples, 0);

  const source = offlineCtx.createBufferSource();
  source.buffer = sourceBuffer;
  source.connect(offlineCtx.destination);
  source.start(0);

  const renderedBuffer = await offlineCtx.startRendering();
  return renderedBuffer.getChannelData(0);
}

/**
 * Convert Float32 PCM [-1, 1] to Int16 LE PCM.
 */
export function float32ToInt16(samples: Float32Array): Int16Array {
  const int16 = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    // Clamp to [-1, 1] then scale to Int16 range
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    int16[i] = clamped < 0
      ? Math.round(clamped * 32768)
      : Math.round(clamped * 32767);
  }
  return int16;
}

/**
 * Encode an Int16Array as a base64 string.
 */
export function int16ToBase64(int16: Int16Array): string {
  const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
  let binary = '';
  // Process in chunks to avoid call stack limits
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/**
 * Slice decoded audio into CHUNK_DURATION_MS chunks.
 * Returns an ordered array of AudioChunks ready to send.
 */
export function buildChunks(decoded: DecodedAudio): AudioChunk[] {
  const { samples } = decoded;
  const int16All = decoded.int16Samples ?? float32ToInt16(samples);
  const chunks: AudioChunk[] = [];
  const totalSamples = int16All.length;
  let offset = 0;
  let index = 0;

  while (offset < totalSamples) {
    const end = Math.min(offset + SAMPLES_PER_CHUNK, totalSamples);
    const slice = int16All.subarray(offset, end);
    const data = int16ToBase64(slice);
    const startTime = offset / TARGET_SAMPLE_RATE;
    const duration = slice.length / TARGET_SAMPLE_RATE;

    chunks.push({ data, index, startTime, duration });

    offset = end;
    index++;
  }

  return chunks;
}

/**
 * Compute the real-time delay (ms) before sending each chunk,
 * keeping transmission synchronized with playback pace.
 */
export function chunkRealTimeDelay(chunkIndex: number): number {
  // Each chunk represents CHUNK_DURATION_MS of audio
  return chunkIndex * CHUNK_DURATION_MS;
}
