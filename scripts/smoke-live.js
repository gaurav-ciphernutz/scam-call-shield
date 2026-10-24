// REAL Gemini Live smoke test (not mocked). Needs the backend running (npm run dev:server).
// Usage: node scripts/smoke-live.js gujarati-scam
// Flow: POST /api/token -> ephemeral token -> live.connect (v1alpha) -> stream WAV as 16k PCM at real-time pace.
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';

const id = process.argv[2] || 'english-genuine';
const buf = fs.readFileSync(new URL(`../public/audio/${id}.wav`, import.meta.url));
const rate = buf.readUInt32LE(24);
const pcm24 = new Int16Array(buf.buffer.slice(buf.byteOffset + 44, buf.byteOffset + buf.length - ((buf.length - 44) % 2)));

// linear resample to 16 kHz
const outLen = Math.floor((pcm24.length * 16000) / rate);
const pcm = new Int16Array(outLen);
for (let i = 0; i < outLen; i++) {
  const x = (i * rate) / 16000, i0 = Math.floor(x), f = x - i0;
  pcm[i] = Math.round(pcm24[i0] * (1 - f) + (pcm24[Math.min(i0 + 1, pcm24.length - 1)] * f));
}
const total = outLen / 16000;
console.log(`[${id}] wav ${rate}Hz -> 16kHz, ${total.toFixed(1)}s`);

const r = await fetch('http://localhost:3001/api/token', { method: 'POST' });
if (!r.ok) { console.error('token endpoint failed', r.status); process.exit(1); }
const { token, model } = await r.json();

const t0 = Date.now();
const at = () => ((Date.now() - t0) / 1000).toFixed(1) + 's';
let modelText = '', transcript = '', chunks = 0;
const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: 'v1alpha' } });
let done;
const finished = new Promise((res) => (done = res));

const session = await ai.live.connect({
  model,
  callbacks: {
    onopen: () => console.log(`[${at()}] connected (${model})`),
    onmessage: (m) => {
      const sc = m.serverContent;
      if (sc?.inputTranscription?.text) console.log(`[${at()}] in-transcript: ${sc.inputTranscription.text}`);
      if (sc?.turnComplete || sc?.generationComplete) console.log(`[${at()}] turnComplete=${!!sc.turnComplete} genComplete=${!!sc.generationComplete}`);
      if (!sc) return;
      if (sc.inputTranscription?.text) { transcript += sc.inputTranscription.text; }
      for (const p of sc.modelTurn?.parts ?? []) if (p.text) modelText += p.text;
      if (sc.outputTranscription?.text) modelText += sc.outputTranscription.text;
      if (sc.turnComplete) {
        console.log(`[${at()}] MODEL TURN: ${modelText.trim().slice(0, 700)}`);
        modelText = '';
        if (final) done();
      }
    },
    onerror: (e) => console.error('error', e?.message || 'unknown'),
    onclose: (e) => { console.log(`[${at()}] closed code=${e.code} reason=${e.reason || ''}`); done(); },
  },
});

let final = false;
const CH = 1600; // 100 ms
const SEG = 30; // chunks per segment (3 s)
let inSeg = false;
for (let off = 0, n = 0; off < outLen; off += CH, n++) {
  const wait = n * 100 - (Date.now() - t0);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const slice = pcm.subarray(off, Math.min(off + CH, outLen));
  session.sendRealtimeInput({ audio: { data: Buffer.from(slice.buffer, slice.byteOffset, slice.byteLength).toString('base64'), mimeType: 'audio/pcm;rate=16000' } });
  chunks++;
}
console.log(`[${at()}] streamed ${chunks} chunks; transcript so far: ${transcript.slice(0, 300)}`);
session.sendRealtimeInput({ audioStreamEnd: true });
final = true;
session.sendRealtimeInput({ text: 'ASSESS (final): the call has ended. Set assessmentComplete to true.' });
await Promise.race([finished, new Promise((r) => setTimeout(r, 25000))]);
console.log('TRANSCRIPT:', transcript);
session.close();
process.exit(0);
