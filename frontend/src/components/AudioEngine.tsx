import { useCallback, useEffect, useRef, useState } from 'react';
import AmpHead from './AmpHead';
import LevelMeter from './LevelMeter';
import DeviceSelector from './DeviceSelector';
import ModelLoader from './ModelLoader';
import CabLoader from './CabLoader';
import { AudioEngine as AudioEngineCore } from '../lib/audio/AudioEngine';
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

  const engineRef = useRef<AudioEngineCore | null>(null);

  // Persist the engine across start/stop so models loaded before start() survive
  const getEngine = useCallback((): AudioEngineCore => {
    if (!engineRef.current) engineRef.current = new AudioEngineCore();
    return engineRef.current;
  }, []);

  useEffect(() => {
    // Pre-create the engine so the user can load models before hitting START
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
      await engine.start({
        inputDeviceId:  inputId  || undefined,
        outputDeviceId: outputId || undefined,
      });
      setAnalyser(engine.getAnalyser());
      setRunning(true);

      const { inputs, outputs } = await enumerateAudioDevices();
      setInputs(inputs);
      setOutputs(outputs);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Could not start audio: ${message}`);
    }
  }, [getEngine, inputId, outputId]);

  const handleStop = useCallback(() => {
    engineRef.current?.stop();
    // Keep the engine instance alive so the loaded model survives stop/start
    setAnalyser(null);
    setRunning(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Parameters
  // ---------------------------------------------------------------------------

  const handleGainChange = useCallback((value: number) => {
    setGain(value);
    engineRef.current?.setGain(value);
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
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to load model: ${message}`);
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
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to load cab IR: ${message}`);
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
        gain={gain}
        onGainChange={handleGainChange}
        modelName={modelName}
        namLoaded={namLoaded}
      />
      <ModelLoader modelName={modelName} loading={modelLoading} onLoad={handleModelLoad} />
      <CabLoader   irName={irName}       loading={irLoading}    onLoad={handleIRLoad}    />
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
