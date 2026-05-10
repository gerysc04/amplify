# Amplify — Web Guitar Amp Simulator

Browser-based guitar amp simulator. User plugs guitar into audio interface, opens Chrome,
plays through real amp tones powered by NAM (Neural Amp Modeler) AI models — all client-side,
no plugins, no installation.

---

## Git rules
- Never add `Co-Authored-By: Claude` or any Claude attribution to commits.
- User (Gerysc04) is the sole committer on all git history.

---

## Project structure

```
amplify/
  frontend/     ← Vite + React + TypeScript SPA
  backend/      ← FastAPI (Python) — Phase 5+
  CLAUDE.md
  .gitignore
```

---

## Technology stack

### Frontend
- **Vite + React + TypeScript** — fast dev server, static build output, no Node.js in production
- **CSS modules** — no Tailwind
- `"use client"` pattern is irrelevant (no SSR); audio/MIDI components are plain React

### Audio (all client-side — no server involved)
- **Web Audio API** — browser audio graph
- **AudioWorklet** — real-time DSP in dedicated audio thread (128-sample chunks)
- **onnxruntime-web** — runs NAM `.onnx` models via WebAssembly in the browser
- **ConvolverNode** — cab IR convolution

### Backend (Phase 5+)
- **FastAPI** (Python) — async, typed via Pydantic, auto OpenAPI docs
- **Motor** — async MongoDB driver for Python
- **MongoDB** — running locally on the VPS (not Atlas)
- **python-jose / passlib** — JWT auth + password hashing

### MIDI
- **Web MIDI API** — connects to pedalboards and controllers

### Storage
- **localStorage** — preset JSON metadata
- **IndexedDB** — NAM model files, cab IR files (binary)
- **MongoDB** — user accounts and cloud preset sync (Phase 5)

### Deployment
- **VPS** (self-hosted)
- **Nginx** — serves static frontend build, reverse-proxies `/api/*` → FastAPI on `localhost:8000`
- No Vercel, no serverless

---

## Architecture

```
                        VPS
┌────────────────────────────────────────────┐
│  Nginx :80/:443                            │
│    /         → serves frontend/dist/       │
│    /api/*    → proxy → FastAPI :8000       │
│                                            │
│  FastAPI (Python)  :8000                   │
│    /api/auth/*      ← NextAuth-equivalent  │
│    /api/presets/*   ← CRUD                 │
│    /api/community/* ← sharing (Phase 5+)   │
│                                            │
│  MongoDB  :27017  (local, not Atlas)       │
└────────────────────────────────────────────┘

Browser (Chrome)
  Vite static bundle — all audio runs here
  API calls → https://yourdomain.com/api/*
```

---

## Signal chain (full, Phases 1–3)

```
Guitar → Audio Interface → getUserMedia
  → Noise Gate (AudioWorklet)
  → Pre-gain (GainNode)        ← Gain knob
  → NAM Model (ONNX/AudioWorklet)
  → Post-EQ (BiquadFilterNode) ← Bass/Mid/Treble knobs
  → Cab IR (ConvolverNode)
  → Effects (Delay/Reverb/Chorus)
  → Output
```

Phase 1 placeholder chain (no NAM yet):
```
getUserMedia → Analyser (level meter) → Pre-gain → WaveShaperNode → Output gain → destination
```

---

## Key technical constraints

### AudioContext must start on user gesture
```ts
// WRONG
useEffect(() => { new AudioContext(); }, []);

// CORRECT
const handleStart = () => { new AudioContext(); };
```

### getUserMedia constraints (disable browser processing)
```ts
navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    sampleRate: 48000,
  }
});
```

### AudioWorklet files must live in `public/`
```ts
await audioContext.audioWorklet.addModule('/worklets/nam-processor.js');
```

### ONNX is async, AudioWorklet is sync
Need a ring buffer to bridge async ONNX inference with synchronous 128-sample chunks.

### NAM knobs are external to the model
The NAM `.onnx` model has no parameters. Knobs are audio nodes around it:
```
Pre-gain → NAM model → Post-EQ
```

---

## File structure (target)

