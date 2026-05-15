import { useEffect, useRef, useState } from 'react';
import styles from './Looper.module.css';

interface Props {
  port: MessagePort | null;
  onRecord: () => void;
  onPlay: () => void;
  onOverdub: () => void;
  onStop: () => void;
  onClear: () => void;
}

type LooperState = 'idle' | 'recording' | 'playing' | 'overdubbing';

export default function Looper({ port, onRecord, onPlay, onOverdub, onStop, onClear }: Props) {
  const [state, setState] = useState<LooperState>('idle');
  const [position, setPosition] = useState(0);
  const [length, setLength] = useState(0);
  const stateRef = useRef<LooperState>('idle');

  // Keep ref in sync for button handlers
  useEffect(() => { stateRef.current = state; }, [state]);

  // Listen to worklet status updates
  useEffect(() => {
    if (!port) return;
    const handler = (e: MessageEvent) => {
      if (e.data.type === 'status') {
        setState(e.data.state as LooperState);
        setPosition(e.data.position);
        setLength(e.data.length);
      }
    };
    port.addEventListener('message', handler);
    return () => port.removeEventListener('message', handler);
  }, [port]);

  const hasLoop = length > 0;
  const progress = length > 0 ? (position / length) * 100 : 0;

  // Smart button handlers that adapt to current state
  const handleRecord = () => {
    if (stateRef.current === 'recording') {
      onStop(); // stop recording → playing
    } else {
      onRecord(); // start fresh recording (clears old loop implicitly via worklet)
    }
  };

  const handleOverdub = () => {
    if (stateRef.current === 'overdubbing') {
      onPlay(); // stop overdubbing → playing
    } else {
      onOverdub();
    }
  };

  const handlePlay = () => {
    onPlay();
  };

  const handleStop = () => {
    onStop();
  };

  const handleClear = () => {
    onClear();
    setPosition(0);
    setLength(0);
  };

  const stateLabel = {
    idle: 'IDLE',
    recording: 'REC',
    playing: 'PLAY',
    overdubbing: 'DUB',
  }[state];

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Looper</span>
        <span className={`${styles.status} ${styles[state]}`}>{stateLabel}</span>
      </div>

      {/* Progress bar */}
      <div className={styles.progressTrack}>
        <div
          className={`${styles.progressFill} ${state === 'recording' ? styles.recFill : ''}`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Transport buttons */}
      <div className={styles.controls}>
        <button
          className={`${styles.btn} ${state === 'recording' ? styles.btnActive : ''}`}
          onClick={handleRecord}
          title={state === 'recording' ? 'Stop recording' : 'Record'}
        >
          {state === 'recording' ? '⏹' : '●'}
        </button>

        <button
          className={`${styles.btn} ${state === 'playing' ? styles.btnActive : ''}`}
          onClick={handlePlay}
          disabled={!hasLoop || state === 'recording'}
          title="Play"
        >
          ▶
        </button>

        <button
          className={`${styles.btn} ${state === 'overdubbing' ? styles.btnActive : ''}`}
          onClick={handleOverdub}
          disabled={!hasLoop || state === 'recording'}
          title={state === 'overdubbing' ? 'Stop overdub' : 'Overdub'}
        >
          {state === 'overdubbing' ? '⏹' : '▲'}
        </button>

        <button
          className={styles.btn}
          onClick={handleStop}
          disabled={state === 'idle' || state === 'recording'}
          title="Stop"
        >
          ■
        </button>

        <button
          className={`${styles.btn} ${styles.btnClear}`}
          onClick={handleClear}
          disabled={!hasLoop && state === 'idle'}
          title="Clear loop"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
