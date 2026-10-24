import { describe, it, expect } from 'vitest';
import { calculateThreatScore, THREAT_THRESHOLDS } from '../utils/threatScore';
import type { ScamAssessment } from '../types';

describe('calculateThreatScore', () => {
  it('returns evaluating state for null or unknown risk', () => {
    expect(calculateThreatScore(null).category).toBe('evaluating');
    expect(calculateThreatScore(null).score).toBe(0);

    const unknownAssessment: ScamAssessment = {
      riskLevel: 'unknown',
      language: 'unknown',
      redFlags: [],
      warning: '',
      assessmentComplete: false,
    };
    expect(calculateThreatScore(unknownAssessment).category).toBe('evaluating');
  });

  it('calculates deterministic safe score for genuine calls with zero flags', () => {
    const genuine: ScamAssessment = {
      riskLevel: 'low',
      language: 'en',
      redFlags: [],
      warning: 'No strong scam signals detected so far.',
      assessmentComplete: true,
    };
    const threat = calculateThreatScore(genuine);
    expect(threat.category).toBe('safe');
    expect(threat.score).toBeLessThanOrEqual(THREAT_THRESHOLDS.safeMax);
    expect(threat.score).toBe(5);
    expect(threat.label).toContain('Safe');
  });

  it('calculates suspicious score for medium risk with impersonation', () => {
    const medium: ScamAssessment = {
      riskLevel: 'medium',
      language: 'gu',
      redFlags: [
        {
          category: 'impersonation',
          evidence: 'હું મુંબઈ પોલીસ સાયબર સેલમાંથી બોલું છું',
          explanation: 'Claiming to be police',
        },
      ],
      warning: 'પોલીસ હોવાનો દાવો',
      assessmentComplete: false,
    };
    const threat = calculateThreatScore(medium);
    expect(threat.category).toBe('suspicious');
    // base 40 + impersonation 10 = 50
    expect(threat.score).toBe(50);
    expect(threat.score).toBeGreaterThan(THREAT_THRESHOLDS.safeMax);
    expect(threat.score).toBeLessThanOrEqual(THREAT_THRESHOLDS.suspiciousMax);
  });

  it('calculates high risk score for extortion threats', () => {
    const highExtortion: ScamAssessment = {
      riskLevel: 'high',
      language: 'hi',
      redFlags: [
        {
          category: 'impersonation',
          evidence: 'मुंबई पुलिस',
          explanation: 'Police impersonation',
        },
        {
          category: 'threat',
          evidence: 'डिजिटल अरेस्ट',
          explanation: 'Arrest threat',
        },
        {
          category: 'money_request',
          evidence: '50,000 रुपये',
          explanation: 'Demand for money',
        },
      ],
      warning: 'सावधान! यह एक स्कैम है।',
      assessmentComplete: true,
    };
    const threat = calculateThreatScore(highExtortion);
    expect(threat.category).toBe('high');
    // base 70 + impersonation 10 + threat 15 + money 15 = 100 (clamped)
    expect(threat.score).toBe(100);
    expect(threat.score).toBeGreaterThan(THREAT_THRESHOLDS.suspiciousMax);
    expect(threat.breakdown.length).toBeGreaterThan(1);
  });

  it('guarantees score stays within strict threshold bands', () => {
    // Low risk cannot exceed safeMax
    const lowWithWeirdFlags: ScamAssessment = {
      riskLevel: 'low',
      language: 'en',
      redFlags: [
        { category: 'urgency', evidence: 'now', explanation: 'urgent' },
      ],
      warning: '',
      assessmentComplete: false,
    };
    expect(calculateThreatScore(lowWithWeirdFlags).score).toBeLessThanOrEqual(THREAT_THRESHOLDS.safeMax);
  });
});
