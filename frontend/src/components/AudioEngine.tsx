import { useCallback, useEffect, useRef, useState } from 'react';
import AmpHead from './AmpHead';
import LevelMeter from './LevelMeter';
import DeviceSelector from './DeviceSelector';
import ModelLoader from './ModelLoader';
import CabLoader from './CabLoader';
import EffectsRack from './EffectsRack';
import PresetBrowser from './PresetBrowser';
import AmpBrowser from './AmpBrowser';
import type { GearType } from '../lib/tone3000/types';
import {
  AudioEngine as AudioEngineCore,
  type GateParams, type EqParams,
  type DelayParams, type ReverbParams, type ChorusParams,
} from '../lib/audio/AudioEngine';
import { enumerateAudioDevices } from '../lib/audio/devices';
import { fileCache } from '../lib/storage/FileCache';
import { presetManager } from '../lib/storage/PresetManager';
import type { Preset } from '../types/audio';
import styles from './AudioEngine.module.css';

export default function AudioEngine() {
  const [running,  setRunning]  = useState(false);
  const [gain,     setGain]     = useState(0.5);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [error,    setError]    = useState<string | null>(null);

  const [inputs,   setInputs]   = useState<MediaDeviceInfo[]>([]);
  const [outputs,  setOutputs]  = useState<MediaDeviceInfo[]>([]);
  const [inputId,  setInputId]  = useState(() => localStorage.getItem('amplify-input-device')  ?? '');
  const [outputId, setOutputId] = useState(() => localStorage.getItem('amplify-output-device') ?? '');

  const [modelName,    setModelName]    = useState<string | null>(null);
  const [modelLoading, setModelLoading] = useState(false);
  const [irName,       setIrName]       = useState<string | null>(null);
  const [irLoading,    setIrLoading]    = useState(false);

  const [gate,   setGate]   = useState<GateParams>  ({ enabled: true,  threshold: 0.02, attack: 0.003, release: 0.15 });
  const [eq,     setEq]     = useState<EqParams>     ({ bass: 0, mid: 0, treble: 0 });
  const [delay,  setDelay]  = useState<DelayParams>  ({ enabled: false, time: 0.3, feedback: 0.35, mix: 0.3 });
  const [reverb, setReverb] = useState<ReverbParams> ({ enabled: false, mix: 0.25 });
  const [chorus, setChorus] = useState<ChorusParams> ({ enabled: false, rate: 1.5, depth: 0.005, mix: 0.3 });

  const [presets,       setPresets]       = useState<Preset[]>([]);
  const [activePreset,  setActivePreset]  = useState<Preset | null>(null);
  const [cachedModels,  setCachedModels]  = useState<string[]>([]);
  const [cachedIrs,     setCachedIrs]     = useState<string[]>([]);

  const engineRef        = useRef<AudioEngineCore | null>(null);
  const modelFilenameRef = useRef<string | null>(null);
  const irFilenameRef    = useRef<string | null>(null);

  const getEngine = useCallback((): AudioEngineCore => {
    if (!engineRef.current) engineRef.current = new AudioEngineCore();
    return engineRef.current;
  }, []);

  // ---------------------------------------------------------------------------
  // Cached file index
  // ---------------------------------------------------------------------------

  const refreshCachedFiles = useCallback(async () => {
    const keys = await fileCache.listKeys();
    setCachedModels(keys.filter((k) => k.endsWith('.nam')));
    setCachedIrs(keys.filter((k) => k.endsWith('.wav')));
  }, []);

  useEffect(() => {
    getEngine();
    enumerateAudioDevices().then(({ inputs, outputs }) => {
      setInputs(inputs);
      setOutputs(outputs);
    });
    setPresets(presetManager.list());
    refreshCachedFiles();
    return () => {
      engineRef.current?.stop();
      engineRef.current?.nam.dispose();
    };
  }, [getEngine, refreshCachedFiles]);

  // ---------------------------------------------------------------------------
  // Audio start / stop
  // ---------------------------------------------------------------------------

  const handleStart = useCallback(async () => {
    setError(null);
    try {
      const engine = getEngine();
      await engine.start({ inputDeviceId: inputId || undefined, outputDeviceId: outputId || undefined });
      setAnalyser(engine.getAnalyser());
      setRunning(true);
      const { inputs, outputs } = await enumerateAudioDevices();
      setInputs(inputs);
      setOutputs(outputs);
    } catch (err) {
      setError(`Could not start audio: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [getEngine, inputId, outputId]);

  const handleStop = useCallback(() => {
    engineRef.current?.stop();
    setAnalyser(null);
    setRunning(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Parameter handlers
  // ---------------------------------------------------------------------------

  const handleGainChange = useCallback((value: number) => {
    setGain(value);
    engineRef.current?.setGain(value);
  }, []);

  const handleEqChange = useCallback((p: EqParams) => {
    setEq(p);
    engineRef.current?.setEqParams(p);
  }, []);

  const handleGateChange = useCallback((p: GateParams) => {
    setGate(p);
    engineRef.current?.setGateParams(p);
  }, []);

  const handleDelayChange = useCallback((p: DelayParams) => {
    setDelay(p);
    engineRef.current?.setDelayParams(p);
  }, []);

  const handleReverbChange = useCallback((p: ReverbParams) => {
    setReverb(p);
    engineRef.current?.setReverbParams(p);
  }, []);

  const handleChorusChange = useCallback((p: ChorusParams) => {
    setChorus(p);
    engineRef.current?.setChorusParams(p);
  }, []);

  const handleInputChange = useCallback((id: string) => {
    setInputId(id);
    localStorage.setItem('amplify-input-device', id);
  }, []);

  const handleOutputChange = useCallback((id: string) => {
    setOutputId(id);
    localStorage.setItem('amplify-output-device', id);
    engineRef.current?.setOutputDevice(id);
  }, []);

  // ---------------------------------------------------------------------------
  // Model / IR loading (cache on every load)
  // ---------------------------------------------------------------------------

  const applyModelFile = useCallback(async (file: File) => {
    setModelLoading(true);
    setError(null);
    try {
      await fileCache.store(file);
      await getEngine().loadNamModel(file);
      modelFilenameRef.current = file.name;
      setModelName(file.name.replace(/\.nam$/i, ''));
      await refreshCachedFiles();
    } catch (err) {
      setError(`Failed to load model: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setModelLoading(false);
    }
  }, [getEngine, refreshCachedFiles]);

  const applyIrFile = useCallback(async (file: File) => {
    setIrLoading(true);
    setError(null);
    try {
      await fileCache.store(file);
      await getEngine().loadCabIR(file);
      irFilenameRef.current = file.name;
      setIrName(file.name.replace(/\.wav$/i, ''));
      await refreshCachedFiles();
    } catch (err) {
      setError(`Failed to load cab IR: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIrLoading(false);
    }
  }, [getEngine, refreshCachedFiles]);

  const handleModelLoad = useCallback((file: File) => applyModelFile(file), [applyModelFile]);
  const handleIRLoad    = useCallback((file: File) => applyIrFile(file),    [applyIrFile]);

  // Called by AmpBrowser when the user loads a tone from tone3000
  const handleToneLoad = useCallback(async (file: File, gearType: GearType) => {
    await applyModelFile(file);
    if (gearType === 'full-rig') {
      // Full-rig has amp+cab baked in — bypass the ConvolverNode with a dirac delta
      engineRef.current?.bypassCabIr();
      setIrName('(baked in)');
      irFilenameRef.current = null;
    }
  }, [applyModelFile]);

  // ---------------------------------------------------------------------------
  // Preset handlers
  // ---------------------------------------------------------------------------

  const handleSavePreset = useCallback((name: string) => {
    const preset: Preset = {
      id:        crypto.randomUUID(),
      name,
      createdAt: Date.now(),
      namModel:  { filename: modelFilenameRef.current ?? '', available: engineRef.current?.isNamLoaded() ?? false },
      cabIR:     { filename: irFilenameRef.current ?? '',    available: irFilenameRef.current !== null },
      gain,
      gate,
      eq,
      delay,
      reverb,
      chorus,
    };
    presetManager.add(preset);
    setPresets(presetManager.list());
  }, [gain, gate, eq, delay, reverb, chorus]);

  const handleLoadPreset = useCallback(async (preset: Preset) => {
    setGain(preset.gain);
    engineRef.current?.setGain(preset.gain);

    setGate(preset.gate);     engineRef.current?.setGateParams(preset.gate);
    setEq(preset.eq);         engineRef.current?.setEqParams(preset.eq);
    setDelay(preset.delay);   engineRef.current?.setDelayParams(preset.delay);
    setReverb(preset.reverb); engineRef.current?.setReverbParams(preset.reverb);
    setChorus(preset.chorus); engineRef.current?.setChorusParams(preset.chorus);

    if (preset.namModel.filename) {
      const cached = await fileCache.load(preset.namModel.filename);
      if (cached) await applyModelFile(cached);
    }
    if (preset.cabIR.filename) {
      const cached = await fileCache.load(preset.cabIR.filename);
      if (cached) await applyIrFile(cached);
    }

    setActivePreset(preset);
  }, [applyModelFile, applyIrFile]);

  const handleUpdatePreset = useCallback(() => {
    if (!activePreset) return;
    const updated: Preset = {
      ...activePreset,
      gain, gate, eq, delay, reverb, chorus,
      namModel: { filename: modelFilenameRef.current ?? '', available: engineRef.current?.isNamLoaded() ?? false },
      cabIR:    { filename: irFilenameRef.current ?? '',    available: irFilenameRef.current !== null },
    };
    presetManager.update(activePreset.id, updated);
    setActivePreset(updated);
    setPresets(presetManager.list());
  }, [activePreset, gain, gate, eq, delay, reverb, chorus]);

  const handleDeletePreset = useCallback((id: string) => {
    presetManager.remove(id);
    setPresets(presetManager.list());
    setActivePreset((prev) => (prev?.id === id ? null : prev));
  }, []);

  const handleExportPreset = useCallback((preset: Preset) => {
    const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${preset.name.replace(/[^a-z0-9]/gi, '_')}.json`;
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
      } catch {
        setError('Failed to import preset: invalid file');
      }
    };
    reader.readAsText(file);
  }, []);

  const handleDeleteCachedFile = useCallback(async (filename: string) => {
    await fileCache.remove(filename);
    await refreshCachedFiles();
  }, [refreshCachedFiles]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const namLoaded = engineRef.current?.isNamLoaded() ?? false;

  const [showSaveAs, setShowSaveAs] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');

  const openSaveAs = () => {
    setSaveAsName(activePreset?.name ?? '');
    setShowSaveAs(true);
  };

  const commitSaveAs = () => {
    const name = saveAsName.trim();
    if (!name) return;
    handleSavePreset(name);
    setShowSaveAs(false);
  };

  return (
    <div className={styles.root}>
      {activePreset && (
        <div className={styles.activeBar}>
          {showSaveAs ? (
            <>
              <input
                className={styles.activeInput}
                value={saveAsName}
                onChange={(e) => setSaveAsName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') commitSaveAs(); if (e.key === 'Escape') setShowSaveAs(false); }}
                autoFocus
              />
              <button className={styles.activeBtn} onClick={commitSaveAs} disabled={!saveAsName.trim()}>Save</button>
              <button className={styles.activeBtnGhost} onClick={() => setShowSaveAs(false)}>Cancel</button>
            </>
          ) : (
            <>
              <span className={styles.activeName}>◈ {activePreset.name}</span>
              <button className={styles.activeBtn} onClick={handleUpdatePreset}>Update</button>
              <button className={styles.activeBtn} onClick={openSaveAs}>Save as new</button>
            </>
          )}
        </div>
      )}
      <AmpHead
        gain={gain}     onGainChange={handleGainChange}
        eq={eq}         onEqChange={handleEqChange}
        modelName={modelName} namLoaded={namLoaded}
      />
      <AmpBrowser onLoadModel={handleToneLoad} onLoadIr={handleIRLoad} />
      <ModelLoader modelName={modelName} loading={modelLoading} onLoad={handleModelLoad} />
      <CabLoader   irName={irName}       loading={irLoading}    onLoad={handleIRLoad}    />
      <EffectsRack
        gate={gate}     onGate={handleGateChange}
        delay={delay}   onDelay={handleDelayChange}
        reverb={reverb} onReverb={handleReverbChange}
        chorus={chorus} onChorus={handleChorusChange}
      />
      <PresetBrowser
        presets={presets}
        activePreset={activePreset}
        cachedModels={cachedModels}
        cachedIrs={cachedIrs}
        onLoad={handleLoadPreset}
        onSave={handleSavePreset}
        onUpdate={handleUpdatePreset}
        onDelete={handleDeletePreset}
        onExport={handleExportPreset}
        onImport={handleImportPreset}
        onDeleteCachedFile={handleDeleteCachedFile}
      />
      <DeviceSelector
        inputs={inputs}    outputs={outputs}
        inputId={inputId}  outputId={outputId}
        onInputChange={handleInputChange}
        onOutputChange={handleOutputChange}
        running={running}
      />
      <div className={styles.footer}>
        <LevelMeter analyserNode={analyser} />
        <button
          className={running ? styles.stopBtn : styles.startBtn}
          onClick={running ? handleStop : handleStart}
        >
          {running ? '■  STOP' : '▶  START'}
        </button>
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
