/**
 * Unit tests for assessment parsing and validation.
 * No live Gemini calls — all responses are mocked strings.
 */

import { describe, it, expect } from 'vitest';
import { parseAssessment, validateAssessment, mergeAssessments } from '../utils/assessmentUtils';
import type { ScamAssessment } from '../types';

// ─── parseAssessment ─────────────────────────────────────────────────────────

describe('parseAssessment', () => {
  it('parses a valid high-risk Gujarati assessment', () => {
    const raw = JSON.stringify({
      riskLevel: 'high',
      language: 'gu',
      redFlags: [{
        category: 'threat',
        evidence: 'ડિજિટલ અરેસ્ટ',
        explanation: 'Threatens arrest to create fear',
      }],
      warning: 'સાવધાન! આ સ્કેમ છે.',
      assessmentComplete: false,
      transcript: 'Test transcript',
    });

    const result = parseAssessment(raw);
    expect(result).not.toBeNull();
    expect(result!.riskLevel).toBe('high');
    expect(result!.language).toBe('gu');
    expect(result!.redFlags).toHaveLength(1);
    expect(result!.warning).toBe('સાવધાન! આ સ્કેમ છે.');
  });

  it('parses a valid high-risk Hindi assessment', () => {
    const raw = JSON.stringify({
      riskLevel: 'high',
      language: 'hi',
      redFlags: [{
        category: 'money_request',
        evidence: '₹50,000 ट्रांसफर',
        explanation: 'Demanding money transfer',
      }],
      warning: 'सावधान! यह स्कैम है।',
      assessmentComplete: false,
    });

    const result = parseAssessment(raw);
    expect(result!.language).toBe('hi');
    expect(result!.riskLevel).toBe('high');
  });

  it('parses a valid low-risk English genuine-call assessment', () => {
    const raw = JSON.stringify({
      riskLevel: 'low',
      language: 'en',
      redFlags: [],
      warning: 'No strong scam signals detected so far.',
      assessmentComplete: false,
    });

    const result = parseAssessment(raw);
    expect(result!.riskLevel).toBe('low');
    expect(result!.redFlags).toHaveLength(0);
  });

  it('parses a valid OTP scam assessment (English)', () => {
    const raw = JSON.stringify({
      riskLevel: 'high',
      language: 'en',
      redFlags: [{
        category: 'otp_request',
        evidence: 'please share the OTP we just sent to your phone',
        explanation: 'Requesting OTP over phone is a major red flag',
      }, {
        category: 'impersonation',
        evidence: "this is your bank's KYC team",
        explanation: 'Impersonating a bank representative',
      }],
      warning: 'Warning: This may be a scam. Never share an OTP with someone who calls you.',
      assessmentComplete: false,
    });

    const result = parseAssessment(raw);
    expect(result!.riskLevel).toBe('high');
    expect(result!.redFlags).toHaveLength(2);
    expect(result!.redFlags[0].category).toBe('otp_request');
  });

  it('parses JSON wrapped in markdown code block', () => {
    const raw = '```json\n' + JSON.stringify({
      riskLevel: 'medium',
      language: 'en',
      redFlags: [],
      warning: '',
      assessmentComplete: false,
    }) + '\n```';

    const result = parseAssessment(raw);
    expect(result).not.toBeNull();
    expect(result!.riskLevel).toBe('medium');
  });

  it('returns null for malformed JSON', () => {
    const result = parseAssessment('this is not json at all');
    expect(result).toBeNull();
  });

  it('returns null for JSON missing required riskLevel', () => {
    const raw = JSON.stringify({
      language: 'en',
      redFlags: [],
      warning: '',
      assessmentComplete: false,
    });
    const result = parseAssessment(raw);
    expect(result).toBeNull();
  });

  it('returns null for invalid riskLevel value', () => {
    const raw = JSON.stringify({
      riskLevel: 'critical', // invalid
      language: 'en',
      redFlags: [],
      warning: '',
      assessmentComplete: false,
    });
    const result = parseAssessment(raw);
    expect(result).toBeNull();
  });

  it('filters out red flags with invalid categories', () => {
    const raw = JSON.stringify({
      riskLevel: 'medium',
      language: 'en',
      redFlags: [
        {
          category: 'otp_request',
          evidence: 'share OTP',
          explanation: 'Valid flag',
        },
        {
          category: 'invalid_category', // should be filtered
          evidence: 'something',
          explanation: 'Should be removed',
        },
      ],
      warning: '',
      assessmentComplete: false,
    });

    const result = parseAssessment(raw);
    expect(result!.redFlags).toHaveLength(1);
    expect(result!.redFlags[0].category).toBe('otp_request');
  });

  it('handles unknown language gracefully', () => {
    const raw = JSON.stringify({
      riskLevel: 'low',
      language: 'xyz', // invalid
      redFlags: [],
      warning: '',
      assessmentComplete: false,
    });

    const result = parseAssessment(raw);
    expect(result!.language).toBe('unknown');
  });

  it('truncates excessively long evidence strings', () => {
    const longString = 'A'.repeat(1000);
    const raw = JSON.stringify({
      riskLevel: 'high',
      language: 'en',
      redFlags: [{
        category: 'threat',
        evidence: longString,
        explanation: longString,
      }],
      warning: '',
      assessmentComplete: false,
    });

    const result = parseAssessment(raw);
    expect(result!.redFlags[0].evidence.length).toBeLessThanOrEqual(500);
  });
});

