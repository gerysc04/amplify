# Amplify — Web Guitar Amp Simulator

Browser-based guitar amp simulator. User plugs guitar into audio interface, opens Chrome,
plays through real amp tones powered by NAM (Neural Amp Modeler) AI models — all client-side,
no plugins, no installation, no backend.

---

## Git rules
- Never add `Co-Authored-By: Claude` or any Claude attribution to commits.
- User (Gerysc04) is the sole committer on all git history.

---

## Project structure

```
amplify/
  frontend/     ← Vite + React + TypeScript SPA (100% client-side, no backend)
  CLAUDE.md
  .gitignore
```

---

## Technology stack

### Frontend
- **Vite + React + TypeScript** — fast dev server, static build output, no Node.js in production
- **CSS modules** — no Tailwind
- `"use client"` pattern is irrelevant (no SSR); audio/MIDI components are plain React

### Audio (all client-side)
- **Web Audio API** — browser audio graph
- **AudioWorklet** — real-time DSP in dedicated audio thread (128-sample chunks)
- **NAM inference** — inline JS WaveNet/LSTM inference, no ONNX runtime needed
- **ConvolverNode** — cab IR convolution
- **Rust/WASM** — pitch shifter only (Phase 9)

### MIDI
- **Web MIDI API** — connects to pedalboards and controllers

### Storage
- **localStorage** — preset JSON metadata
- **IndexedDB** — NAM model files, cab IR files (binary blobs)

### Deployment
- **VPS** (self-hosted)
- **Nginx** — serves static frontend build
- No backend, no API, no database

---

## Architecture

Pure client-side SPA. No server component beyond static file serving.

```
Browser (Chrome)
  Vite static bundle — all audio and storage runs here
  localStorage  → preset metadata
  IndexedDB     → model/IR binary files
```

---

## Signal chain (complete, Phases 1–3 implemented)

```
Guitar → Audio Interface → getUserMedia
  → Noise Gate (AudioWorklet)          ← Threshold knob, on/off
  → Pre-gain (GainNode)                ← Gain knob
  → NAM Model (AudioWorklet)           ← .nam file
  → Compressor (AudioWorklet)          ← Threshold/Ratio/Attack/Release (Phase 6)
  → Post-EQ (BiquadFilterNode ×3)      ← Bass/Mid/Treble knobs
  → Cab IR (ConvolverNode)             ← .wav file
  → Delay (DelayNode)                  ← Time/Feedback/Mix, on/off
  → Reverb (ConvolverNode)             ← Mix, on/off
  → Chorus (LFO + DelayNode)           ← Rate/Depth/Mix, on/off
  → Pitch Shifter (Rust/WASM)          ← Semitones (Phase 9)
  → Output
```

Tuner and spectrum analyser run as parallel AnalyserNode taps, not in the main chain.
Looper inserts after the full chain, capturing the processed signal (Phase 7).

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

### NAM knobs are external to the model
The NAM `.nam` model has no parameters. Knobs are audio nodes around it:
```
Pre-gain → NAM model → Compressor → Post-EQ
```

### Looper timing must be sample-accurate
Use AudioContext.currentTime scheduling, not setTimeout.
Loop boundaries must align to exact sample counts to avoid clicks.

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
      EffectsRack.tsx      ← Gate/Delay/Reverb/Chorus UI
      PresetBrowser.tsx    ← Preset list (Phase 5)
      ModelLoader.tsx      ← NAM file picker
      CabLoader.tsx        ← IR file picker
      LevelMeter.tsx       ← RMS input level bar
      SpectrumAnalyser.tsx ← Real-time FFT display (Phase 8)
      ParametricEQ.tsx     ← Graphical EQ with draggable nodes (Phase 8)
      Tuner.tsx            ← Chromatic tuner display (Phase 6)
      Looper.tsx           ← Loop recorder UI (Phase 7)
      Recorder.tsx         ← Record + export WAV UI (Phase 7)
      MidiController.tsx   ← MIDI setup + learn mode (Phase 5)
      knobs/
        Knob.tsx           ← Reusable SVG rotary knob
        Toggle.tsx         ← Stomp switch on/off
    lib/
      audio/
        AudioEngine.ts     ← AudioContext lifecycle + signal chain
        NamProcessor.ts    ← .nam file parsing + worklet bridge
        EffectsChain.ts    ← Post-cab effects nodes
        Compressor.ts      ← Dynamics processor (Phase 6)
        Looper.ts          ← Sample-accurate loop recorder (Phase 7)
        Recorder.ts        ← MediaRecorder WAV export (Phase 7)
        PitchDetector.ts   ← Autocorrelation/YIN tuner (Phase 6)
        nam/
          index.ts         ← Weight parser + validator
          types.ts         ← NAM config interfaces
      storage/
        PresetManager.ts   ← localStorage preset CRUD (Phase 5)
        FileCache.ts       ← IndexedDB for .nam/.wav (Phase 5)
      midi/
        MidiManager.ts     ← Web MIDI API wrapper (Phase 5)
    types/
      audio.ts             ← Shared TypeScript interfaces
  public/
    worklets/
      nam-processor.js     ← NAM inference (WaveNet + LSTM)
      gate-processor.js    ← Noise gate
      compressor-processor.js ← Dynamics (Phase 6)
      pitch-processor.js   ← Feeds pitch detector (Phase 6)
      looper-processor.js  ← Sample-accurate looper (Phase 7)
      pitch-shifter.js     ← Rust/WASM wrapper (Phase 9)
    wasm/
      pitch_shifter.wasm   ← Compiled Rust (Phase 9)
    models/                ← Bundled default NAM models (CC0/BY) — Git LFS
    irs/                   ← Bundled default cab IRs
