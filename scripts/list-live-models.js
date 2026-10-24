// Lists models that support the Live API (bidiGenerateContent) for YOUR key.
// This is the authoritative availability check. Usage: npm run list-models
import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';

if (!process.env.GEMINI_API_KEY) { console.error('Set GEMINI_API_KEY in .env'); process.exit(1); }
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const pager = await ai.models.list({ config: { pageSize: 100 } });
for await (const m of pager) {
  if ((m.supportedActions || []).includes('bidiGenerateContent')) console.log(m.name);
}