// ─── mergeAssessments ────────────────────────────────────────────────────────

describe('mergeAssessments', () => {
  const base: ScamAssessment = {
    riskLevel: 'low',
    language: 'en',
    redFlags: [],
    warning: '',
    assessmentComplete: false,
    transcript: 'Hello',
  };

  it('returns update when current is null', () => {
    const update: ScamAssessment = { ...base, riskLevel: 'medium' };
    const result = mergeAssessments(null, update);
    expect(result.riskLevel).toBe('medium');
  });

  it('escalates risk level from low to high', () => {
    const update: ScamAssessment = { ...base, riskLevel: 'high' };
    const result = mergeAssessments(base, update);
    expect(result.riskLevel).toBe('high');
  });

  it('never de-escalates risk level', () => {
    const highRisk: ScamAssessment = { ...base, riskLevel: 'high' };
    const lowUpdate: ScamAssessment = { ...base, riskLevel: 'low' };
    const result = mergeAssessments(highRisk, lowUpdate);
    expect(result.riskLevel).toBe('high');
  });

  it('accumulates unique red flags', () => {
    const current: ScamAssessment = {
      ...base,
      redFlags: [{ category: 'threat', evidence: 'arrest', explanation: 'threat' }],
    };
    const update: ScamAssessment = {
      ...base,
      redFlags: [{ category: 'money_request', evidence: 'transfer', explanation: 'money' }],
    };
    const result = mergeAssessments(current, update);
    expect(result.redFlags).toHaveLength(2);
  });

  it('deduplicates red flags with same evidence', () => {
    const flag = { category: 'threat' as const, evidence: 'arrest threat', explanation: 'test' };
    const current: ScamAssessment = { ...base, redFlags: [flag] };
    const update: ScamAssessment = { ...base, redFlags: [flag] }; // same evidence
    const result = mergeAssessments(current, update);
    expect(result.redFlags).toHaveLength(1);
  });

  it('appends transcript segments', () => {
    const current: ScamAssessment = { ...base, transcript: 'Hello there' };
    const update: ScamAssessment = { ...base, transcript: 'I am calling' };
    const result = mergeAssessments(current, update);
    expect(result.transcript).toContain('Hello there');
    expect(result.transcript).toContain('I am calling');
  });

  it('preserves known language over unknown', () => {
    const current: ScamAssessment = { ...base, language: 'gu' };
    const update: ScamAssessment = { ...base, language: 'unknown' };
    const result = mergeAssessments(current, update);
    expect(result.language).toBe('gu');
  });

  it('sets assessmentComplete from update', () => {
    const update: ScamAssessment = { ...base, assessmentComplete: true };
    const result = mergeAssessments(base, update);
    expect(result.assessmentComplete).toBe(true);
  });

  it('validates insufficient-evidence behavior (unknown risk)', () => {
    const update: ScamAssessment = {
      riskLevel: 'unknown',
      language: 'unknown',
      redFlags: [],
      warning: '',
      assessmentComplete: false,
    };
    const result = mergeAssessments(null, update);
    expect(result.riskLevel).toBe('unknown');
    expect(result.redFlags).toHaveLength(0);
  });
});

// ─── validateAssessment ──────────────────────────────────────────────────────

describe('validateAssessment', () => {
  it('returns null for null input', () => {
    expect(validateAssessment(null)).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(validateAssessment('string')).toBeNull();
    expect(validateAssessment(42)).toBeNull();
    expect(validateAssessment([])).toBeNull();
  });

  it('accepts snake_case field names as alternative', () => {
    const result = validateAssessment({
      risk_level: 'high',
      language: 'en',
      red_flags: [],
      warning: 'test',
      assessment_complete: true,
    });
    expect(result).not.toBeNull();
    expect(result!.riskLevel).toBe('high');
    expect(result!.assessmentComplete).toBe(true);
  });
});
