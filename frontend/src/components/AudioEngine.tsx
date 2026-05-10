import { useCallback, useEffect, useRef, useState } from 'react';
import AmpHead from './AmpHead';
import LevelMeter from './LevelMeter';
import DeviceSelector from './DeviceSelector';
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

  const engineRef = useRef<AudioEngineCore | null>(null);

  // Try an initial enumeration on mount — labels will be empty until permission
  // is granted, but device IDs are visible so the selects aren't totally blank.
  useEffect(() => {
    enumerateAudioDevices().then(({ inputs, outputs }) => {
      setInputs(inputs);
      setOutputs(outputs);
    });
  }, []);

  const handleStart = useCallback(async () => {
    setError(null);
    try {
      const engine = new AudioEngineCore();
      await engine.start({ inputDeviceId: inputId || undefined, outputDeviceId: outputId || undefined });
      engineRef.current = engine;
      setAnalyser(engine.getAnalyser());
      setRunning(true);

      // Re-enumerate now that permission is granted — labels will be populated.
      const { inputs, outputs } = await enumerateAudioDevices();
      setInputs(inputs);
      setOutputs(outputs);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Could not start audio: ${message}`);
    }
  }, [inputId, outputId]);

  const handleStop = useCallback(() => {
    engineRef.current?.stop();
    engineRef.current = null;
    setAnalyser(null);
    setRunning(false);
  }, []);

  const handleGainChange = useCallback((value: number) => {
    setGain(value);
    engineRef.current?.setGain(value);
  }, []);

  const handleOutputChange = useCallback((id: string) => {
    setOutputId(id);
    // Output can be switched live without restarting.
    engineRef.current?.setOutputDevice(id);
  }, []);

  return (
    <div className={styles.root}>
      <AmpHead gain={gain} onGainChange={handleGainChange} />
      <DeviceSelector
        inputs={inputs}
        outputs={outputs}
        inputId={inputId}
        outputId={outputId}
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
