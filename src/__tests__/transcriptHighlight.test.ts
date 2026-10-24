import { describe, it, expect } from 'vitest';
import { highlightTranscript } from '../utils/transcriptHighlight';
import type { RedFlag } from '../types';

describe('highlightTranscript', () => {
  it('returns single unhighlighted segment when redFlags is empty', () => {
    const text = 'Hi, this is Swiggy delivery partner.';
    const segments = highlightTranscript(text, []);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual({ text, isHighlighted: false });
  });

  it('highlights Gujarati evidence phrase correctly', () => {
    const text = 'નમસ્તે. તમે ડિજિટલ અરેસ્ટમાં છો. ફોન કાપશો નહીં.';
    const flags: RedFlag[] = [
      {
        category: 'threat',
        evidence: 'ડિજિટલ અરેસ્ટ',
        explanation: 'Arrest extortion threat',
      },
    ];

    const segments = highlightTranscript(text, flags);
    expect(segments.length).toBeGreaterThan(1);
    const highlighted = segments.find(s => s.isHighlighted);
    expect(highlighted).toBeDefined();
    expect(highlighted!.text).toBe('ડિજિટલ અરેસ્ટ');
    expect(highlighted!.flag?.category).toBe('threat');
  });

  it('highlights Hindi Devanagari evidence phrase correctly', () => {
    const text = 'नमस्ते, मैं मुंबई पुलिस से बोल रहा हूँ। आप डिजिटल अरेस्ट में हैं।';
    const flags: RedFlag[] = [
      {
        category: 'threat',
        evidence: 'डिजिटल अरेस्ट',
        explanation: 'Extortion intimidation',
      },
      {
        category: 'impersonation',
        evidence: 'मुंबई पुलिस',
        explanation: 'Police false identity',
      },
    ];

    const segments = highlightTranscript(text, flags);
    const highlightedPhrases = segments.filter(s => s.isHighlighted).map(s => s.text);
    expect(highlightedPhrases).toContain('मुंबई पुलिस');
    expect(highlightedPhrases).toContain('डिजिटल अरेस्ट');
  });

  it('highlights English OTP request phrase correctly', () => {
    const text = 'Please share the OTP we just sent to your phone to keep your account active.';
    const flags: RedFlag[] = [
      {
        category: 'otp_request',
        evidence: 'share the OTP',
        explanation: 'Attempted credential theft',
      },
    ];

    const segments = highlightTranscript(text, flags);
    const highlighted = segments.find(s => s.isHighlighted);
    expect(highlighted).toBeDefined();
    expect(highlighted!.text).toBe('share the OTP');
  });

  it('never synthesizes or injects unmatched model evidence into transcript', () => {
    const text = 'Hi, which gate should I come to?';
    const hallucinatedFlags: RedFlag[] = [
      {
        category: 'money_request',
        evidence: 'pay 1000 rupees', // Not in text
        explanation: 'Money request',
      },
    ];

    const segments = highlightTranscript(text, hallucinatedFlags);
    expect(segments).toHaveLength(1);
    expect(segments[0].isHighlighted).toBe(false);
    expect(segments[0].text).toBe(text);
    // Unmatched evidence is NOT added
    expect(segments.map(s => s.text).join('')).toBe(text);
  });
});
