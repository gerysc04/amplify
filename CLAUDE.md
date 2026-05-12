# Amplify — Web Guitar Amp Simulator

Browser-based guitar amp simulator. User plugs guitar into audio interface, opens Chrome,
plays through real amp tones powered by NAM (Neural Amp Modeler) AI models — all client-side
DSP, tone3000 for amp/cab/pedal library, FastAPI + PostgreSQL backend for multi-device sync.

---

## Git rules
- Never add `Co-Authored-By: Claude` or any Claude attribution to commits.
- User (Gerysc04) is the sole committer on all git history.

---

## Project structure

```
amplify/
  frontend/   ← Vite + React + TypeScript SPA
  backend/    ← FastAPI + PostgreSQL (multi-device preset + MIDI sync)
  CLAUDE.md
  .gitignore
```

---

## Technology stack

### Frontend
- **Vite + React + TypeScript** — fast dev server, static build output
- **CSS modules** — no Tailwind

### Audio (all client-side)
- **Web Audio API** — browser audio graph
- **AudioWorklet** — real-time DSP in dedicated audio thread (128-sample chunks)
- **NAM inference** — inline JS WaveNet/LSTM inference, no ONNX runtime
- **ConvolverNode** — cab IR convolution
- **Rust/WASM** — pitch shifter only (Phase 9)

### Tone library — tone3000
- **tone3000 API v1** — official OAuth API for browsing amps, cabs, pedals
- **Custom amp browser UI** — Standard OAuth Flow; we call their search API directly
  and render results in our own UI (not their popup) so we control the design
- **Gear types**: `amp` (capture only), `full-rig` (amp+cab baked in), `ir` (cab IR), `pedal`
- **Full-rig handling**: if a tone is `full-rig`, ConvolverNode is bypassed (dirac delta)
- **Pedals** (future Phase 10): NAM pedal captures inserted as extra AudioWorklet nodes
  before/after the amp, enabling a Bias FX-style full signal chain
- Files flow from tone3000 → user's browser, never our server — no redistribution
- Any public tone works regardless of creative license — licensing is between creator and tone3000
- Publishable key (`t3k_pub_...`) is safe to commit — designed to be public (like Stripe pk_live_)
- Files cached in IndexedDB after first fetch; Load Tone Flow re-fetches if cache is cleared

### MIDI
- **Web MIDI API** — connects to pedalboards and controllers
- Multiple named MIDI setups per user (e.g. "Thall", "Rock", "Live")
- Each setup: CC/PC → action mappings (load preset, toggle effect, set param, expression pedal)
- Active setup persisted in backend and synced across devices

### Storage & sync
- **IndexedDB** — binary model/IR file cache (per device)
- **Backend DB** — presets + MIDI setups synced across devices
- No localStorage for primary data — backend is source of truth when logged in

### Backend
- **FastAPI** (Python) — async, typed via Pydantic
- **PostgreSQL** — presets, MIDI setups, mappings
- **asyncpg** — async PostgreSQL driver
- **Alembic** — schema migrations
- **Auth**: tone3000 OAuth token verification (call `/api/v1/user`) → upsert user row
  No passwords, no email — tone3000 IS the login system

### Deployment
- **VPS** (self-hosted)
- **Nginx** — serves frontend build, proxies `/api/*` → FastAPI :8000
- **PostgreSQL** — local on VPS

---

## Architecture

```
Browser (Chrome)
  ├─ tone3000 OAuth (Standard Flow) → access token in localStorage
  ├─ Custom amp/cab/pedal browser → calls tone3000 search API directly
  ├─ NAM model files → fetched from tone3000, cached in IndexedDB
  └─ Presets + MIDI setups → synced to/from backend (tone3000 token as auth)

VPS
  ├─ Nginx :80/:443
  │    /       → frontend/dist/
  │    /api/*  → FastAPI :8000
  ├─ FastAPI
  │    middleware: verify tone3000 token → get/create user
  │    GET/POST/DELETE /api/presets
  │    GET/POST/PUT/DELETE /api/midi-setups
  │    GET/POST/PUT/DELETE /api/midi-setups/:id/mappings
  └─ PostgreSQL :5432 (local)
```

---

## Database schema

