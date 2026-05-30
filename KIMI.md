# Amplify — Web Guitar Amp Simulator

Browser-based guitar amp simulator. Born from the need to play guitar on Linux without
relying on Windows-only plugins (Bias FX2, Archetype, etc.). User plugs guitar into an audio
interface, opens Chrome, and plays through real amp tones powered by NAM (Neural Amp Modeler)
AI models — all client-side DSP. tone3000 provides the amp/cab/pedal library. FastAPI + MongoDB
backend for multi-device preset/MIDI sync.


## Project structure

```
amplify/
  frontend/   ← Vite + React + TypeScript SPA
  backend/    ← FastAPI + MongoDB (multi-device preset + MIDI sync)
  KIMI.md     ← This file
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
- **NAM inference** — inline JS WaveNet/LSTM inference in AudioWorklet, no ONNX runtime;
  NAM v0.5.x format only (parser validates weight count and rejects unsupported versions)
- **ConvolverNode** — cab IR convolution
- **Whammy/Transpose** — two-tap crossfade OLA ring buffer in AudioWorklet (JS); Phase 9
  replaces with Rust phase-vocoder → WASM for quality + lower CPU usage

### Tone library — tone3000
- **tone3000 API v1** — official OAuth API for browsing amps, cabs, pedals
- **Custom amp browser UI** — Standard OAuth Flow (PKCE, backend-side); we call their search API
  directly from the browser and render results in our own UI
- **Gear types**: `amp` (capture only), `full-rig` (amp+cab baked in), `ir` (cab IR), `pedal`
- **Full-rig handling**: if a tone is `full-rig`, ConvolverNode is bypassed (dirac delta)
- **API field names**: `title` (not name), `gear` (not gears), `model_url` (not download_url)
- **Pedals** (Phase 10): NAM pedal captures inserted as extra AudioWorklet nodes
- Files flow from tone3000 → user's browser, never our server — no redistribution
- Publishable key (`t3k_pub_...`) is safe to commit — designed to be public (like Stripe pk_live_)
- Files cached in IndexedDB after first fetch; re-fetched from tone3000 if cache is cleared

### MIDI
- **Web MIDI API** — connects to pedalboards and controllers
- Multiple named MIDI setups (e.g. "Thall", "Rock", "Live")
- Each setup: CC → action mappings (load preset, toggle effect, set param, expression pedal)
- Setups stored in **localStorage** — no auth required; backend sync is future work
- MIDI action handler uses a ref (`dispatchMidiRef`) to avoid stale closures — update the ref
  in a `useEffect` after the `dispatchMidiAction` callback is declared, NOT before

### Storage
- **IndexedDB** (`FileCache`) — binary model/IR file cache (per device)
- **localStorage** (`PresetManager`) — presets (JSON, device-local)
- **localStorage** (`MidiSetupManager`) — MIDI setups (JSON, device-local)
- **Backend** — FastAPI + MongoDB; preset/MIDI sync across devices is future work
  (API endpoints exist, frontend doesn't wire to them yet)

### Backend
- **FastAPI** (Python) — async, typed via Pydantic
- **MongoDB** + **Motor** (async) — schema-free documents for presets, MIDI setups, users
- **Auth**: tone3000 OAuth token verification (call `/api/v1/user`) → upsert user doc
  No passwords, no email — tone3000 IS the login system; token cached 5 min in middleware

### Deployment
- **VPS** (self-hosted)
- **Nginx** — serves frontend build, proxies `/api/*` → FastAPI :8000
- **MongoDB** — local on VPS

---

## Architecture

```
Browser (Chrome)
  ├─ tone3000 OAuth (Standard Flow, PKCE) → access token in localStorage
  ├─ Custom amp/cab/pedal browser → calls tone3000 search API directly
  ├─ NAM model files → fetched from tone3000, cached in IndexedDB
  ├─ Presets → localStorage (PresetManager); export/import JSON
  └─ MIDI setups → localStorage (MidiSetupManager)

VPS
  ├─ Nginx :80/:443
  │    /       → frontend/dist/
  │    /api/*  → FastAPI :8000
  ├─ FastAPI
  │    middleware: verify tone3000 token → get/create user
  │    GET/POST/PUT/DELETE /api/presets
  │    GET/POST/PUT/DELETE /api/midi-setups
  └─ MongoDB :27017 (local)
```

---

## MongoDB collections

```
users         { _id, tone3000_id (unique), created_at }

presets       { _id, user_id, name, position, is_public,
                nam_tone3000_id, nam_gear_type, cab_tone3000_id,
                params: { gain, volume, gate, eq, wah, transpose,
                          whammy, delay, reverb, chorus },
                created_at, updated_at }

midi_setups   { _id, user_id, name, is_active,
                mappings: [{ id, cc, channel, action }],
                created_at, updated_at }
  action shapes:
    { type: "load_preset",  preset_id }
    { type: "toggle",       target: "gate"|"delay"|"reverb"|"chorus"|"wah"|"whammy" }
    { type: "set_param",    target: ParamTarget, min, max }
```

---

## Signal chain (current implementation)

```
Guitar → Audio Interface → getUserMedia

  → monoSum (GainNode, explicit mono downmix)
  → Analyser (AnalyserNode, FFT tap for level meter)
  → Wah (BiquadFilter bandpass Q=10 + dry/wet GainNodes)  ← pre-amp
  → Transpose (whammy-processor AudioWorklet, dry bypass)  ← pre-amp
  → Noise Gate (gate-processor AudioWorklet)
  → Pre-gain (GainNode ×4)
  → NAM Amp (nam-processor AudioWorklet)                   ← WaveNet/LSTM
  → 3-band EQ (BiquadFilter ×3: lowshelf 250Hz / peaking 1kHz / highshelf 4kHz)
  → Cab IR (ConvolverNode — dirac delta passthrough if full-rig)
  → EffectsChain:
      → Whammy (whammy-processor AudioWorklet, post-amp pitch shift + expression)
      → Delay (DelayNode + feedback GainNode, wet/dry)
      → Reverb (ConvolverNode synthetic IR, wet/dry)
      → Chorus (OscillatorNode LFO → DelayNode modulation, wet/dry)
  → Output Gain (GainNode)
  → Destination (speakers)
```

The Whammy worklet runs two instances: one pre-amp (Transpose) and one post-amp (Whammy effect).
Both use the same `whammy-processor.js` (two-tap OLA ring buffer, grain=1024).
When disabled, each passes through a dry GainNode bypass (zero added latency on dry path).

---

## Key technical constraints

### AudioContext must start on user gesture
```ts
// WRONG — will be blocked
useEffect(() => { new AudioContext(); }, []);

// CORRECT — attach to a click/touch event
window.addEventListener('click', () => new AudioContext(), { once: true });
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
When `gearType === 'full-rig'`, ConvolverNode gets a 1-sample dirac delta (passthrough).
Cab IR section is hidden in the UI (`isFullRig` state).

### MIDI stale closure pattern
The MIDI init `useEffect` runs once (`[]` deps) but needs the latest `dispatchMidiAction`.
Use a ref updated in a separate effect declared AFTER `dispatchMidiAction`:
```ts
const dispatchMidiRef = useRef(() => {});           // declared early (before MIDI init effect)
// ... (dispatchMidiAction defined here) ...
useEffect(() => {                                    // declared AFTER dispatchMidiAction
  dispatchMidiRef.current = dispatchMidiAction;
}, [dispatchMidiAction]);
// MIDI init effect uses: mgr.onAction(action => dispatchMidiRef.current(action))
```
Do NOT put `dispatchMidiAction` in the dependency array of the ref-update effect declaration
before `dispatchMidiAction` is declared — that causes a TDZ ReferenceError.

### Wah implementation
Wah = resonant **peaking** BiquadFilter (not bandpass) in parallel with dry bypass.
`peaking` is the correct filter type: it boosts a narrow band while letting the full
signal pass through. `bandpass` with high Q removes everything outside its narrow
passband — this caused the signal to vanish at high sweep positions.
- Center frequency: 300–2200 Hz (CryBaby sweep), **logarithmic** mapping
- Q: ~5 (moderate resonance)
- Gain: +10 dB when enabled, 0 dB when disabled
- Dry/wet: **30% dry / 100% wet blend when on** — the dry bleed preserves sustain
  on the note decay tail and keeps low-string body. Full bypass when off.
- All parameters (freq, Q, gain) use `setTargetAtTime()` for smooth transitions.

### Looper timing must be sample-accurate
Use `AudioContext.currentTime` scheduling, not `setTimeout`.

### Pitch shifter (current)
Plain JS AudioWorklet (two-tap crossfade OLA ring buffer). Phase 9 upgrades to Rust/WASM.
Grain = 1024 samples; read head pre-offset by 2 grains (2048 samples) from write head.
The ring buffer latency only affects the WET path — the dry bypass has zero added latency.

---

## File structure (actual)

```
frontend/
  src/
    components/
      AudioEngine.tsx      ← React orchestrator, state, MIDI dispatch
      SignalChain.tsx       ← Full-width Bias FX-style signal chain UI
      EffectsRack.tsx       ← Gate/EQ/Delay/Reverb/Chorus rack panels
      ToneBrowser.tsx       ← tone3000 custom amp/cab browser
      PresetsModal.tsx      ← Preset list, save/load/export/import (main flow)
      PresetBrowser.tsx     ← LEGACY preset browser (not used by main flow)
      MidiController.tsx    ← MIDI setup manager (create/edit/activate setups)
      SettingsModal.tsx     ← I/O device selection
      TopBar.tsx            ← Transport, preset name, MIDI/settings buttons
      LevelMeter.tsx        ← RMS input level bar
      Modal.tsx             ← Generic modal wrapper
      DeviceSelector.tsx    ← Audio input/output dropdown
      GearIcon.tsx          ← SVG icons for amp/full-rig/ir/pedal gear types
      AmpBrowser.tsx        ← LEGACY (unused)
      AmpHead.tsx           ← LEGACY (unused)
      CabLoader.tsx         ← LEGACY (unused)
      ModelLoader.tsx       ← LEGACY (unused)
      knobs/
        Knob.tsx            ← SVG rotary knob (0–1, vertical drag, double-click reset)
    lib/
      audio/
        AudioEngine.ts      ← AudioContext lifecycle + full signal chain
        NamProcessor.ts     ← .nam parsing + worklet bridge
        EffectsChain.ts     ← Post-cab effects (whammy, delay, reverb, chorus)
        devices.ts          ← enumerateAudioDevices helper
        nam/
          index.ts          ← Weight parser + validator
          types.ts          ← NAM config interfaces
      storage/
        FileCache.ts        ← IndexedDB binary cache (models + IRs)
        PresetManager.ts    ← localStorage preset CRUD
        MidiSetupManager.ts ← localStorage MIDI setup CRUD
      tone3000/
        client.ts           ← OAuth PKCE flow + authenticated API client
        types.ts            ← Tone, Model, User interfaces
      api/
        midiSetups.ts       ← Backend MIDI setup CRUD (not wired to frontend yet)
        presets.ts          ← Does NOT exist yet (backend API exists but no frontend wrapper)
      midi/
        MidiManager.ts      ← Web MIDI API wrapper, CC dispatch, learn mode
    types/
      audio.ts              ← Preset, MidiSetup, MidiMapping, WahParams,
                               TransposeParams, WhammyParams, WhammyMode interfaces
  public/
    worklets/
      nam-processor.js      ← NAM inference (WaveNet + LSTM)
      gate-processor.js     ← Noise gate (threshold, attack, release)
      whammy-processor.js   ← Two-tap OLA pitch shifter (Transpose + Whammy)

backend/
  main.py              ← FastAPI app entry point
  routers/
    auth.py            ← OAuth PKCE URL generation + token exchange
    presets.py         ← GET/POST/PUT/DELETE /api/presets
    midi_setups.py     ← CRUD for setups + embedded mappings
  models/
    preset.py          ← Pydantic schemas
    midi.py
  db/
    connection.py      ← Motor (async MongoDB) client setup
  auth.py              ← tone3000 token verification middleware (5-min cache)
  requirements.txt
```

---

## tone3000 integration policy
- Use the **Standard OAuth Flow** (PKCE, backend-side) — user connects once per device
- Build a **custom browser UI** using their search API — do not use their popup select
- Amplify calls `GET /api/v1/tones/search`, `GET /api/v1/models` from the browser
- Gear types: `amp`, `full-rig`, `ir` now; `pedal` in Phase 10
- Files never stored on our servers — fetched browser-side, cached in IndexedDB
- Publishable key committed to repo (safe — designed to be public)

---

## Adding a new effect to the signal chain

When adding any new audio effect, update **all** of the following:

1. **AudioWorklet** (if DSP is needed)
   - Add `public/worklets/<name>-processor.js`
   - Register processor with `registerProcessor('<name>-processor', ...)`

2. **Audio engine graph**
   - `src/lib/audio/AudioEngine.ts`
     - Declare private node properties
     - Create nodes in `start()`
     - Connect into the signal chain
     - Add public parameter setter (`setXxxParams`)
     - **Disconnect new nodes in `stop()`** — memory leak if missed
     - If the effect has dry/wet mix, use the parallel GainNode pattern

3. **Effect params type**
   - `src/types/audio.ts` — add `XxxParams` interface
   - Add to `Preset` interface
   - Add to MIDI `ParamTarget` union (if MIDI-controllable)

4. **React state + handlers**
   - `src/components/AudioEngine.tsx`
     - Add `useState` for params
     - Add change handler (updates React state + calls engine)
     - Add to `snapshotPreset()`
     - Add to `handleLoadPreset()` (with default fallback for old presets)
     - Add to `dispatchMidiAction()` `set_param` branch
     - Add to `startAudio()` preset restoration

5. **UI**
   - `src/components/SignalChain.tsx` — add to signal chain layout
   - `src/components/EffectsRack.tsx` — add rack panel (if applicable)

6. **Backend schema**
   - `backend/models/preset.py` — add field to `PresetParams`

7. **Preset Manager validation** (optional but recommended)
   - `src/lib/storage/PresetManager.ts` — validate new field on load

---

## Known gotchas / agent traps

### Volume scaling is hidden
`AudioEngine.setOutputGain(value)` multiplies by **0.7** internally:
```ts
this._outputGain.gain.setTargetAtTime(value * 0.7, ...);
```
This means a UI volume of `1.0` → actual gain node value of `0.7`. The mute toggle
must pass the user's `volume` state (e.g. `0.8`), not `1`, when unmuting.

### MIDI `set_param` abuses the `min` field
`MidiManager._dispatchCC` computes the resolved 0–1 value and stores it in `action.min`.
The handler in `AudioEngine.tsx` reads `const v = action.min;` and ignores `action.max`.
This is historical — changing it would break saved MIDI setups in localStorage.

### Backend preset schema nests under `params`
The backend stores effect params nested under `params: { ... }`. The frontend `Preset`
interface is **flat**. When wiring backend sync, a mapping layer is needed.

### Audio graph cleanup is manual
`AudioEngine.stop()` and `EffectsChain.dispose()` must explicitly `.disconnect()`
every node created in `start()`. Nodes stored only as local `const` variables
cannot be disconnected later — store them as instance properties.

### `PresetManager` / `MidiSetupManager` have no validation
Corrupted `localStorage` data can crash the app. `JSON.parse` is unguarded beyond
a try/catch that returns `[]`.

### `setOutputDevice` failure is unrecoverable without cleanup
If `audioContext.setSinkId()` throws, the `AudioContext` and `MediaStream` are
already alive. They must be explicitly closed/stopped before re-throwing.

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

### Phase 4 — Presets + tone3000 ✅ (backend sync pending)
- tone3000 Standard OAuth Flow — connect account, access token per device
- Custom amp/cab browser — search tone3000 catalog (amp, full-rig, ir)
- Full-rig bypass (dirac delta on ConvolverNode)
- Preset CRUD — save/load/delete/export JSON/import JSON (localStorage)
- Auto-restore last active preset on page reload (params + cached files)
- Local file fallback — upload own .nam/.wav for amp/IR (private, IndexedDB)
- Backend API built (FastAPI + MongoDB) — schema now matches frontend
- Frontend uses localStorage for now; backend sync is future work

### Phase 5 — MIDI + Wah/Transpose/Whammy ✅
- Web MIDI API, CC learn mode (Move a knob → mapped)
- Named MIDI setups stored in localStorage; activate to apply mappings
- CC → toggle effect / set param / expression pedal / load preset
- Wah: pre-amp bandpass sweep (Q=10, 300–2200 Hz), MIDI expression or knob
- Transpose: pre-amp integer pitch shift ±24 semitones, dry bypass at 0
- Whammy: post-amp pitch shift, 12 preset modes + custom, expression pedal (heel→toe)
- All new effects are MIDI-controllable targets

### Phase 6 — Tuner + Compressor
- Chromatic tuner: YIN algorithm in AudioWorklet tap
- Compressor: soft-knee dynamics, AudioWorklet-based

### Phase 7 — Looper + Recording
- Recorder: MediaRecorder → WAV export
- Looper: sample-accurate, SharedArrayBuffer, record/play/overdub

### Phase 8 — Graphical Parametric EQ + Spectrum Analyser
- Up to 8-band parametric EQ with draggable Bode plot overlay
- Real-time FFT spectrum analyser rendered behind the EQ curve

### Phase 9 — Pitch Shifter (Rust/WASM) ⏸️ INCOMPLETE
- Replace JS OLA whammy/transpose worklet with Rust phase-vocoder compiled to WASM
- Better pitch quality, optional formant preservation
- Hybrid architecture: Rust owns the DSP algorithm (pure samples-in/samples-out), JS owns the
  AudioWorklet plumbing (WASM loading, buffer copying, AudioParam wiring)
- NAM inference stays in JS for now; only rewrite to Rust if profiling proves JS is the bottleneck
- **Status**: Multiple attempts (WSOLA, pitch-synchronous granular) both sounded robotic.
  Parked for now — the JS OLA implementation from Phase 5 still works and is good enough.
  Revisit only if it becomes a user-facing priority.

### Phase 10 — Full Signal Chain Builder (Bias FX-style)
- Drag-and-drop signal chain builder: multiple amps, cabs, pedals per preset
- NAM pedal captures from tone3000 (`gear=pedal`) as AudioWorkletNodes
- Configurable pre-amp and post-amp pedal slots, freely reorderable
- `preset_pedals` collection in MongoDB stores slot order, tone3000_id, enabled state

---

## Feature checklist

### ✅ Implemented

| Feature | Status | Notes |
|---------|--------|-------|
| Audio input (getUserMedia) | ✅ | Echo cancel / noise suppress / AGC disabled |
| AudioContext on user gesture | ✅ | Starts on first window click |
| Mono downmix | ✅ | Explicit `channelCount=1` GainNode |
| Input level meter | ✅ | AnalyserNode FFT tap |
| Output gain / mute | ✅ | Scales by 0.7 internally |
| Audio I/O device selection | ✅ | `setSinkId` for output (Chrome 110+) |
| NAM .nam parser | ✅ | LSTM + WaveNet weight validation |
| NAM inference (AudioWorklet) | ✅ | WaveNet + LSTM engines |
| Cab IR (ConvolverNode) | ✅ | `.wav` decode; dirac delta bypass for full-rig |
| Noise gate | ✅ | AudioWorklet, separate env/gain coefficients |
| 3-band EQ | ✅ | Lowshelf 250Hz / Peaking 1kHz / Highshelf 4kHz |
| Delay | ✅ | Wet/dry + feedback |
| Reverb | ✅ | Synthetic 1.8s noise IR, wet/dry |
| Chorus | ✅ | LFO-modulated delay, wet/dry |
| tone3000 OAuth (PKCE) | ✅ | Backend generates URL + exchanges code |
| tone3000 amp/cab browser | ✅ | Custom UI, search/filter/sort/pagination |
| Full-rig bypass | ✅ | Dirac delta on convolver, hides cab UI |
| Preset CRUD (localStorage) | ✅ | Save/load/delete/export/import JSON |
| Preset auto-restore | ✅ | On page reload, including cached file reload |
| Local file upload | ✅ | `.nam` / `.wav` for private amp/IR |
| IndexedDB file cache | ✅ | Models + IRs cached per device |
| Backend preset API | ✅ | FastAPI CRUD + MongoDB |
| Backend MIDI setup API | ✅ | FastAPI CRUD + MongoDB |
| Web MIDI API | ✅ | Input enumeration + CC/PC handling |
| MIDI CC learn | ✅ | Listen for next CC, auto-map |
| MIDI named setups | ✅ | Multiple setups, activate one |
| MIDI toggle effects | ✅ | Gate, delay, reverb, chorus, wah, whammy |
| MIDI set param | ✅ | CC → continuous param control |
| MIDI expression pedal | ✅ | Wah sweep, whammy heel→toe |
| MIDI load preset | ✅ | PC message or CC-mapped |
| Wah | ✅ | Peaking filter Q=5, +10dB, 300–2200Hz, 30% dry bleed |
| Transpose | ✅ | Pre-amp pitch shift ±24st, dry bypass at 0 (JS OLA; Phase 9 Rust/WASM attempt parked) |
| Whammy | ✅ | Post-amp pitch shift, 12 modes + custom, expression (JS OLA; Phase 9 Rust/WASM attempt parked) |
| SVG Knob | ✅ | Vertical drag, double-click reset, `size` prop |

### ⏳ Not yet implemented

| Feature | Phase | Notes |
|---------|-------|-------|
| Chromatic tuner | 6 | ✅ YIN algorithm in AudioWorklet |
| Compressor | 6 | ✅ Soft-knee dynamics, AudioWorklet |
| Audio recorder | 7 | MediaRecorder → WAV export |
| Looper | 7 | Sample-accurate, SharedArrayBuffer |
| Parametric EQ (graphical) | 8 | 8-band draggable Bode plot |
| Spectrum analyser | 8 | Real-time FFT behind EQ curve |
| Rust/WASM pitch shifter | 9 | ⏸️ Parked — JS OLA is good enough; revisit if user demand |
| Drag-and-drop signal chain | 10 | Multiple amps/cabs/pedals, reorderable |
| NAM pedal support | 10 | `gear=pedal` from tone3000 |
| `preset_pedals` MongoDB collection | 10 | Slot order, tone3000_id, enabled |
| Backend preset sync (frontend) | — | API exists, no frontend wrapper yet |
| Backend MIDI setup sync (frontend) | — | `midiSetups.ts` exists but not wired to UI |
| Multi-device sync | — | Requires wiring above + conflict resolution |

---

## Developer preferences
- TypeScript for all frontend code, Python (typed with Pydantic) for backend
- CSS modules, no Tailwind
- Full file contents when showing code, not partial snippets
- Commit per feature, no Co-Authored-By
- **Always run the dev server and let the user test before committing**
- **Run `npm run build` before finishing to verify TypeScript compiles clean**

### Build commands
```bash
# Frontend
cd frontend
npm run dev      # Vite dev server
npm run build    # tsc + vite build (verify no TS errors)

# Backend
cd backend
python3 -m uvicorn main:app --reload --port 8000
```
