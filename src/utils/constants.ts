import type { DemoCall } from '../types';

export const DEMO_CALLS: DemoCall[] = [
  {
    id: 'gu-scam',
    title: 'ગુજરાતી ડિજિટલ અરેસ્ટ',
    subtitle: 'Gujarati Digital Arrest Scam',
    language: 'gu',
    audioFile: '/audio/gujarati-scam.wav',
    expectedRisk: 'high',
    script: `નમસ્તે, હું મુંબઈ પોલીસ સાયબર સેલમાંથી બોલું છું. 
તમારા આધાર નંબર પર મોકલેલા પાર્સલમાં ડ્રગ્સ મળ્યા છે. 
તમે ડિજિટલ અરેસ્ટમાં છો, ફોન કાપશો નહીં. 
કેસ બંધ કરવા માટે અત્યારે જ ₹50,000 ટ્રાન્સફર કરો.`,
  },
  {
    id: 'hi-scam',
    title: 'हिंदी डिजिटल अरेस्ट',
    subtitle: 'Hindi Digital Arrest Scam',
    language: 'hi',
    audioFile: '/audio/hindi-scam.wav',
    expectedRisk: 'high',
    script: `नमस्ते, मैं मुंबई पुलिस साइबर सेल से बोल रहा हूँ। 
आपके आधार नंबर से भेजे गए पार्सल में ड्रग्स मिले हैं। 
आप डिजिटल अरेस्ट में हैं, कॉल मत काटिए। 
केस बंद करने के लिए अभी ₹50,000 ट्रांसफर कीजिए।`,
  },
  {
    id: 'en-kyc-scam',
    title: 'English Bank KYC Scam',
    subtitle: 'Fake Bank OTP Request',
    language: 'en',
    audioFile: '/audio/english-kyc-scam.wav',
    expectedRisk: 'high',
    script: `Hello, this is your bank's KYC team. 
Your account will be blocked today because your KYC has expired. 
To keep it active, please share the OTP we just sent to your phone.`,
  },
  {
    id: 'en-genuine',
    title: 'Genuine Delivery Call',
    subtitle: 'Real Swiggy Delivery Partner',
    language: 'en',
    audioFile: '/audio/english-genuine.wav',
    expectedRisk: 'low',
    script: `Hi, this is the delivery partner from Swiggy. 
I'm outside your building with your order. 
Which gate should I come to?`,
  },
];

export const AUDIO_CONFIG = {
  sampleRate: 16000,
  channels: 1,
  bitDepth: 16,
  chunkDurationMs: 100,
} as const;

export const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ?? (import.meta.env.DEV ? 'http://localhost:3001' : '');