```sql
-- Created on first tone3000 login; tone3000_id is the identity
CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tone3000_id  TEXT UNIQUE NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Saved presets (amp + all effect parameters)
CREATE TABLE presets (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  position         INTEGER DEFAULT 0,         -- display order
  -- tone3000 references
  nam_tone3000_id  INTEGER,                   -- amp or full-rig tone ID
  nam_gear_type    TEXT,                      -- 'amp' | 'full-rig'
  cab_tone3000_id  INTEGER,                   -- IR tone ID (NULL if full-rig)
  -- all amp + effect parameters
  params           JSONB NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON presets (user_id, position);

-- Named MIDI setups per user
CREATE TABLE midi_setups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,                  -- "Thall", "Rock", "Live"...
  is_active   BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- CC/PC → action mappings within a setup
CREATE TABLE midi_mappings (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setup_id  UUID NOT NULL REFERENCES midi_setups(id) ON DELETE CASCADE,
  cc        SMALLINT NOT NULL,               -- 0–127
  channel   SMALLINT DEFAULT 0,             -- 0 = any channel
  action    JSONB NOT NULL,
  -- action shapes:
  --   {"type": "load_preset",  "preset_id": "uuid"}
  --   {"type": "toggle",       "target": "chorus"}
  --   {"type": "set_param",    "target": "gain", "min": 0.0, "max": 1.0}
  --   {"type": "set_param",    "target": "pitch_shift.semitones", "min": -12, "max": 12}
  UNIQUE (setup_id, cc, channel)
);

-- Future Phase 10: pedal slots in the signal chain
CREATE TABLE preset_pedals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_id    UUID NOT NULL REFERENCES presets(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL,             -- slot order
  chain        TEXT NOT NULL,               -- 'pre_amp' | 'post_amp'
  tone3000_id  INTEGER NOT NULL,            -- pedal capture on tone3000
  enabled      BOOLEAN DEFAULT true,
  params       JSONB DEFAULT '{}'
);
```

---

## Signal chain

```
Guitar → Audio Interface → getUserMedia

  [Pre-amp pedal slots]              ← NAM pedal captures (Phase 10)
  → Noise Gate (AudioWorklet)        ← Threshold, on/off
  → Pre-gain (GainNode)              ← Gain knob
  → NAM Amp (AudioWorklet)           ← amp or full-rig tone
  → Compressor (AudioWorklet)        ← Threshold/Ratio/Attack/Release (Phase 6)
  → Post-EQ (BiquadFilterNode ×3)    ← Bass/Mid/Treble
  → Cab IR (ConvolverNode)           ← ir tone or local .wav; bypassed if full-rig
  [Post-amp pedal slots]             ← NAM pedal captures (Phase 10)
  → Delay (DelayNode)
  → Reverb (ConvolverNode)
  → Chorus (LFO + DelayNode)
  → Pitch Shifter (Rust/WASM)        ← Phase 9
  → Output
```

Tuner and spectrum analyser run as parallel AnalyserNode taps.
Looper inserts after the full chain (Phase 7).

---

## Key technical constraints

### AudioContext must start on user gesture
```ts
// WRONG — will be blocked
useEffect(() => { new AudioContext(); }, []);

// CORRECT
const handleStart = () => { new AudioContext(); };
```

### getUserMedia constraints (disable all browser processing)
```ts
navigator.mediaDevices.getUserMedia({
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 48000 }
});
```

### AudioWorklet files must live in `public/`
```ts
await audioContext.audioWorklet.addModule('/worklets/nam-processor.js');
```

### Full-rig bypass
When a tone's `nam_gear_type === 'full-rig'`, the ConvolverNode is loaded with a
1-sample dirac delta (passthrough). The cab IR section is hidden in the UI.

### Looper timing must be sample-accurate
Use AudioContext.currentTime scheduling, not setTimeout.

### Pitch shifter is WASM only
Only the pitch shifter uses Rust/WASM. Everything else is plain JS AudioWorklet.

---

## File structure (target)

```
frontend/
  src/
    components/
      AudioEngine.tsx      ← React orchestrator
      AmpHead.tsx          ← Amp head UI + Gain/EQ knobs
      AmpBrowser.tsx       ← tone3000 custom amp/cab/pedal browser (Phase 4)
      EffectsRack.tsx      ← Gate/Delay/Reverb/Chorus UI
      PresetBrowser.tsx    ← Preset list + sync
      ModelLoader.tsx      ← Local .nam file picker (fallback)
      CabLoader.tsx        ← Local .wav file picker (fallback)
      LevelMeter.tsx       ← RMS input level bar
      SpectrumAnalyser.tsx ← Real-time FFT display (Phase 8)
      ParametricEQ.tsx     ← Graphical EQ with draggable nodes (Phase 8)
      Tuner.tsx            ← Chromatic tuner display (Phase 6)
      Looper.tsx           ← Loop recorder UI (Phase 7)
      Recorder.tsx         ← Record + export WAV (Phase 7)
      MidiController.tsx   ← MIDI setup manager (Phase 5)
      knobs/
        Knob.tsx           ← SVG rotary knob (0–1, vertical drag)
        Toggle.tsx         ← Stomp switch on/off
    lib/
      audio/
        AudioEngine.ts     ← AudioContext lifecycle + signal chain
        NamProcessor.ts    ← .nam parsing + worklet bridge
        EffectsChain.ts    ← Post-cab effects nodes
        Compressor.ts      ← Dynamics processor (Phase 6)
        Looper.ts          ← Sample-accurate loop recorder (Phase 7)
        Recorder.ts        ← MediaRecorder WAV export (Phase 7)
        PitchDetector.ts   ← YIN pitch detection (Phase 6)
        nam/
          index.ts         ← Weight parser + validator
          types.ts         ← NAM config interfaces
      storage/
        FileCache.ts       ← IndexedDB binary cache
      tone3000/
        client.ts          ← OAuth flows + authenticated API client
        types.ts           ← Tone, Model, User interfaces
      api/
        presets.ts         ← Backend preset CRUD
        midiSetups.ts      ← Backend MIDI setup CRUD
      midi/
        MidiManager.ts     ← Web MIDI API wrapper (Phase 5)
    types/
      audio.ts             ← Preset, MidiSetup, MidiMapping interfaces
  public/
    worklets/
      nam-processor.js         ← NAM inference (WaveNet + LSTM)
      gate-processor.js        ← Noise gate
      compressor-processor.js  ← Dynamics (Phase 6)
      pitch-processor.js       ← Feeds YIN detector (Phase 6)
      looper-processor.js      ← Sample-accurate looper (Phase 7)
      pitch-shifter.js         ← Rust/WASM wrapper (Phase 9)
    wasm/
      pitch_shifter.wasm       ← Compiled Rust (Phase 9)

backend/
  main.py              ← FastAPI app entry point
  routers/
    presets.py         ← GET/POST/PUT/DELETE /api/presets
    midi_setups.py     ← CRUD for setups + mappings
  models/
    preset.py          ← Pydantic schemas
    midi.py
  db/
    connection.py      ← asyncpg pool setup
    migrations/        ← Alembic migration files
  auth.py              ← tone3000 token verification middleware
  requirements.txt
```