```
frontend/
  src/
    app/          ← React Router or flat page structure (TBD Phase 4)
    components/
      AudioEngine.tsx      ← React orchestrator
      AmpHead.tsx          ← Amp head UI + knobs
      EffectsRack.tsx      ← Effects chain UI (Phase 3)
      PresetBrowser.tsx    ← Preset list (Phase 4)
      ModelLoader.tsx      ← NAM file picker (Phase 2)
      CabLoader.tsx        ← IR file picker (Phase 2)
      LevelMeter.tsx       ← RMS input level bar
      MidiController.tsx   ← MIDI setup (Phase 6)
      knobs/
        Knob.tsx           ← Reusable SVG rotary knob
        Toggle.tsx         ← Stomp switch on/off
    lib/
      audio/
        AudioEngine.ts     ← Pure TS AudioContext lifecycle class
        NamProcessor.ts    ← ONNX model loading + inference (Phase 2)
        EffectsChain.ts    ← Web Audio node management (Phase 3)
        RingBuffer.ts      ← Async/sync bridge for ONNX (Phase 2)
      storage/
        PresetManager.ts   ← localStorage preset CRUD (Phase 4)
        FileCache.ts       ← IndexedDB for .onnx/.wav (Phase 4)
      midi/
        MidiManager.ts     ← Web MIDI API wrapper (Phase 6)
    types/
      audio.ts             ← AudioEngine types, PresetShape, etc.
  public/
    worklets/
      nam-processor.js     ← AudioWorklet processor (Phase 2)
      gate-processor.js    ← Noise gate AudioWorklet (Phase 3)
    models/                ← Bundled default NAM models (CC0/BY) — use Git LFS
    irs/                   ← Bundled default cab IRs

backend/
  main.py                  ← FastAPI app entry point
  routers/
    auth.py
    presets.py
    community.py
  models/
    user.py                ← Pydantic models
    preset.py
  db/
    mongo.py               ← Motor client setup
  requirements.txt
  .env.example
```

---

## Preset data shape

```ts
interface Preset {
  id: string;
  name: string;
  namModel: { filename: string; source: 'bundled' | 'uploaded' | 'indexeddb'; available: boolean };
  cabIR: { filename: string; source: 'bundled' | 'uploaded' };
  amp: { gain: number; bass: number; mid: number; treble: number; presence: number; volume: number };
  gate: { enabled: boolean; threshold: number; attack: number; release: number };
  eq: { enabled: boolean; bass: number; mid: number; treble: number };
  delay: { enabled: boolean; time: number; feedback: number; mix: number };
  reverb: { enabled: boolean; mix: number };
  chorus: { enabled: boolean; rate: number; depth: number; mix: number };
}
```

---

## Tone3000 policy
Do NOT cache or redistribute models from tone3000.com — violates their ToS.
Show a "Get more amps →" button that opens the site in a new tab. Users download and upload manually.

---

## Cab IRs
- Small files (100–500 KB), serve from `public/irs/`
- Use only CC0 or redistribution-friendly licenses
- Sources: Bogren Digital free pack, verified community IRs
- Users can also upload their own .wav files (stored in IndexedDB)

---

## Default presets (Phase 4)
Ship with these using bundled models:
- **Clean** — Fender-style, low gain, chorus on
- **Crunch** — Marshall-style, mid gain
- **Lead** — Friedman/Mesa, high gain, delay on
- **Metal** — tight high gain, gate on, scooped mids
- **Ambient** — clean, heavy reverb, long delay

---

## Development phases

### Phase 1 — Audio Foundation ✅ IN PROGRESS (migrating to Vite + TS)
- getUserMedia with correct constraints
- AudioContext on user gesture (Start button)
- WaveShaperNode distortion (NAM placeholder)
- Pre-gain GainNode (Gain knob)
- Input level meter (RMS via AnalyserNode)
- SVG rotary Knob component
- Clean dark UI with CSS modules

**Done when:** Plug in guitar → click Start → hear distorted signal through headphones.

### Phase 2 — NAM Integration
- Install onnxruntime-web
- AudioWorklet processor for NAM
- Ring buffer (async ONNX ↔ sync 128-sample chunks)
- .onnx file loader (file picker + IndexedDB cache)
- ConvolverNode for cab IR
- .wav IR file loader

**Done when:** Load a .onnx NAM model + cab IR → hear real amp tone.

### Phase 3 — Effects Chain
- Noise gate (AudioWorklet)
- 3-band EQ (BiquadFilterNode)
- Delay (DelayNode)
- Reverb (ConvolverNode + room IR)
- Chorus (LFO + short DelayNode)
- All with on/off toggles and parameter knobs

### Phase 4 — UI & Presets
- Full amp head UI with all knobs
- Effects rack UI
- Preset save/load/export/import
- Default presets
- IndexedDB file caching
- Model + IR library UI

### Phase 5 — Fullstack (Python backend)
- FastAPI app bootstrapped
- MongoDB local on VPS
- User auth (JWT — python-jose + passlib)
- Preset sync to MongoDB
- Community preset sharing

### Phase 6 — MIDI
- Web MIDI API (requestMIDIAccess)
- MIDI learn mode (click knob, move controller)
- CC → parameter, PC → preset switch
- Expression pedal support

### Phase 7 — Pitch Shifter (Rust/WASM)
- Rust RubberBand pitch shift compiled to WASM
- Loaded alongside JS in AudioWorklet
- Only this component uses Rust

---

## Developer preferences
- TypeScript for frontend, Python (typed with Pydantic) for backend
- Full file contents when showing code, not partial snippets
- Explain reasoning behind technical decisions
- Commit per feature, no Co-Authored-By
- **Always run the dev server and let the user test before committing** — never commit untested code
