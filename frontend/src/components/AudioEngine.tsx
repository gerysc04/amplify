import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioEngine as AudioEngineCore,
  type GateParams, type EqParams,
  type DelayParams, type ReverbParams, type ChorusParams,
  type WahParams, type TransposeParams, type WhammyParams,
  type CompressorParams,
} from '../lib/audio/AudioEngine';
import { enumerateAudioDevices } from '../lib/audio/devices';
import { fileCache } from '../lib/storage/FileCache';
import { presetManager } from '../lib/storage/PresetManager';
import { isAuthenticated } from '../lib/tone3000/client';
import type { Tone } from '../lib/tone3000/types';
import { MidiManager } from '../lib/midi/MidiManager';
import { midiSetupManager } from '../lib/storage/MidiSetupManager';
import type { MidiAction, MidiSetup, Preset, ToneRef } from '../types/audio';
import TopBar from './TopBar';
import SignalChain from './SignalChain';
import Looper from './Looper';
import Tuner from './Tuner';
import ToneBrowser, { type BrowseTarget } from './ToneBrowser';
import PresetsModal from './PresetsModal';
import SettingsModal from './SettingsModal';
import MidiController from './MidiController';
import styles from './AudioEngine.module.css';

const EMPTY_REF: ToneRef = { filename: '', available: false };

