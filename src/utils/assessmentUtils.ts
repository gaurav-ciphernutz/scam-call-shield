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

const RISK_ORDER: Record<RiskLevel, number> = {
  unknown: 0,
  low: 1,
  medium: 2,
  high: 3,
};

function normalizeEvidenceKey(evidence: string): string {
  return evidence
    .replace(/^["'«“‘]+|["'»”’]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Parse and validate a raw JSON string from the Gemini model.
 * Returns a validated ScamAssessment or null if validation fails.
 */
export function parseAssessment(raw: string): ScamAssessment | null {
  if (!raw || typeof raw !== 'string') return null;

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
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;

  const data = obj as Record<string, unknown>;

  // riskLevel
  const rawRisk = data['riskLevel'] ?? data['risk_level'];
  const normalizedRisk = typeof rawRisk === 'string' ? rawRisk.trim().toLowerCase() : '';
  if (!VALID_RISK_LEVELS.includes(normalizedRisk as RiskLevel)) {
    console.warn('[ScamAssessment] Invalid riskLevel:', rawRisk);
    return null;
  }

  // language
  const rawLang = data['language'] ?? 'unknown';
  const normalizedLang = typeof rawLang === 'string' ? rawLang.trim().toLowerCase() : 'unknown';
  const safeLanguage: Language = VALID_LANGUAGES.includes(normalizedLang as Language)
    ? (normalizedLang as Language)
    : 'unknown';

  // redFlags (deduplicated within single payload as well)
  const rawFlags = data['redFlags'] ?? data['red_flags'] ?? [];
  const seenKeys = new Set<string>();
  const redFlags: RedFlag[] = Array.isArray(rawFlags)
    ? rawFlags.flatMap((flag: unknown) => {
        if (!flag || typeof flag !== 'object') return [];
        const f = flag as Record<string, unknown>;
        const rawCategory = typeof f['category'] === 'string' ? f['category'].trim().toLowerCase() : '';
        const evidence = typeof f['evidence'] === 'string' ? f['evidence'].trim().slice(0, 500) : '';
        const explanation = typeof f['explanation'] === 'string' ? f['explanation'].trim().slice(0, 500) : '';

        if (!VALID_CATEGORIES.includes(rawCategory as FlagCategory)) return [];
        if (!evidence || !explanation) return [];

        const key = normalizeEvidenceKey(evidence);
        if (!key || seenKeys.has(key)) return [];
        seenKeys.add(key);

        return [{
          category: rawCategory as FlagCategory,
          evidence,
          explanation,
        }];
      })
    : [];

  // warning
  const warning = typeof data['warning'] === 'string'
    ? data['warning'].trim().slice(0, 1000)
    : '';

  // assessmentComplete
  const assessmentComplete = Boolean(data['assessmentComplete'] ?? data['assessment_complete'] ?? false);

  // transcript
  const rawTranscript = typeof data['transcript'] === 'string'
    ? data['transcript'].trim().slice(0, 5000)
    : '';
  const transcript = rawTranscript.length > 0 ? rawTranscript : undefined;

  return {
    riskLevel: normalizedRisk as RiskLevel,
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
  const currentRank = RISK_ORDER[current.riskLevel];
  const updateRank = RISK_ORDER[update.riskLevel];
  const riskLevel: RiskLevel =
    updateRank >= currentRank
      ? update.riskLevel
      : current.riskLevel;

  // Warning text protection:
  // Never overwrite a higher-risk warning with a lower-risk or generic low-risk message.
  const isGenericLowWarning = /no strong scam signals/i.test(update.warning || '');
  let warning = current.warning;
  if (updateRank > currentRank) {
    warning = update.warning || current.warning;
  } else if (updateRank === currentRank) {
    if (update.warning && (!isGenericLowWarning || riskLevel === 'low')) {
      warning = update.warning;
    }
  } else if (!current.warning && !isGenericLowWarning) {
    warning = update.warning;
  }

  // Deduplicate red flags by normalized evidence string
  const existingEvidence = new Set(current.redFlags.map(f => normalizeEvidenceKey(f.evidence)));
  const newFlags: RedFlag[] = [];
  for (const flag of update.redFlags) {
    const key = normalizeEvidenceKey(flag.evidence);
    if (key && !existingEvidence.has(key)) {
      existingEvidence.add(key);
      newFlags.push(flag);
    }
  }

  // Cumulative transcript handling
  let transcript = current.transcript;
  if (update.transcript) {
    if (!current.transcript) {
      transcript = update.transcript;
    } else if (update.transcript.includes(current.transcript)) {
      transcript = update.transcript;
    } else if (current.transcript.includes(update.transcript)) {
      transcript = current.transcript;
    } else if (update.transcript.length >= current.transcript.length) {
      transcript = `${current.transcript} ${update.transcript}`.trim();
    }
  }

  return {
    riskLevel,
    language: update.language !== 'unknown' ? update.language : current.language,
    redFlags: newFlags.length > 0 ? [...current.redFlags, ...newFlags] : current.redFlags,
    warning,
    assessmentComplete: update.assessmentComplete || current.assessmentComplete,
    transcript,
  };
}
