import { useCallback, useRef, useState } from 'react';
import AmpHead from './AmpHead';
import LevelMeter from './LevelMeter';
import { AudioEngine as AudioEngineCore } from '../lib/audio/AudioEngine';
import styles from './AudioEngine.module.css';

export default function AudioEngine() {
  const [running,  setRunning]  = useState(false);
  const [gain,     setGain]     = useState(0.5);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  const engineRef = useRef<AudioEngineCore | null>(null);

  const handleStart = useCallback(async () => {
    setError(null);
    try {
      const engine = new AudioEngineCore();
      await engine.start();
      engineRef.current = engine;
      setAnalyser(engine.getAnalyser());
      setRunning(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Could not start audio: ${message}`);
    }
  }, []);

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

  return (
    <div className={styles.root}>
      <AmpHead gain={gain} onGainChange={handleGainChange} />
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
