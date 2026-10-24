# 🛡️ Scam Call Shield

**AI-powered real-time scam call detection for Garbathon 2026**

> Analyzes scripted phone calls as they play in real-time using Google Gemini Live API (`gemini-3.8-live`), flags suspicious behavior *before the call ends*, and warns users in Gujarati, Hindi, or English with clear evidence.

---

## 🎯 Demo Scenarios

| Scenario | Language | Expected Result | Evidence Detected |
|---|---|---|---|
| **Mumbai Police Cyber Cell** (Digital Arrest) | Gujarati (`gu`) | 🔴 **HIGH RISK** | Impersonation ("પોલીસ સાયબર સેલ"), Threat ("ડિજિટલ અરેસ્ટ"), Money Demand ("₹50,000 ટ્રાન્સફર") |
| **Mumbai Police Cyber Cell** (Digital Arrest) | Hindi (`hi`) | 🔴 **HIGH RISK** | Impersonation ("मुंबई पुलिस"), Threat ("डिजिटल अरेस्ट"), Money Demand ("₹50,000 ट्रांसफर") |
| **Bank KYC / OTP Theft** | English (`en`) | 🔴 **HIGH RISK** | Bank Impersonation, Account Freeze Threat, OTP Demand ("share the OTP") |
| **Swiggy Delivery Partner** | English (`en`) | 🟢 **LOW RISK** | None — Gate query is recognized as non-suspicious (No false positive) |

---

## 🏗️ Architecture

```
Browser Client (React 19 + Vite + TypeScript + Tailwind CSS)
  ├── CallSelector: Choose 1 of 4 pre-recorded phone calls
  ├── AudioStreamingService (Web Audio API)
  │     ├── Decodes WAV to Float32 audio buffer
  │     ├── Resamples to 16 kHz mono (OfflineAudioContext)
  │     ├── Converts Float32 to Signed 16-bit PCM (s16le)
  │     ├── Chunks into ~100 ms slices (1600 samples)
  │     └── Streams chunks synchronized with real-time playback
  ├── GeminiLiveService (@google/genai SDK)
  │     ├── Requests short-lived ephemeral token from backend
  │     ├── Connects directly to Gemini Live WebSocket (v1alpha)
  │     ├── Transmits real-time PCM audio chunks
  │     └── Receives incremental transcripts & turn assessments
  └── UI Components (AssessmentPanel, WarningBanner, StatusBar)
        ├── Low / Medium / High risk indicators
        ├── Evidence-grounded red flags list
        └── Prominent warnings in authentic Gujarati & Devanagari script

Express Backend (Node.js)
  ├── POST /api/token: Mints single-use, 10-minute ephemeral auth tokens
  │     └── Enforces liveConnectConstraints (model & systemInstruction locked server-side)
  └── POST /api/assess: Incremental audio assessment endpoint
        └── Server-side validated schema output
```

---

## ⚡ Technical Highlights

1. **True Audio Streaming**: Rather than uploading an entire file or playing audio in an unlinked `<audio>` tag, audio is resampled to 16 kHz mono signed 16-bit PCM and streamed via WebSockets at true playback pace (~100 ms per chunk).
2. **Short-Lived Ephemeral Tokens**: The permanent `GEMINI_API_KEY` stays on the server. The client receives a restricted, single-use token configured with `liveConnectConstraints`.
3. **Evidence-Grounded Scam Logic**: Gemini evaluates context and intent—distinguishing a legitimate delivery call from an extortion scam. It never flags on a single keyword alone.
4. **Early Warnings**: Warnings appear in real-time while audio is playing.
5. **No Microphone Permissions Required**: Prerecorded demonstration mode requires zero microphone access.

---

## 🚀 Setup & Local Execution

### Prerequisites

- Node.js 18+ (tested on v22)
- Google Gemini API key with access to `gemini-3.8-live`

### 1. Installation

```bash
git clone https://github.com/gaurav-ciphernutz/scam-call-shield.git
cd scam-call-shield
npm install
```

### 2. Environment Configuration

```bash
cp .env.example .env
```

Edit `.env` and configure your API key:
```env
GEMINI_API_KEY=your_actual_gemini_api_key
GEMINI_LIVE_MODEL=gemini-3.8-live
GEMINI_RESPONSE_MODALITY=AUDIO
```

### 3. Verify Model Availability

```bash
npm run list-models
```

### 4. Run Locally

```bash
npm run dev
```

- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:3001

---

## 🧪 Testing

### Automated Test Suite (62 Mocked Tests)

```bash
npm test
```

Verifies:
- Float32 to Int16 PCM conversion, clamping, and base64 round-trips
- Audio chunking and real-time pacing
- Pause, resume, restart, and stop lifecycle
- Assessment schema validation and merging logic
- Gujarati & Hindi localized warning banner rendering
- Genuine call non-alarm state handling

### Live Gemini Smoke Test

With the server running (`npm run dev:server`), test the real Live API pipeline:

```bash
node scripts/smoke-live.js gujarati-scam
node scripts/smoke-live.js hindi-scam
node scripts/smoke-live.js english-kyc-scam
node scripts/smoke-live.js english-genuine
```

---

## 📋 Security & Compliance

- **No Secrets in Client Code**: All Gemini credentials reside server-side.
- **Repository Size**: Strictly under 10 MB (audio assets total ~2.6 MB).
- **Single Branch**: Developed strictly on `main`.
- **Disclaimer**: AI risk assessments are advisory signals, not guarantees of safety.
