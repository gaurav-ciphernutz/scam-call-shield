/**
 * Reliability & Regression Tests (Phase 1 Compliance)
 *
 * Verifies:
 * 1. Warning-state consistency: Lower-risk or stale responses never overwrite higher-risk state.
 * 2. Monotonic risk escalation: High-risk status is preserved across subsequent updates.
 * 3. Transcript and evidence deduplication on cumulative inputs.
 * 4. AssessmentError classification for 429 rate limits, 502/503 errors, and timeouts.
 * 5. In-flight request cleanup and cancellation safety.
 */

import { describe, it, expect, vi } from 'vitest';
import { mergeAssessments } from '../utils/assessmentUtils';
import { AssessmentError, requestAssessment } from '../services/assessService';
import type { ScamAssessment } from '../types';

describe('Reliability & Regression: Warning State Consistency', () => {
  const highRiskAssessment: ScamAssessment = {
    riskLevel: 'high',
    language: 'gu',
    redFlags: [
      {
        category: 'threat',
        evidence: 'ડિજિટલ અરેસ્ટ',
        explanation: 'Police digital arrest threat',
      },
    ],
    warning: 'આ કોલ જોખમી છે. ડિજિટલ અરેસ્ટની ધમકી આપવામાં આવી રહી છે.',
    assessmentComplete: false,
    transcript: 'નમસ્તે હું પોલીસ બોલું છું તમે ડિજિટલ અરેસ્ટમાં છો',
  };

  it('prevents low-risk update from overwriting high-risk warning text', () => {
    const lowRiskUpdate: ScamAssessment = {
      riskLevel: 'low',
      language: 'gu',
      redFlags: [],
      warning: 'No strong scam signals detected so far.',
      assessmentComplete: false,
    };

    const merged = mergeAssessments(highRiskAssessment, lowRiskUpdate);
    expect(merged.riskLevel).toBe('high');
    expect(merged.warning).toBe('આ કોલ જોખમી છે. ડિજિટલ અરેસ્ટની ધમકી આપવામાં આવી રહી છે.');
    expect(merged.warning).not.toContain('No strong scam signals');
  });

  it('prevents medium-risk update from overwriting high-risk warning text', () => {
    const mediumRiskUpdate: ScamAssessment = {
      riskLevel: 'medium',
      language: 'gu',
      redFlags: [
        {
          category: 'impersonation',
          evidence: 'હું પોલીસ બોલું છું',
          explanation: 'Claiming to be police',
        },
      ],
      warning: 'શંકાસ્પદ કોલ: સાવચેત રહો',
      assessmentComplete: false,
    };

    const merged = mergeAssessments(highRiskAssessment, mediumRiskUpdate);
    expect(merged.riskLevel).toBe('high');
    expect(merged.warning).toBe(highRiskAssessment.warning);
    // Red flag should be accumulated without duplicating
    expect(merged.redFlags).toHaveLength(2);
  });

  it('deduplicates red flags when identical evidence is returned repeatedly', () => {
    const duplicateFlagUpdate: ScamAssessment = {
      riskLevel: 'high',
      language: 'gu',
      redFlags: [
        {
          category: 'threat',
          evidence: 'ડિજિટલ અરેસ્ટ',
          explanation: 'Duplicate flag',
        },
      ],
      warning: 'Same warning',
      assessmentComplete: false,
    };

    const merged = mergeAssessments(highRiskAssessment, duplicateFlagUpdate);
    expect(merged.redFlags).toHaveLength(1);
    expect(merged.redFlags[0].evidence).toBe('ડિજિટલ અરેસ્ટ');
  });

  it('handles cumulative transcript without repeating already transcribed content', () => {
    const current: ScamAssessment = {
      ...highRiskAssessment,
      transcript: 'નમસ્તે હું પોલીસ બોલું છું',
    };
    const cumulativeUpdate: ScamAssessment = {
      ...highRiskAssessment,
      transcript: 'નમસ્તે હું પોલીસ બોલું છું તમે ડિજિટલ અરેસ્ટમાં છો',
    };

    const merged = mergeAssessments(current, cumulativeUpdate);
    // Should use the longer cumulative transcript directly, NOT concatenate
    expect(merged.transcript).toBe('નમસ્તે હું પોલીસ બોલું છું તમે ડિજિટલ અરેસ્ટમાં છો');
  });
});

describe('Reliability & Regression: Error Classification & Timeouts', () => {
  it('correctly classifies HTTP 429 rate limit error', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Rate limit exceeded',
    });
    vi.stubGlobal('fetch', mockFetch);

    try {
      await requestAssessment('dummyPCM', false);
      expect.fail('Should have thrown an error');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(AssessmentError);
      const assessErr = err as AssessmentError;
      expect(assessErr.status).toBe(429);
      expect(assessErr.isRateLimit).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('correctly classifies HTTP 502/503 service busy error', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => 'Bad Gateway',
    });
    vi.stubGlobal('fetch', mockFetch);

    try {
      await requestAssessment('dummyPCM', false);
      expect.fail('Should have thrown');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(AssessmentError);
      const assessErr = err as AssessmentError;
      expect(assessErr.status).toBe(502);
      expect(assessErr.isRateLimit).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('handles aborted requests cleanly as timeouts', async () => {
    const controller = new AbortController();
    controller.abort();

    const mockFetch = vi.fn().mockRejectedValue(new DOMException('The user aborted a request.', 'AbortError'));
    vi.stubGlobal('fetch', mockFetch);

    try {
      await requestAssessment('dummyPCM', false, controller.signal);
      expect.fail('Should have thrown');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(AssessmentError);
      const assessErr = err as AssessmentError;
      expect(assessErr.isTimeout).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
