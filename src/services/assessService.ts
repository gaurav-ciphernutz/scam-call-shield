import type { ScamAssessment } from '../types';
import { parseAssessment } from '../utils/assessmentUtils';
import { BACKEND_URL } from '../utils/constants';

export class AssessmentError extends Error {
  status?: number;
  isRateLimit: boolean;
  isTimeout: boolean;

  constructor(
    message: string,
    options?: { status?: number; isRateLimit?: boolean; isTimeout?: boolean },
  ) {
    super(message);
    this.name = 'AssessmentError';
    this.status = options?.status;
    this.isRateLimit = options?.isRateLimit ?? false;
    this.isTimeout = options?.isTimeout ?? false;
  }
}

/**
 * Incremental assessment of the audio heard so far (cumulative 16 kHz mono s16le PCM, base64).
 * Backend holds the permanent API key and executes Gemini audio understanding;
 * response is schema-validated before returning.
 */
export async function requestAssessment(
  pcmBase64: string,
  final: boolean,
  signal?: AbortSignal,
): Promise<ScamAssessment> {
  let res: Response;

  try {
    res = await fetch(`${BACKEND_URL}/api/assess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pcm: pcmBase64, final }),
      signal,
    });
  } catch (err: unknown) {
    if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
      throw new AssessmentError('Assessment request cancelled or timed out', { isTimeout: true });
    }
    throw new AssessmentError('Network connectivity error reaching backend server');
  }

  if (!res.ok) {
    if (res.status === 429) {
      throw new AssessmentError('AI rate limit reached. Backing off.', { status: 429, isRateLimit: true });
    }
    if (res.status === 502 || res.status === 503) {
      throw new AssessmentError(`AI service busy (HTTP ${res.status}). Will retry.`, { status: res.status });
    }
    throw new AssessmentError(`Server error HTTP ${res.status}`, { status: res.status });
  }

  const rawText = await res.text();
  const parsed = parseAssessment(rawText);
  if (!parsed) {
    throw new AssessmentError('Malformed assessment schema from model');
  }

  return parsed;
}
