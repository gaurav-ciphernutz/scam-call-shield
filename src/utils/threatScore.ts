/**
 * Deterministic Live Scam Threat Meter computation.
 *
 * Grounding & Methodology:
 * - This score is an advisory heuristic estimate (0–100), not a calibrated Bayesian statistical probability.
 * - Score derives strictly from validated model assessment fields:
 *     1. riskLevel: establishes baseline tier (low: 5, medium: 40, high: 70).
 *     2. redFlags categories: adds verified domain-specific severity weights based on Indian fraud vectors:
 *        - High-severity extortion/credential theft: threat (digital arrest), money_request, otp_request, credential_request (+15 pts)
 *        - Supporting fraud indicators: impersonation (+10 pts), urgency (+5 pts)
 * - Strict threshold tiers:
 *     - Safe: 0 to 25
 *     - Suspicious: 26 to 65
 *     - High Risk: 66 to 100
 */

import type { ScamAssessment, ThreatScore, ThreatCategory } from '../types';

export const THREAT_THRESHOLDS = {
  safeMax: 25,
  suspiciousMax: 65,
  highMax: 100,
} as const;

export const CATEGORY_SEVERITY_WEIGHTS: Record<string, number> = {
  threat: 15,
  money_request: 15,
  otp_request: 15,
  credential_request: 15,
  impersonation: 10,
  urgency: 5,
};

export function calculateThreatScore(assessment: ScamAssessment | null): ThreatScore {
  if (!assessment || assessment.riskLevel === 'unknown') {
    return {
      score: 0,
      category: 'evaluating',
      label: 'Evaluating call…',
      breakdown: ['Awaiting sufficient speech evidence to compute risk score.'],
    };
  }

  // 1. Model risk tier baseline
  let baseScore = 5;
  const breakdown: string[] = [];

  switch (assessment.riskLevel) {
    case 'low':
      baseScore = 5;
      breakdown.push('Low risk baseline: 5 pts');
      break;
    case 'medium':
      baseScore = 40;
      breakdown.push('Medium risk baseline: 40 pts');
      break;
    case 'high':
      baseScore = 70;
      breakdown.push('High risk baseline: 70 pts');
      break;
  }

  // 2. Additive verified red flags
  const seenCategories = new Set<string>();
  let flagBonus = 0;

  for (const flag of assessment.redFlags) {
    if (!seenCategories.has(flag.category)) {
      seenCategories.add(flag.category);
      const weight = CATEGORY_SEVERITY_WEIGHTS[flag.category] ?? 5;
      flagBonus += weight;
      breakdown.push(`+${weight} pts for verified ${flag.category.replace('_', ' ')}`);
    }
  }

  let finalScore = baseScore + flagBonus;

  // 3. Strict clamping to ensure score conforms to the assigned riskLevel tier
  if (assessment.riskLevel === 'low') {
    finalScore = Math.min(THREAT_THRESHOLDS.safeMax, Math.max(0, finalScore));
  } else if (assessment.riskLevel === 'medium') {
    finalScore = Math.min(THREAT_THRESHOLDS.suspiciousMax, Math.max(THREAT_THRESHOLDS.safeMax + 1, finalScore));
  } else if (assessment.riskLevel === 'high') {
    finalScore = Math.min(THREAT_THRESHOLDS.highMax, Math.max(THREAT_THRESHOLDS.suspiciousMax + 1, finalScore));
  }

  let category: ThreatCategory = 'safe';
  if (finalScore >= 66) {
    category = 'high';
  } else if (finalScore >= 26) {
    category = 'suspicious';
  } else {
    category = 'safe';
  }

  const label =
    category === 'high'
      ? `High Risk (${finalScore}/100)`
      : category === 'suspicious'
      ? `Suspicious (${finalScore}/100)`
      : `Safe (${finalScore}/100)`;

  return {
    score: finalScore,
    category,
    label,
    breakdown,
  };
}
