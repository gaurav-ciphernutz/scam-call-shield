/**
 * generate-demo-audio.js
 *
 * Generates synthetic WAV demo audio files for Scam Call Shield
 * using the Gemini TTS capability via @google/genai SDK.
 *
 * Usage:
 *   GEMINI_API_KEY=your_key node scripts/generate-demo-audio.js
 *
 * Output: public/audio/*.wav
 */

import 'dotenv/config';
import { GoogleGenAI, Modality } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = path.resolve(__dirname, '../public/audio');

const SCRIPTS = [
  {
    id: 'gujarati-scam',
    text: `નમસ્તે, હું મુંબઈ પોલીસ સાયબર સેલમાંથી બોલું છું. 
તમારા આધાર નંબર પર મોકલેલા પાર્સલમાં ડ્રગ્સ મળ્યા છે. 
તમે ડિજિટલ અરેસ્ટમાં છો, ફોન કાપશો નહીં. 
કેસ બંધ કરવા માટે અત્યારે જ ₹50,000 ટ્રાન્સફર કરો.`,
    voice: 'Puck',
    languageCode: 'gu-IN',
  },
  {
    id: 'hindi-scam',
    text: `नमस्ते, मैं मुंबई पुलिस साइबर सेल से बोल रहा हूँ। 
आपके आधार नंबर से भेजे गए पार्सल में ड्रग्स मिले हैं। 
आप डिजिटल अरेस्ट में हैं, कॉल मत काटिए। 
केस बंद करने के लिए अभी ₹50,000 ट्रांसफर कीजिए।`,
    voice: 'Charon',
    languageCode: 'hi-IN',
  },
  {
    id: 'english-kyc-scam',
    text: `Hello, this is your bank's KYC team. 
Your account will be blocked today because your KYC has expired. 
To keep it active, please share the OTP we just sent to your phone.`,
    voice: 'Aoede',
    languageCode: 'en-US',
  },
  {
    id: 'english-genuine',
    text: `Hi, this is the delivery partner from Swiggy. 
I'm outside your building with your order. 
Which gate should I come to?`,
    voice: 'Fenrir',
    languageCode: 'en-US',
  },
];

function pcmToWav(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function generateAudio(ai, script) {
  console.log(`Generating: ${script.id}...`);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: [{ parts: [{ text: script.text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: script.voice,
            },
          },
        },
      },
    });

    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioData) {
      throw new Error(`No audio data in response for ${script.id}`);
    }

    const audioBytes = pcmToWav(Buffer.from(audioData, 'base64'), 24000);
    const outputPath = path.join(AUDIO_DIR, `${script.id}.wav`);
    fs.writeFileSync(outputPath, audioBytes);
    const sizeKB = (audioBytes.length / 1024).toFixed(1);
    console.log(`  ✓ Saved ${script.id}.wav (${sizeKB} KB)`);
  } catch (err) {
    console.error(`  ✗ Failed to generate ${script.id}:`, err.message);
    process.exitCode = 1;
  }
}

/**
 * Generate a minimal valid WAV file with 3 seconds of silence.
 * Used as a fallback when TTS is unavailable.
 */
function generateSilentWav(outputPath) {
  const sampleRate = 16000;
  const duration = 3; // seconds
  const numSamples = sampleRate * duration;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = numSamples * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const buffer = Buffer.alloc(totalSize);
  let offset = 0;

  // RIFF header
  buffer.write('RIFF', offset); offset += 4;
  buffer.writeUInt32LE(totalSize - 8, offset); offset += 4;
  buffer.write('WAVE', offset); offset += 4;

  // fmt chunk
  buffer.write('fmt ', offset); offset += 4;
  buffer.writeUInt32LE(16, offset); offset += 4;          // chunk size
  buffer.writeUInt16LE(1, offset); offset += 2;           // PCM
  buffer.writeUInt16LE(numChannels, offset); offset += 2;
  buffer.writeUInt32LE(sampleRate, offset); offset += 4;
  buffer.writeUInt32LE(byteRate, offset); offset += 4;
  buffer.writeUInt16LE(blockAlign, offset); offset += 2;
  buffer.writeUInt16LE(bitsPerSample, offset); offset += 2;

  // data chunk header
  buffer.write('data', offset); offset += 4;
  buffer.writeUInt32LE(dataSize, offset); offset += 4;

  // Data is all zeros (silence) — buffer is already zeroed
  fs.writeFileSync(outputPath, buffer);
  console.log(`  ↳ Wrote silent placeholder: ${path.basename(outputPath)}`);
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('ERROR: GEMINI_API_KEY is not set.');
    process.exit(1);
  }

  fs.mkdirSync(AUDIO_DIR, { recursive: true });

  const ai = new GoogleGenAI({ apiKey });

  const only = process.argv.slice(2);
  for (const script of SCRIPTS.filter(s => !only.length || only.includes(s.id))) {
    await generateAudio(ai, script);
    // Rate limit: 1 request per second
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\nAll done! Audio files in public/audio/');
  
  // Check total size
  const totalSize = SCRIPTS.reduce((sum, s) => {
    try {
      const stat = fs.statSync(path.join(AUDIO_DIR, `${s.id}.wav`));
      return sum + stat.size;
    } catch {
      return sum;
    }
  }, 0);
  console.log(`Total audio size: ${(totalSize / 1024).toFixed(1)} KB`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
