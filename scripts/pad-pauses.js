// Extends natural pauses (>=120 ms of near-silence) in the demo WAVs to ~0.9 s so the audio
// behaves like a real phone call with sentence-level pauses. Local only, no API calls.
// Usage: node scripts/pad-pauses.js   (idempotent: pauses already >= 0.9 s are left alone)
import fs from 'fs';
const dir = new URL('../public/audio/', import.meta.url);
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.wav'))) {
  const buf = fs.readFileSync(new URL(f, dir));
  const rate = buf.readUInt32LE(24);
  const pcm = new Int16Array(buf.buffer.slice(buf.byteOffset + 44, buf.byteOffset + buf.length - ((buf.length - 44) % 2)));
  const win = Math.floor(rate * 0.02), thr = 400, minRun = 6 /*120ms*/, target = Math.floor(rate * 0.9);
  const out = []; let i = 0, quiet = 0, runStart = -1, pads = 0;
  const rms = (s, e) => { let a = 0; for (let k = s; k < e; k++) a += pcm[k] * pcm[k]; return Math.sqrt(a / (e - s)); };
  const segs = []; let cur = 0;
  for (let w = 0; w + win <= pcm.length; w += win) {
    if (rms(w, w + win) < thr) { if (runStart < 0) runStart = w; }
    else { if (runStart >= 0 && (w - runStart) / win >= minRun && runStart > rate * 0.5) segs.push([runStart, w]); runStart = -1; }
  }
  let pos = 0; const parts = [];
  for (const [s, e] of segs) {
    parts.push(pcm.subarray(pos, s)); const len = e - s;
    parts.push(new Int16Array(Math.max(len, target))); if (len < target) pads++; pos = e;
  }
  parts.push(pcm.subarray(pos));
  const total = parts.reduce((n, p) => n + p.length, 0);
  const res = new Int16Array(total); let o = 0; for (const p of parts) { res.set(p, o); o += p.length; }
  const h = Buffer.from(buf.subarray(0, 44)); h.writeUInt32LE(36 + res.length * 2, 4); h.writeUInt32LE(res.length * 2, 40);
  fs.writeFileSync(new URL(f, dir), Buffer.concat([h, Buffer.from(res.buffer)]));
  console.log(`${f}: ${pads} pauses padded, ${(pcm.length / rate).toFixed(1)}s -> ${(total / rate).toFixed(1)}s`);
}