```

---

## Preset data shape

```ts
interface Preset {
  id: string;
  name: string;
  namModel: { filename: string; source: 'bundled' | 'uploaded' | 'indexeddb'; available: boolean };
  cabIR:    { filename: string; source: 'bundled' | 'uploaded' };
  amp:      { gain: number };
  gate:     { enabled: boolean; threshold: number; attack: number; release: number };
  eq:       { bass: number; mid: number; treble: number };
  compressor: { enabled: boolean; threshold: number; ratio: number; attack: number; release: number; makeupGain: number };
  delay:    { enabled: boolean; time: number; feedback: number; mix: number };
  reverb:   { enabled: boolean; mix: number };
  chorus:   { enabled: boolean; rate: number; depth: number; mix: number };
  pitchShift: { enabled: boolean; semitones: number };
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

## Default presets (Phase 5)
Ship with these using bundled models:
- **Clean** — Fender-style, low gain, chorus on
- **Crunch** — Marshall-style, mid gain
- **Lead** — Friedman/Mesa, high gain, delay on
- **Metal** — tight high gain, gate on, scooped mids, compressor on
- **Ambient** — clean, heavy reverb, long delay, chorus on

---

## Development phases

### Phase 1 — Audio Foundation ✅
- getUserMedia with correct constraints
- AudioContext on user gesture (Start button)
- WaveShaperNode distortion placeholder
- Pre-gain GainNode (Gain knob)
- Input level meter (RMS via AnalyserNode)
- SVG rotary Knob component
- Device selection (input/output)

### Phase 2 — NAM Integration ✅
- Native .nam file parsing (JSON + flat weight array)
- Inline WaveNet + LSTM inference in AudioWorklet (no ONNX)
- Sample-accurate inference, no ring buffer
- ConvolverNode for cab IR (.wav loader)
- Model survives stop/start cycle

### Phase 3 — Effects Chain ✅
- Noise gate AudioWorklet (RMS envelope follower), enabled by default
- 3-band EQ (lowshelf / peaking / highshelf BiquadFilterNodes)
- Delay with feedback loop
- Reverb (synthetic exponential IR)
- Chorus (LFO-modulated short delay)
- All effects: wet/dry mix + on/off bypass

### Phase 4 — UI & Presets
- Preset save/load/export/import (localStorage metadata + IndexedDB files)
- Default bundled presets (5 starting points)
- Model + IR library panel (list cached files, delete, re-upload)
- "Get more amps →" link to tone3000.com

### Phase 5 — MIDI
- Web MIDI API (requestMIDIAccess)
- MIDI learn mode: click any knob → move controller → mapped
- CC → any parameter (bidirectional: knob moves controller LED too if supported)
- PC messages → preset switch
- Expression pedal → assignable (default: volume)

### Phase 6 — Tuner + Compressor
- **Chromatic tuner**: YIN pitch detection algorithm in an AudioWorklet tap;
  display shows note name, cents deviation, in-tune indicator
- **Compressor**: AudioWorklet-based soft-knee dynamics processor;
  knobs: Threshold / Ratio / Attack / Release / Makeup Gain;
  inserts after NAM, before EQ

### Phase 7 — Looper + Recording
- **Recorder**: MediaRecorder API captures the final output; export as WAV;
  simple UI: record / stop / download
- **Looper**: sample-accurate loop recorder using AudioWorklet + SharedArrayBuffer;
  record → play → overdub layers; loop length set on first record pass;
  click track optional

### Phase 8 — Graphical Parametric EQ + Spectrum Analyser
- Replace 3-band EQ with full parametric EQ (up to 8 bands);
  each band: frequency / gain / Q / type (peak/shelf/notch/HPF/LPF)
- SVG/Canvas overlay showing real-time frequency response curve (Bode plot);
  bands are draggable nodes on the curve
- Spectrum analyser: real-time FFT display (AnalyserNode tap) rendered behind the EQ curve

### Phase 9 — Pitch Shifter (Rust/WASM)
- Rust implementation of a high-quality pitch shifting algorithm (e.g. RubberBand or custom PSOLA)
- Compiled to WASM, loaded inside an AudioWorklet
- Knob: semitones (−12 to +12), optionally formant preservation toggle
- Only component in the project that uses Rust

---

## Developer preferences
- TypeScript for all frontend code
- CSS modules, no Tailwind
- Full file contents when showing code, not partial snippets
- Commit per feature, no Co-Authored-By
- **Always run the dev server and let the user test before committing** — never commit untested code
