// REAL end-to-end timing test of the incremental assessment path (not mocked).
// Usage: node scripts/smoke-assess.js <id>   (backend must be running)
import fs from 'fs';
const id = process.argv[2];
const buf = fs.readFileSync(new URL(`../public/audio/${id}.wav`, import.meta.url));
const rate = buf.readUInt32LE(24);
const src = new Int16Array(buf.buffer.slice(buf.byteOffset + 44, buf.byteOffset + buf.length - ((buf.length - 44) % 2)));
const n = Math.floor((src.length * 16000) / rate);
const pcm = new Int16Array(n);
for (let i = 0; i < n; i++) { const x = (i * rate) / 16000, i0 = Math.floor(x), f = x - i0; pcm[i] = Math.round(src[i0] * (1 - f) + src[Math.min(i0 + 1, src.length - 1)] * f); }
const dur = n / 16000;
console.log(`[${id}] duration ${dur.toFixed(1)}s`);
const t0 = Date.now(); const at = () => ((Date.now() - t0) / 1000).toFixed(1);
let firstHigh = null;
async function assess(upto, final = false) {
  const slice = pcm.subarray(0, Math.floor(upto * 16000));
  const r = await fetch('http://localhost:3001/api/assess', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pcm: Buffer.from(slice.buffer, slice.byteOffset, slice.byteLength).toString('base64'), final }) });
  const a = await r.json();
  console.log(`[wall ${at()}s | audio ${upto.toFixed(1)}s${final ? ' FINAL' : ''}] risk=${a.riskLevel} flags=${(a.redFlags || []).map(f => f.category).join(',')}\n   transcript: ${(a.transcript || '').slice(0, 120)}\n   warning: ${a.warning}`);
  if (a.riskLevel === 'high' && firstHigh === null) firstHigh = Date.now() - t0;
}
// simulate real-time playback: every 3s of audio, one assessment (one at a time)
for (let s = 1.5; s < dur; s += 1.5) {
  const wait = s * 1000 - (Date.now() - t0); if (wait > 0) await new Promise(r => setTimeout(r, wait));
  assess(s).catch(e => console.log('assess error', e.message));
}
await new Promise(r => setTimeout(r, Math.max(0, dur * 1000 - (Date.now() - t0))));
console.log(`--- playback ended at wall ${at()}s; first HIGH at ${firstHigh === null ? 'never' : (firstHigh / 1000).toFixed(1) + 's'}`);
await new Promise(r => setTimeout(r, 6000));
