import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { WarningBanner } from '../components/WarningBanner';
import { AssessmentPanel } from '../components/AssessmentPanel';
import type { ScamAssessment } from '../types';

describe('WarningBanner localization and rendering', () => {
  it('renders Gujarati warning and badge correctly', () => {
    const assessment: ScamAssessment = {
      riskLevel: 'high',
      language: 'gu',
      redFlags: [
        {
          category: 'threat',
          evidence: 'તમે ડિજિટલ અરેસ્ટમાં છો',
          explanation: 'ડિજિટલ અરેસ્ટનો ભય બતાવવામાં આવ્યો છે.',
        },
      ],
      warning: 'સાવધાન! આ કોલ સ્કેમ હોઈ શકે છે. પોલીસની ધમકી આપીને પૈસા માંગવા એ મોટો ખતરાનો સંકેત છે.',
      assessmentComplete: false,
    };

    render(<WarningBanner assessment={assessment} />);
    expect(screen.getByText('ગુજરાતી')).toBeInTheDocument();
    expect(screen.getByText(/સાવધાન! આ કોલ સ્કેમ હોઈ શકે છે/)).toBeInTheDocument();
  });

  it('renders Hindi warning and badge correctly', () => {
    const assessment: ScamAssessment = {
      riskLevel: 'high',
      language: 'hi',
      redFlags: [
        {
          category: 'threat',
          evidence: 'आप डिजिटल अरेस्ट में हैं',
          explanation: 'डिजिटल अरेस्ट की धमकी दी गई है।',
        },
      ],
      warning: 'सावधान! यह कॉल स्कैम हो सकती है। पुलिस के नाम पर धमकी देकर पैसे मांगना बड़ा खतरे का संकेत है।',
      assessmentComplete: false,
    };

    render(<WarningBanner assessment={assessment} />);
    expect(screen.getByText('हिंदी')).toBeInTheDocument();
    expect(screen.getByText(/सावधान! यह कॉल स्कैम हो सकती है/)).toBeInTheDocument();
  });

  it('renders English KYC/OTP warning correctly', () => {
    const assessment: ScamAssessment = {
      riskLevel: 'high',
      language: 'en',
      redFlags: [
        {
          category: 'otp_request',
          evidence: 'please share the OTP',
          explanation: 'Caller is demanding an OTP.',
        },
      ],
      warning: 'Warning: This may be a scam. Never share an OTP or password with someone who calls you unexpectedly.',
      assessmentComplete: false,
    };

    render(<WarningBanner assessment={assessment} />);
    expect(screen.getByText(/Never share an OTP or password/)).toBeInTheDocument();
  });
});

describe('AssessmentPanel risk states', () => {
  it('renders low-risk state for genuine delivery call without alarm', () => {
    const assessment: ScamAssessment = {
      riskLevel: 'low',
      language: 'en',
      redFlags: [],
      warning: 'No strong scam signals detected so far. This does not guarantee that the call is safe.',
      assessmentComplete: true,
    };

    render(<AssessmentPanel assessment={assessment} isAnalyzing={false} />);
    expect(screen.getByText('✅ Low Risk')).toBeInTheDocument();
    expect(screen.getByText(/No strong scam signals detected so far/)).toBeInTheDocument();
  });

  it('renders analyzing spinner when analyzing and no assessment yet', () => {
    render(<AssessmentPanel assessment={null} isAnalyzing={true} />);
    expect(screen.getByText('Gemini is analyzing the call…')).toBeInTheDocument();
  });
});
