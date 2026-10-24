/**
 * Schema validation for Gemini model scam assessment output.
 * Validates and sanitizes model responses before displaying to users.
 */

import type { ScamAssessment, RiskLevel, Language, FlagCategory, RedFlag } from '../types';

const VALID_RISK_LEVELS: RiskLevel[] = ['low', 'medium', 'high', 'unknown'];
const VALID_LANGUAGES: Language[] = ['gu', 'hi', 'en', 'unknown'];
const VALID_CATEGORIES: FlagCategory[] = [
  'urgency',
  'threat',
  'otp_request',
  'money_request',
  'impersonation',
  'credential_request',
];

/**
 * Parse and validate a raw JSON string from the Gemini model.
 * Returns a validated ScamAssessment or null if validation fails.
 */
export function parseAssessment(raw: string): ScamAssessment | null {
  // Extract JSON from the response (model may wrap it in markdown code blocks)
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/) ||
                    raw.match(/(\{[\s\S]*\})/);

  const jsonStr = jsonMatch ? jsonMatch[1] : raw.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // Try to find any JSON object in the response
    const fallbackMatch = raw.match(/\{[\s\S]*\}/);
    if (fallbackMatch) {
      try {
        parsed = JSON.parse(fallbackMatch[0]);
      } catch {
        console.warn('[ScamAssessment] Failed to parse model response as JSON:', raw.slice(0, 200));
        return null;
      }
    } else {
      console.warn('[ScamAssessment] No JSON found in model response:', raw.slice(0, 200));
      return null;
    }
  }

  return validateAssessment(parsed);
}

/**
 * Validate a parsed object against the ScamAssessment schema.
 */
export function validateAssessment(obj: unknown): ScamAssessment | null {
  if (!obj || typeof obj !== 'object') return null;

  const data = obj as Record<string, unknown>;

  // riskLevel
  const riskLevel = data['riskLevel'] ?? data['risk_level'];
  if (!VALID_RISK_LEVELS.includes(riskLevel as RiskLevel)) {
    console.warn('[ScamAssessment] Invalid riskLevel:', riskLevel);
    return null;
  }

  // language
  const language = data['language'] ?? 'unknown';
  const safeLanguage: Language = VALID_LANGUAGES.includes(language as Language)
    ? (language as Language)
    : 'unknown';

  // redFlags
  const rawFlags = data['redFlags'] ?? data['red_flags'] ?? [];
  const redFlags: RedFlag[] = Array.isArray(rawFlags)
    ? rawFlags.flatMap((flag: unknown) => {
        if (!flag || typeof flag !== 'object') return [];
        const f = flag as Record<string, unknown>;
        const category = f['category'];
        const evidence = typeof f['evidence'] === 'string' ? f['evidence'].slice(0, 500) : '';
        const explanation = typeof f['explanation'] === 'string' ? f['explanation'].slice(0, 500) : '';

        if (!VALID_CATEGORIES.includes(category as FlagCategory)) return [];
        if (!evidence || !explanation) return [];

        return [{
          category: category as FlagCategory,
          evidence,
          explanation,
        }];
      })
    : [];

  // warning
  const warning = typeof data['warning'] === 'string'
    ? data['warning'].slice(0, 1000)
    : '';

  // assessmentComplete
  const assessmentComplete = Boolean(data['assessmentComplete'] ?? data['assessment_complete'] ?? false);

  // transcript
  const transcript = typeof data['transcript'] === 'string'
    ? data['transcript'].slice(0, 5000)
    : undefined;

  return {
    riskLevel: riskLevel as RiskLevel,
    language: safeLanguage,
    redFlags,
    warning,
    assessmentComplete,
    transcript,
  };
}

/**
 * Merge an incremental assessment update into the current assessment.
 * Red flags accumulate; riskLevel escalates (never de-escalates) during a session.
 */
export function mergeAssessments(
  current: ScamAssessment | null,
  update: ScamAssessment,
): ScamAssessment {
  if (!current) return update;

  // Risk level can only escalate
  const riskOrder: Record<RiskLevel, number> = { unknown: 0, low: 1, medium: 2, high: 3 };
  const currentRank = riskOrder[current.riskLevel];
  const updateRank = riskOrder[update.riskLevel];
  const riskLevel: RiskLevel =
    updateRank >= currentRank
      ? update.riskLevel
      : current.riskLevel;

  // Warning text protection:
  // Never overwrite a higher-risk warning with a lower-risk or empty one.
  let warning = current.warning;
  if (updateRank >= currentRank) {
    warning = update.warning || current.warning;
  } else if (!current.warning) {
    warning = update.warning;
  }

  // Deduplicate red flags by normalized evidence string
  const existingEvidence = new Set(current.redFlags.map(f => f.evidence.trim()));
  const newFlags = update.redFlags.filter(f => !existingEvidence.has(f.evidence.trim()));

  // Cumulative transcript handling
  let transcript = current.transcript;
  if (update.transcript) {
    if (!current.transcript) {
      transcript = update.transcript;
    } else if (update.transcript.includes(current.transcript)) {
      transcript = update.transcript;
    } else if (current.transcript.includes(update.transcript)) {
      transcript = current.transcript;
    } else {
      transcript = `${current.transcript} ${update.transcript}`.trim();
    }
  }

  return {
    riskLevel,
    language: update.language !== 'unknown' ? update.language : current.language,
    redFlags: [...current.redFlags, ...newFlags],
    warning,
    assessmentComplete: update.assessmentComplete || current.assessmentComplete,
    transcript,
  };
}