---

## tone3000 integration policy
- Use the **Standard OAuth Flow** — user connects their tone3000 account once per device
- Build a **custom amp browser UI** using their search API — do not use their popup select flow
- Amplify calls `GET /api/v1/tones/search`, `GET /api/v1/models` directly from the browser
- Gear types to support: `amp`, `full-rig`, `ir` now; `pedal` in Phase 10
- Files are never stored on our servers — fetched browser-side, cached in IndexedDB
- Any public tone works regardless of creative license
- Publishable key is committed to the repo (safe — designed to be public)

---

## Development phases

### Phase 1 — Audio Foundation ✅
- getUserMedia, AudioContext on user gesture, WaveShaper placeholder
- Pre-gain, level meter, SVG Knob, device selection

### Phase 2 — NAM Integration ✅
- Native .nam parsing, inline WaveNet/LSTM inference in AudioWorklet
- ConvolverNode for cab IR, model survives stop/start

### Phase 3 — Effects Chain ✅
- Noise gate, 3-band EQ, delay, reverb (synthetic IR), chorus
- All with wet/dry mix + on/off bypass

### Phase 4 — Presets + tone3000 + Backend
- **tone3000 Standard OAuth Flow** — connect account, access token stored per device
- **Custom amp browser** — search/browse tone3000 catalog (amp, full-rig, ir gear types)
- **Full-rig handling** — auto-bypass ConvolverNode when gear_type is full-rig
- **Backend** — FastAPI + PostgreSQL for preset + MIDI setup sync
- **Preset CRUD** — save/load/delete/export/import; synced across devices via backend
- **Local file fallback** — upload own .nam/.wav when not using tone3000

### Phase 5 — MIDI
- Web MIDI API, MIDI learn mode (click knob → move controller → mapped)
- Multiple named MIDI setups per user, synced to backend
- CC → load preset / toggle effect / set param / expression pedal
- PC → preset switch; active setup persisted and synced

### Phase 6 — Tuner + Compressor
- Chromatic tuner: YIN algorithm in AudioWorklet tap
- Compressor: soft-knee dynamics, AudioWorklet-based

### Phase 7 — Looper + Recording
- Recorder: MediaRecorder → WAV export
- Looper: sample-accurate, SharedArrayBuffer, record/play/overdub

### Phase 8 — Graphical Parametric EQ + Spectrum Analyser
- Up to 8-band parametric EQ with draggable Bode plot overlay
- Real-time FFT spectrum analyser rendered behind the EQ curve

### Phase 9 — Pitch Shifter (Rust/WASM)
- Rust pitch shifting compiled to WASM, runs inside AudioWorklet
- Semitones knob (−12 to +12), optional formant preservation

### Phase 10 — Pedal Chain (Bias FX-style)
- NAM pedal captures from tone3000 (`gears=pedal`)
- Configurable pre-amp and post-amp pedal slots
- Each slot is an AudioWorkletNode running a .nam pedal model
- Drag-and-drop slot reordering
- `preset_pedals` table in DB stores slot order, tone3000_id, enabled state

---

## Developer preferences
- TypeScript for all frontend code, Python (typed with Pydantic) for backend
- CSS modules, no Tailwind
- Full file contents when showing code, not partial snippets
- Commit per feature, no Co-Authored-By
- **Always run the dev server and let the user test before committing**