export default function AudioEngine() {
  // Audio state
  const [audioReady, setAudioReady] = useState(false);
  const [muted,      setMuted]      = useState(false);
  const [analyser,   setAnalyser]   = useState<AnalyserNode | null>(null);
  const [error,      setError]      = useState<string | null>(null);
  const [gain,       setGain]       = useState(0.5);
  const [volume,     setVolume]     = useState(0.8);

  // Devices
  const [inputs,   setInputs]   = useState<MediaDeviceInfo[]>([]);
  const [outputs,  setOutputs]  = useState<MediaDeviceInfo[]>([]);
  const [inputId,  setInputId]  = useState(() => localStorage.getItem('amplify-input-device')  ?? '');
  const [outputId, setOutputId] = useState(() => localStorage.getItem('amplify-output-device') ?? '');

  // Effects
  const [gate,    setGate]    = useState<GateParams>   ({ enabled: true,  threshold: 0.02, attack: 0.003, release: 0.15 });
  const [eq,      setEq]      = useState<EqParams>      ({ bass: 0, mid: 0, treble: 0 });
  const [wah,       setWah]       = useState<WahParams>       ({ enabled: false, frequency: 0.3, q: 10 });
  const [transpose, setTranspose] = useState<TransposeParams> ({ semitones: 0 });
  const [whammy,    setWhammy]    = useState<WhammyParams>    ({ enabled: false, mode: '+1oct', semitones: 12, expression: 0, mix: 1 });
  const [compressor, setCompressor] = useState<CompressorParams>({ enabled: false, threshold: -20, ratio: 4, attack: 0.003, release: 0.15, knee: 3 });
  const [delay,   setDelay]   = useState<DelayParams>   ({ enabled: false, time: 0.3, feedback: 0.35, mix: 0.3 });
  const [reverb,  setReverb]  = useState<ReverbParams>  ({ enabled: false, mix: 0.25 });
  const [chorus,  setChorus]  = useState<ChorusParams>  ({ enabled: false, rate: 1.5, depth: 0.005, mix: 0.3 });

  // Tuner
  const [tunerEnabled, setTunerEnabled] = useState(false);
  const [tunerVisible, setTunerVisible] = useState(false);
  const tunerNodeRef = useRef<AudioWorkletNode | null>(null);

  // Phase 7 — Recorder + Looper
  const [recording, setRecording] = useState(false);
  const [looperPort, setLooperPort] = useState<MessagePort | null>(null);

  // Loaded tones
  const [namModel,   setNamModel]   = useState<ToneRef>(EMPTY_REF);
  const [cabIR,      setCabIR]      = useState<ToneRef>(EMPTY_REF);
  const [isFullRig,  setIsFullRig]  = useState(false);

  // Presets
  const [presets,      setPresets]      = useState<Preset[]>([]);
  const [activePreset, setActivePreset] = useState<Preset | null>(null);
  const [cachedModels, setCachedModels] = useState<string[]>([]);
  const [cachedIrs,    setCachedIrs]    = useState<string[]>([]);

  // MIDI
  const [midiReady,   setMidiReady]   = useState(false);
  const [midiSetups,  setMidiSetups]  = useState<MidiSetup[]>([]);
  const midiRef = useRef<MidiManager | null>(null);

  // Modal state
  const [browseTarget,  setBrowseTarget]  = useState<BrowseTarget>('amp');
  const [showBrowse,    setShowBrowse]    = useState(false);
  const [showPresets,   setShowPresets]   = useState(false);
  const [showSettings,  setShowSettings]  = useState(false);
  const [showMidi,      setShowMidi]      = useState(false);
  const [showSaveAs,    setShowSaveAs]    = useState(false);
  const [saveAsName,    setSaveAsName]    = useState('');

  const engineRef = useRef<AudioEngineCore | null>(null);

  const getEngine = useCallback((): AudioEngineCore => {
    if (!engineRef.current) engineRef.current = new AudioEngineCore();
    return engineRef.current;
  }, []);

  const refreshCachedFiles = useCallback(async () => {
    const keys = await fileCache.listKeys();
    setCachedModels(keys.filter((k) => k.endsWith('.nam')));
    setCachedIrs(keys.filter((k) => k.endsWith('.wav')));
  }, []);

  useEffect(() => {
    getEngine();
    enumerateAudioDevices().then(({ inputs, outputs }) => { setInputs(inputs); setOutputs(outputs); });
    const all = presetManager.list();
    setPresets(all);
    refreshCachedFiles();

    // Restore last active preset (params only — files load after audio starts)
    const lastId = localStorage.getItem('amplify-last-preset-id');
    if (lastId) {
      const last = all.find((p) => p.id === lastId);
      if (last) {
        const wh: WhammyParams = Object.assign({ enabled: false, mode: '+1oct' as const, semitones: 12, expression: 0, mix: 1 }, last.whammy ?? {});
        setGain(last.gain ?? 0.5);
        setVolume(last.volume ?? 0.8);
        setGate(last.gate);
        setEq(last.eq);
        setTranspose(last.transpose ?? { semitones: 0 });
        setWah(last.wah ?? { enabled: false, frequency: 0.3, q: 5 });
        setWhammy(wh);
        setCompressor(last.compressor ?? { enabled: false, threshold: -20, ratio: 4, attack: 0.003, release: 0.15, knee: 3 });
        setDelay(last.delay);
        setReverb(last.reverb);
        setChorus(last.chorus);
        setTunerEnabled(last.tunerEnabled ?? false);
        setNamModel(last.namModel);
        setCabIR(last.cabIR);
        setIsFullRig(last.namModel.gearType === 'full-rig');
        setActivePreset(last);
        // Don't persist to localStorage again — just restoring
      }
    }

    return () => { engineRef.current?.stop(); engineRef.current?.nam.dispose(); };
  }, [getEngine, refreshCachedFiles]);

  // Listen for OAuth callback completing
  useEffect(() => {
    const handler = () => setShowBrowse(true);
    window.addEventListener('tone3000-authed', handler);
    return () => window.removeEventListener('tone3000-authed', handler);
  }, []);

  const dispatchMidiRef = useRef<(action: MidiAction) => void>(() => {});

  // MIDI init
  useEffect(() => {
    const setups = midiSetupManager.list();
    setMidiSetups(setups);

    const mgr = new MidiManager();
    midiRef.current = mgr;
    const active = setups.find((s) => s.is_active);
    if (active) mgr.setMappings(active.mappings);

    mgr.init().then((ok) => setMidiReady(ok));
    mgr.onAction((action) => dispatchMidiRef.current(action));
    return () => mgr.dispose();
  }, []); // eslint-disable-line

  // ---------------------------------------------------------------------------
  // Audio — auto-starts on first user gesture, mute toggles output gain
  // ---------------------------------------------------------------------------

  const startAudio = useCallback(async () => {
    if (audioReady) return;
    setError(null);
    try {
      const engine = getEngine();
      await engine.start({ inputDeviceId: inputId || undefined, outputDeviceId: outputId || undefined });
      setAnalyser(engine.getAnalyser());
      tunerNodeRef.current = engine.getTunerNode();
      setLooperPort(engine.getLooperPort());
      setAudioReady(true);
      const { inputs, outputs } = await enumerateAudioDevices();
      setInputs(inputs); setOutputs(outputs);

      // Now audio is ready — load files for the restored preset
      const lastId = localStorage.getItem('amplify-last-preset-id');
      if (lastId) {
        const preset = presetManager.list().find((p) => p.id === lastId);
        if (preset) {
          // Apply audio engine params now that context exists
          engine.setGain(preset.gain ?? 0.5);
          engine.setOutputGain(preset.volume ?? 0.8);
          engine.setGateParams(preset.gate);
          engine.setEqParams(preset.eq);
          engine.setCompressorParams(preset.compressor ?? { enabled: false, threshold: -20, ratio: 4, attack: 0.003, release: 0.15, knee: 3 });
          engine.setTunerEnabled(preset.tunerEnabled ?? false);
          // Load cached files silently
          const loadRef = async (ref: typeof preset.namModel, apply: (f: File, m: typeof ref) => Promise<void>) => {
            if (!ref.filename) return;
            const cached = await fileCache.load(ref.filename);
            if (cached) await apply(cached, ref).catch(() => {});
          };
          await loadRef(preset.namModel, applyModelFile);
          if (preset.namModel.gearType !== 'full-rig') await loadRef(preset.cabIR, applyIrFile);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      const notFound = err instanceof DOMException && err.name === 'NotFoundError';

      if (notFound && (inputId || outputId)) {
        // Stale device ID — clear saved IDs and retry with fresh engine + defaults
        if (inputId) { setInputId(''); localStorage.removeItem('amplify-input-device'); }
        if (outputId) { setOutputId(''); localStorage.removeItem('amplify-output-device'); }
        try {
          engineRef.current = new AudioEngineCore();
          const fresh = engineRef.current;
          await fresh.start({});
          setAnalyser(fresh.getAnalyser());
          tunerNodeRef.current = fresh.getTunerNode();
          setAudioReady(true);
          const { inputs, outputs } = await enumerateAudioDevices();
          setInputs(inputs); setOutputs(outputs);
        } catch (retryErr) {
          setError(`Could not start audio: ${retryErr instanceof Error ? retryErr.message : 'Unknown error'}`);
        }
      } else {
        setError(`Could not start audio: ${msg}`);
      }
    }
  }, [audioReady, getEngine, inputId, outputId]);

  // Start on first click anywhere
  useEffect(() => {
    const handler = () => { startAudio(); };
    window.addEventListener('click', handler, { once: true });
    return () => window.removeEventListener('click', handler);
  }, [startAudio]);

  const handleToggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    engineRef.current?.setOutputGain(next ? 0 : volume);
  }, [muted, volume]);

  // ---------------------------------------------------------------------------
  // Parameter handlers
  // ---------------------------------------------------------------------------

  const handleGainChange   = useCallback((v: number)      => { setGain(v);   engineRef.current?.setGain(v); }, []);
  const handleVolumeChange = useCallback((v: number)      => { setVolume(v); engineRef.current?.setOutputGain(v); }, []);
  const handleWahChange       = useCallback((p: WahParams)       => { setWah(p);       engineRef.current?.setWahParams(p); }, []);
  const handleTransposeChange = useCallback((p: TransposeParams) => { setTranspose(p); engineRef.current?.setTransposeParams(p); }, []);
  const handleWhammyChange    = useCallback((p: WhammyParams)    => { setWhammy(p);    engineRef.current?.setWhammyParams(p); }, []);
  const handleGateChange  = useCallback((p: GateParams)  => { setGate(p);   engineRef.current?.setGateParams(p); }, []);
  const handleEqChange    = useCallback((p: EqParams)    => { setEq(p);     engineRef.current?.setEqParams(p); }, []);
  const handleCompressorChange = useCallback((p: CompressorParams) => { setCompressor(p); engineRef.current?.setCompressorParams(p); }, []);
  const handleDelayChange = useCallback((p: DelayParams) => { setDelay(p);  engineRef.current?.setDelayParams(p); }, []);
  const handleReverbChange= useCallback((p: ReverbParams)=> { setReverb(p); engineRef.current?.setReverbParams(p); }, []);
  const handleChorusChange= useCallback((p: ChorusParams)=> { setChorus(p); engineRef.current?.setChorusParams(p); }, []);

  const handleToggleTuner = useCallback(() => {
    setTunerVisible((v) => !v);
    setTunerEnabled((prev) => {
      const next = !prev;
      engineRef.current?.setTunerEnabled(next);
      return next;
    });
  }, []);

  // Phase 7 — Recorder
  const handleToggleRecord = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (recording) {
      const blob = engine.stopRecording();
      setRecording(false);
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement('a'), { href: url, download: `amplify-recording-${Date.now()}.wav` });
        a.click();
        URL.revokeObjectURL(url);
      }
    } else {
      const started = engine.startRecording();
      if (started) setRecording(true);
    }
  }, [recording]);

  // Phase 7 — Looper
  const handleLoopRecord     = useCallback(() => { engineRef.current?.startLoopRecord(); }, []);
  const handleLoopStopRecord = useCallback(() => { engineRef.current?.stopLoopRecord(); }, []);
  const handleLoopPlay       = useCallback(() => { engineRef.current?.playLoop(); }, []);
  const handleLoopOverdub    = useCallback(() => { engineRef.current?.overdubLoop(); }, []);
  const handleLoopStop       = useCallback(() => { engineRef.current?.stopLoop(); }, []);
  const handleLoopClear      = useCallback(() => { engineRef.current?.clearLoop(); }, []);

  // Latency test
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const handleTestLatency = useCallback(async () => {
    setLatencyMs(null);
    const ms = await engineRef.current?.measureLatency();
    if (ms !== undefined && ms >= 0) setLatencyMs(ms);
    else setLatencyMs(-1);
  }, []);



  const handleInputChange = useCallback((id: string) => {
    setInputId(id); localStorage.setItem('amplify-input-device', id);
  }, []);
  const handleOutputChange = useCallback((id: string) => {
    setOutputId(id); localStorage.setItem('amplify-output-device', id);
    engineRef.current?.setOutputDevice(id);
  }, []);

  // ---------------------------------------------------------------------------
  // File loading
  // ---------------------------------------------------------------------------

  const applyModelFile = useCallback(async (file: File, meta?: Partial<ToneRef>) => {
    try {
      await fileCache.store(file);
      await getEngine().loadNamModel(file);
      setNamModel({ filename: file.name, available: true, ...meta });
      await refreshCachedFiles();
    } catch (err) {
      setError(`Failed to load model: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [getEngine, refreshCachedFiles]);

  const applyIrFile = useCallback(async (file: File, meta?: Partial<ToneRef>) => {
    try {
      await fileCache.store(file);
      await getEngine().loadCabIR(file);
      setCabIR({ filename: file.name, available: true, ...meta });
      setIsFullRig(false);
      await refreshCachedFiles();
    } catch (err) {
      setError(`Failed to load IR: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [getEngine, refreshCachedFiles]);

  // Called from ToneBrowser when user picks a tone
  const handleToneLoaded = useCallback(async (tone: Tone, file: File) => {
    const meta: Partial<ToneRef> = {
      toneId:   tone.id,
      title:    tone.title,
      imageUrl: tone.images?.[0],
      gearType: tone.gear,
    };
    if (tone.gear === 'ir') {
      await applyIrFile(file, meta);
    } else {
      await applyModelFile(file, meta);
      if (tone.gear === 'full-rig') {
        engineRef.current?.bypassCabIr();
        setCabIR(EMPTY_REF);
        setIsFullRig(true);
      } else {
        setIsFullRig(false);
      }
    }
  }, [applyModelFile, applyIrFile]);

  const handleOpenBrowse = useCallback((target: BrowseTarget) => {
    if (!isAuthenticated()) {
      setError('Please connect your tone3000 account to browse tones (Settings → tone3000 login)');
      return;
    }
    setBrowseTarget(target);
    setShowBrowse(true);
  }, []);

  // ---------------------------------------------------------------------------
  // Preset handlers
  // ---------------------------------------------------------------------------

  const snapshotPreset = useCallback((name: string, id?: string): Preset => ({
    id:        id ?? crypto.randomUUID(),
    name,
    createdAt: Date.now(),
    namModel,
    cabIR,
    gain, volume, gate, eq, transpose, wah, whammy, compressor, delay, reverb, chorus,
    tunerEnabled,
  }), [namModel, cabIR, gain, volume, gate, eq, transpose, wah, whammy, compressor, delay, reverb, chorus, tunerEnabled]);

  const activatePreset = useCallback((preset: Preset) => {
    setActivePreset(preset);
    localStorage.setItem('amplify-last-preset-id', preset.id);
  }, []);

  const handleSavePreset = useCallback((name: string) => {
    const preset = snapshotPreset(name);
    presetManager.add(preset);
    setPresets(presetManager.list());
    activatePreset(preset);
  }, [snapshotPreset, activatePreset]);

  const handleUpdatePreset = useCallback(() => {
    if (!activePreset) return;
    const updated = snapshotPreset(activePreset.name, activePreset.id);
    presetManager.update(activePreset.id, updated);
    activatePreset(updated);
    setPresets(presetManager.list());
  }, [activePreset, snapshotPreset, activatePreset]);

  const handleLoadPreset = useCallback(async (preset: Preset) => {
    // Merge with defaults — old presets may be missing newer fields
    const g   = preset.gain   ?? 0.5;
    const vol = preset.volume ?? 0.8;
    const tr  = preset.transpose ?? { semitones: 0 };
    const w   = preset.wah    ?? { enabled: false, frequency: 0.3, q: 5 };
    const wh: WhammyParams = Object.assign({ enabled: false, mode: '+1oct' as const, semitones: 12, expression: 0, mix: 1 }, preset.whammy ?? {});

    setGain(g);       engineRef.current?.setGain(g);
    setVolume(vol);   engineRef.current?.setOutputGain(vol);
    setGate(preset.gate);   engineRef.current?.setGateParams(preset.gate);
    setEq(preset.eq);       engineRef.current?.setEqParams(preset.eq);
    setTranspose(tr);       engineRef.current?.setTransposeParams(tr);
    setWah(w);              engineRef.current?.setWahParams(w);
    setWhammy(wh);          engineRef.current?.setWhammyParams(wh);
    const comp = preset.compressor ?? { enabled: false, threshold: -20, ratio: 4, attack: 0.003, release: 0.15, knee: 3 };
    setCompressor(comp);      engineRef.current?.setCompressorParams(comp);
    setDelay(preset.delay);   engineRef.current?.setDelayParams(preset.delay);
    setReverb(preset.reverb); engineRef.current?.setReverbParams(preset.reverb);
    setChorus(preset.chorus); engineRef.current?.setChorusParams(preset.chorus);
    const tunerOn = preset.tunerEnabled ?? false;
    setTunerEnabled(tunerOn); engineRef.current?.setTunerEnabled(tunerOn);
    setNamModel(preset.namModel);
    setCabIR(preset.cabIR);
    setIsFullRig(preset.namModel.gearType === 'full-rig');
    activatePreset(preset);
    setShowPresets(false);

    const loadRef = async (ref: typeof preset.namModel, apply: (f: File, m: typeof ref) => Promise<void>) => {
      if (!ref.filename) return;
      // 1. Try IndexedDB cache
      const cached = await fileCache.load(ref.filename);
      if (cached) { await apply(cached, ref); return; }
      // 2. Re-fetch from tone3000 if we have the toneId
      if (ref.toneId && isAuthenticated()) {
        try {
          const { downloadToneFile } = await import('../lib/tone3000/client');
          const ext  = ref.gearType === 'ir' ? '.wav' : '.nam';
          const file = await downloadToneFile(ref.toneId, ref.filename || `tone_${ref.toneId}${ext}`);
          await apply(file, ref);
        } catch {
          setError(`Could not re-fetch "${ref.title ?? ref.filename}" — open Browse tones to reload it.`);
        }
      } else {
        setError(`"${ref.title ?? ref.filename}" not in cache — load it from Browse tones to use this preset.`);
      }
    };

    await loadRef(preset.namModel, applyModelFile);
    if (preset.namModel.gearType !== 'full-rig') {
      await loadRef(preset.cabIR, applyIrFile);
    }
  }, [applyModelFile, applyIrFile]);

  const handleDeletePreset = useCallback((id: string) => {
    presetManager.remove(id);
    setPresets(presetManager.list());
    setActivePreset((prev) => (prev?.id === id ? null : prev));
  }, []);

  const handleExportPreset = useCallback((preset: Preset) => {
    const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: `${preset.name.replace(/[^a-z0-9]/gi, '_')}.json` });
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleImportPreset = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const preset = JSON.parse(e.target?.result as string) as Preset;
        if (!preset.name) throw new Error('missing name');
        preset.id = crypto.randomUUID();
        presetManager.add(preset);
        setPresets(presetManager.list());
      } catch { setError('Failed to import preset: invalid file'); }
    };
    reader.readAsText(file);
  }, []);

  const handleDeleteCached = useCallback(async (filename: string) => {
    await fileCache.remove(filename);
    await refreshCachedFiles();
  }, [refreshCachedFiles]);

  // ---------------------------------------------------------------------------
  // MIDI action dispatch
  // ---------------------------------------------------------------------------

  const dispatchMidiAction = useCallback((action: MidiAction) => {
    switch (action.type) {
      case 'toggle':
        if (action.target === 'gate')       setGate((p)       => { const n = { ...p, enabled: !p.enabled }; engineRef.current?.setGateParams(n);       return n; });
        if (action.target === 'compressor') setCompressor((p) => { const n = { ...p, enabled: !p.enabled }; engineRef.current?.setCompressorParams(n); return n; });
        if (action.target === 'delay')  setDelay((p)  => { const n = { ...p, enabled: !p.enabled }; engineRef.current?.setDelayParams(n);   return n; });
        if (action.target === 'reverb') setReverb((p) => { const n = { ...p, enabled: !p.enabled }; engineRef.current?.setReverbParams(n);  return n; });
        if (action.target === 'chorus') setChorus((p) => { const n = { ...p, enabled: !p.enabled }; engineRef.current?.setChorusParams(n);  return n; });
        if (action.target === 'wah')    setWah((p)    => { const n = { ...p, enabled: !p.enabled }; engineRef.current?.setWahParams(n);     return n; });
        if (action.target === 'whammy') setWhammy((p) => { const n = { ...p, enabled: !p.enabled }; engineRef.current?.setWhammyParams(n);  return n; });
        break;
      case 'set_param': {
        const v = action.min; // MidiManager resolves [min,max] to a single 0-1 value stored in min
        if (action.target === 'gain')            handleGainChange(v);
        if (action.target === 'volume')          handleVolumeChange(v);
        if (action.target === 'wah.frequency')    setWah((p)      => { const n = { ...p, frequency: v, enabled: true };                engineRef.current?.setWahParams(n);       return n; });
        if (action.target === 'whammy.expression') setWhammy((p)  => { const n = { ...p, expression: v, enabled: p.enabled }; engineRef.current?.setWhammyParams(n); return n; });
        if (action.target === 'whammy.semitones')  setWhammy((p)  => { const n = { ...p, semitones: v * 48 - 24 };             engineRef.current?.setWhammyParams(n); return n; });
        if (action.target === 'transpose.semitones') { const n = { semitones: Math.round(v * 48 - 24) }; setTranspose(n); engineRef.current?.setTransposeParams(n); }
        if (action.target === 'eq.bass')         setEq((p) => { const n = { ...p, bass:   v * 24 - 12 }; engineRef.current?.setEqParams(n);    return n; });
        if (action.target === 'eq.mid')          setEq((p) => { const n = { ...p, mid:    v * 24 - 12 }; engineRef.current?.setEqParams(n);    return n; });
        if (action.target === 'eq.treble')       setEq((p) => { const n = { ...p, treble: v * 24 - 12 }; engineRef.current?.setEqParams(n);    return n; });
        if (action.target === 'reverb.mix')      setReverb((p) => { const n = { ...p, mix: v };          engineRef.current?.setReverbParams(n); return n; });
        if (action.target === 'delay.mix')       setDelay((p)  => { const n = { ...p, mix: v };          engineRef.current?.setDelayParams(n);  return n; });
        if (action.target === 'delay.time')      setDelay((p)  => { const n = { ...p, time: 0.05 + v * 0.55 }; engineRef.current?.setDelayParams(n); return n; });
        if (action.target === 'delay.feedback')  setDelay((p)  => { const n = { ...p, feedback: v * 0.85 };    engineRef.current?.setDelayParams(n); return n; });
        if (action.target === 'chorus.rate')     setChorus((p) => { const n = { ...p, rate: 0.1 + v * 3.9 };  engineRef.current?.setChorusParams(n); return n; });
        if (action.target === 'chorus.depth')    setChorus((p) => { const n = { ...p, depth: 0.001 + v * 0.014 }; engineRef.current?.setChorusParams(n); return n; });
        if (action.target === 'chorus.mix')      setChorus((p) => { const n = { ...p, mix: v };          engineRef.current?.setChorusParams(n); return n; });
        if (action.target === 'gate.threshold')  setGate((p)   => { const n = { ...p, threshold: 0.001 + v * 0.099 }; engineRef.current?.setGateParams(n); return n; });
        if (action.target === 'compressor.threshold') setCompressor((p) => { const n = { ...p, threshold: -40 + v * 40 }; engineRef.current?.setCompressorParams(n); return n; });
        if (action.target === 'compressor.ratio')     setCompressor((p) => { const n = { ...p, ratio: 1 + v * 19 };    engineRef.current?.setCompressorParams(n); return n; });
        if (action.target === 'compressor.attack')    setCompressor((p) => { const n = { ...p, attack: 0.001 + v * 0.099 }; engineRef.current?.setCompressorParams(n); return n; });
        if (action.target === 'compressor.release')   setCompressor((p) => { const n = { ...p, release: 0.01 + v * 0.99 }; engineRef.current?.setCompressorParams(n); return n; });
        if (action.target === 'compressor.knee')      setCompressor((p) => { const n = { ...p, knee: v * 12 };           engineRef.current?.setCompressorParams(n); return n; });
        break;
      }
      case 'load_preset': {
        const p = presets.find((pr) => pr.id === action.preset_id);
        if (p) handleLoadPreset(p);
        break;
      }
    }
  }, [handleGainChange, handleVolumeChange, handleLoadPreset, presets]);

  // Keep MIDI handler ref in sync so the MidiManager always calls the latest version
  useEffect(() => { dispatchMidiRef.current = dispatchMidiAction; }, [dispatchMidiAction]);

  // MIDI setup management
  const handleSaveMidiSetup = useCallback((setup: MidiSetup) => {
    midiSetupManager.save(setup);
    setMidiSetups((prev) => prev.map((s) => s.id === setup.id ? setup : s));
    if (setup.is_active) midiRef.current?.setMappings(setup.mappings);
  }, []);

  const handleDeleteMidiSetup = useCallback((id: string) => {
    midiSetupManager.remove(id);
    setMidiSetups((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleActivateMidiSetup = useCallback((id: string) => {
    const updated = midiSetupManager.activate(id);
    setMidiSetups(updated);
    const active = updated.find((s) => s.is_active);
    if (active) midiRef.current?.setMappings(active.mappings);
  }, []);

  const handleCreateMidiSetup = useCallback((name: string) => {
    const created = midiSetupManager.create(name);
    setMidiSetups((prev) => [...prev, created]);
  }, []);

  // Save-as flow
  const openSaveAs = useCallback(() => {
    setSaveAsName(activePreset?.name ?? '');
    setShowSaveAs(true);
  }, [activePreset]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className={styles.root}>
      <TopBar
        muted={muted}
        audioReady={audioReady}
        activePreset={activePreset}
        analyser={analyser}
        onToggleMute={handleToggleMute}
        onOpenPresets={() => setShowPresets(true)}
        onOpenBrowse={() => handleOpenBrowse('amp')}
        onOpenSettings={() => setShowSettings(true)}
        onOpenMidi={() => setShowMidi(true)}
        midiReady={midiReady}
        onSavePreset={openSaveAs}
        onUpdatePreset={handleUpdatePreset}
        tunerVisible={tunerVisible}
        onToggleTuner={handleToggleTuner}
        recording={recording}
        onToggleRecord={handleToggleRecord}
      />

      {tunerVisible && (
        <Tuner
          tunerNode={tunerNodeRef.current}
          visible={tunerVisible}
        />
      )}

      <SignalChain
        namModel={namModel}
        cabIR={cabIR}
        isFullRig={isFullRig}
        gain={gain}     volume={volume}
        gate={gate}     eq={eq}
        wah={wah}       transpose={transpose}  whammy={whammy}
        compressor={compressor}
        delay={delay}   reverb={reverb} chorus={chorus}
        onGainChange={handleGainChange}
        onVolumeChange={handleVolumeChange}
        onGate={handleGateChange}     onEq={handleEqChange}
        onWah={handleWahChange}       onTranspose={handleTransposeChange}  onWhammy={handleWhammyChange}
        onCompressor={handleCompressorChange}
        onDelay={handleDelayChange}   onReverb={handleReverbChange}
        onChorus={handleChorusChange}
        onClickAmp={() => handleOpenBrowse('amp')}
        onClickCab={() => handleOpenBrowse('ir')}
      />

      <Looper
        port={looperPort}
        onRecord={handleLoopRecord}
        onStopRecord={handleLoopStopRecord}
        onPlay={handleLoopPlay}
        onOverdub={handleLoopOverdub}
        onStop={handleLoopStop}
        onClear={handleLoopClear}
      />

      {error && <p className={styles.error}>{error}</p>}

      {/* Modals */}
      {showBrowse && (
        <ToneBrowser
          target={browseTarget}
          onLoad={handleToneLoaded}
          onClose={() => setShowBrowse(false)}
        />
      )}

      {showPresets && (
        <PresetsModal
          presets={presets}
          activePreset={activePreset}
          onLoad={handleLoadPreset}
          onDelete={handleDeletePreset}
          onExport={handleExportPreset}
          onImport={handleImportPreset}
          onClose={() => setShowPresets(false)}
        />
      )}

      {showMidi && (
        <MidiController
          setups={midiSetups}
          midiManager={midiRef.current}
          midiReady={midiReady}
          onSaveSetup={handleSaveMidiSetup}
          onDeleteSetup={handleDeleteMidiSetup}
          onActivate={handleActivateMidiSetup}
          onCreateSetup={handleCreateMidiSetup}
          onClose={() => setShowMidi(false)}
        />
      )}

      {showSettings && (
        <SettingsModal
          inputs={inputs}      outputs={outputs}
          inputId={inputId}    outputId={outputId}
          cachedModels={cachedModels}
          cachedIrs={cachedIrs}
          audioReady={audioReady}
          latencyMs={latencyMs}
          onInputChange={handleInputChange}
          onOutputChange={handleOutputChange}
          onLoadModel={(f) => applyModelFile(f)}
          onLoadIr={(f) => applyIrFile(f)}
          onDeleteCached={handleDeleteCached}
          onTestLatency={handleTestLatency}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Save-as inline modal */}
      {showSaveAs && (
        <div className={styles.saveAsOverlay} onClick={(e) => { if (e.target === e.currentTarget) setShowSaveAs(false); }}>
          <div className={styles.saveAsBox}>
            <p className={styles.saveAsTitle}>SAVE PRESET</p>
            <input
              className={styles.saveAsInput}
              value={saveAsName}
              onChange={(e) => setSaveAsName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && saveAsName.trim()) { handleSavePreset(saveAsName.trim()); setShowSaveAs(false); }
                if (e.key === 'Escape') setShowSaveAs(false);
              }}
              placeholder="Preset name…"
              autoFocus
            />
            <div className={styles.saveAsBtns}>
              <button
                className={styles.saveAsConfirm}
                disabled={!saveAsName.trim()}
                onClick={() => { handleSavePreset(saveAsName.trim()); setShowSaveAs(false); }}
              >Save</button>
              <button className={styles.saveAsCancel} onClick={() => setShowSaveAs(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
