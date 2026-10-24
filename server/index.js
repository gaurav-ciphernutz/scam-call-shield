/**
 * Scam Call Shield backend. Its only job: keep the permanent GEMINI_API_KEY
 * server-side and mint short-lived, single-use, config-locked ephemeral tokens
 * for the browser's direct Live API WebSocket.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { GoogleGenAI, Modality } from '@google/genai';
import { SYSTEM_INSTRUCTION, ASSESS_INSTRUCTION, ASSESS_SCHEMA } from './prompt.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, '..', 'dist');

const PORT = Number(process.env.PORT) || 3001;
const HOST = '0.0.0.0';
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_LIVE_MODEL; // no silent default: must be verified (see npm run list-models)
const MODALITY = process.env.GEMINI_RESPONSE_MODALITY === 'TEXT' ? Modality.TEXT : Modality.AUDIO;

if (!API_KEY || !MODEL) {
  console.error('[Server] Set GEMINI_API_KEY and GEMINI_LIVE_MODEL in .env (see .env.example).');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: API_KEY, httpOptions: { apiVersion: 'v1alpha' } });
const ASSESS_MODEL = process.env.GEMINI_ASSESS_MODEL || 'gemini-3.1-flash-lite';
const ai2 = new GoogleGenAI({ apiKey: API_KEY }); // default API version for generateContent
const app = express();
app.use(express.json({ limit: '4mb' }));

const isAllowedOrigin = (origin, req) => {
  if (!origin) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL) return true;
  if (process.env.RENDER_EXTERNAL_URL && origin === process.env.RENDER_EXTERNAL_URL) return true;
  const host = req?.get?.('host');
  if (host && (origin === `https://${host}` || origin === `http://${host}`)) return true;
  return false;
};

const corsOptionsDelegate = (req, cb) => {
  const origin = req.header('Origin');
  if (isAllowedOrigin(origin, req)) {
    cb(null, {
      origin: true,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    });
  } else {
    cb(new Error(`Origin ${origin} not allowed by CORS`));
  }
};

app.use(cors(corsOptionsDelegate));
app.options('*', cors(corsOptionsDelegate));

// Naive per-IP rate limit (demo-grade)
const hits = new Map();
function rateLimit(req, res, next) {
  const now = Date.now();
  const recent = (hits.get(req.ip) || []).filter((t) => now - t < 60_000);
  if (recent.length >= 60) return res.status(429).json({ error: 'Too many requests' });
  recent.push(now);
  hits.set(req.ip, recent);
  next();
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.post('/api/token', rateLimit, async (_req, res) => {
  try {
    const now = Date.now();
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(now + 10 * 60_000).toISOString(),
        newSessionExpireTime: new Date(now + 60_000).toISOString(),
        liveConnectConstraints: {
          model: MODEL,
          config: {
            responseModalities: [MODALITY],
            systemInstruction: SYSTEM_INSTRUCTION,
            inputAudioTranscription: {},
            ...(MODALITY === Modality.AUDIO ? { outputAudioTranscription: {} } : {}),
          },
        },
        httpOptions: { apiVersion: 'v1alpha' },
      },
    });
    res.json({ token: token.name, model: MODEL });
  } catch (err) {
    console.error('[Server] token mint failed:', err?.message);
    res.status(502).json({ error: 'Could not create session token' }); // never echo provider details/keys
  }
});

// Incremental assessment: cumulative 16 kHz mono s16le PCM heard so far -> structured assessment.
// (Live API input transcription only arrives at end-of-clip for this model, so mid-call warnings use this path.)
const MAX_PCM_BYTES = 16000 * 2 * 90; // 90 s
app.post('/api/assess', rateLimit, async (req, res) => {
  const pcm = req.body?.pcm;
  if (typeof pcm !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(pcm) || pcm.length * 0.75 > MAX_PCM_BYTES) {
    return res.status(400).json({ error: 'Invalid audio' });
  }
  const bytes = Buffer.from(pcm, 'base64');
  const wav = Buffer.alloc(44);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + bytes.length, 4); wav.write('WAVE', 8); wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24);
  wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(bytes.length, 40);
  try {
    const r = await ai2.models.generateContent({
      model: ASSESS_MODEL,
      contents: [{ role: 'user', parts: [
        { inlineData: { mimeType: 'audio/wav', data: Buffer.concat([wav, bytes]).toString('base64') } },
        { text: req.body?.final ? 'The call has ended. Give the final assessment (assessmentComplete true).' : 'This is the call so far. Assess it (assessmentComplete false).' },
      ] }],
      config: { systemInstruction: ASSESS_INSTRUCTION, responseMimeType: 'application/json', responseSchema: ASSESS_SCHEMA, temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
    });
    res.type('application/json').send(r.text ?? '{}');
  } catch (err) {
    console.error('[Server] assess failed:', err?.message);
    const isRateLimit = err?.status === 429 || /429|resource.*exhausted|quota|rate/i.test(err?.message || '');
    if (isRateLimit) {
      res.status(429).json({ error: 'AI provider rate limit reached. Backing off.' });
    } else {
      res.status(502).json({ error: 'Assessment failed' });
    }
  }
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
} else {
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
}

app.listen(PORT, HOST, () => console.log(`[Server] http://${HOST}:${PORT} (model ${MODEL})`));
