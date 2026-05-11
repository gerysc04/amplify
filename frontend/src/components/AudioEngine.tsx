import { useCallback, useEffect, useRef, useState } from 'react';
import AmpHead from './AmpHead';
import LevelMeter from './LevelMeter';
import DeviceSelector from './DeviceSelector';
import ModelLoader from './ModelLoader';
import CabLoader from './CabLoader';
import EffectsRack from './EffectsRack';
import {
  AudioEngine as AudioEngineCore,
  type GateParams, type EqParams,
  type DelayParams, type ReverbParams, type ChorusParams,
} from '../lib/audio/AudioEngine';
import { enumerateAudioDevices } from '../lib/audio/devices';
import styles from './AudioEngine.module.css';

export default function AudioEngine() {
  const [running,  setRunning]  = useState(false);
  const [gain,     setGain]     = useState(0.5);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [error,    setError]    = useState<string | null>(null);

  const [inputs,   setInputs]   = useState<MediaDeviceInfo[]>([]);
  const [outputs,  setOutputs]  = useState<MediaDeviceInfo[]>([]);
  const [inputId,  setInputId]  = useState('');
  const [outputId, setOutputId] = useState('');

  const [modelName,    setModelName]    = useState<string | null>(null);
  const [modelLoading, setModelLoading] = useState(false);
  const [irName,       setIrName]       = useState<string | null>(null);
  const [irLoading,    setIrLoading]    = useState(false);

  const [gate,   setGate]   = useState<GateParams>  ({ enabled: true, threshold: 0.02, attack: 0.003, release: 0.15 });
  const [eq,     setEq]     = useState<EqParams>     ({ bass: 0, mid: 0, treble: 0 });
  const [delay,  setDelay]  = useState<DelayParams>  ({ enabled: false, time: 0.3, feedback: 0.35, mix: 0.3 });
  const [reverb, setReverb] = useState<ReverbParams> ({ enabled: false, mix: 0.25 });
  const [chorus, setChorus] = useState<ChorusParams> ({ enabled: false, rate: 1.5, depth: 0.005, mix: 0.3 });

  const engineRef = useRef<AudioEngineCore | null>(null);

  const getEngine = useCallback((): AudioEngineCore => {
    if (!engineRef.current) engineRef.current = new AudioEngineCore();
    return engineRef.current;
  }, []);

  useEffect(() => {
    getEngine();
    enumerateAudioDevices().then(({ inputs, outputs }) => {
      setInputs(inputs);
      setOutputs(outputs);
    });
    return () => {
      engineRef.current?.stop();
      engineRef.current?.nam.dispose();
    };
  }, [getEngine]);

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

  const handleOutputChange = useCallback((id: string) => {
    setOutputId(id);
    engineRef.current?.setOutputDevice(id);
  }, []);

  // ---------------------------------------------------------------------------
  // Model / IR loading
  // ---------------------------------------------------------------------------

  const handleModelLoad = useCallback(async (file: File) => {
    setModelLoading(true);
    setError(null);
    try {
      await getEngine().loadNamModel(file);
      setModelName(file.name.replace(/\.nam$/i, ''));
    } catch (err) {
      setError(`Failed to load model: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setModelLoading(false);
    }
  }, [getEngine]);

  const handleIRLoad = useCallback(async (file: File) => {
    setIrLoading(true);
    setError(null);
    try {
      await getEngine().loadCabIR(file);
      setIrName(file.name.replace(/\.wav$/i, ''));
    } catch (err) {
      setError(`Failed to load cab IR: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIrLoading(false);
    }
  }, [getEngine]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const namLoaded = engineRef.current?.isNamLoaded() ?? false;

  return (
    <div className={styles.root}>
      <AmpHead
        gain={gain}     onGainChange={handleGainChange}
        eq={eq}         onEqChange={handleEqChange}
        modelName={modelName} namLoaded={namLoaded}
      />
      <ModelLoader modelName={modelName} loading={modelLoading} onLoad={handleModelLoad} />
      <CabLoader   irName={irName}       loading={irLoading}    onLoad={handleIRLoad}    />
      <EffectsRack
        gate={gate}     onGate={handleGateChange}
        delay={delay}   onDelay={handleDelayChange}
        reverb={reverb} onReverb={handleReverbChange}
        chorus={chorus} onChorus={handleChorusChange}
      />
      <DeviceSelector
        inputs={inputs}    outputs={outputs}
        inputId={inputId}  outputId={outputId}
        onInputChange={setInputId}
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
