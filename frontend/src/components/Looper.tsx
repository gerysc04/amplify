import { useEffect, useRef, useState } from 'react';
import styles from './Looper.module.css';

interface Props {
  port: MessagePort | null;
  onRecord: () => void;
  onStopRecord: () => void;
  onPlay: () => void;
  onOverdub: () => void;
  onStop: () => void;
  onClear: () => void;
}

type LooperState = 'idle' | 'recording' | 'playing' | 'overdubbing';

export default function Looper({ port, onRecord, onStopRecord, onPlay, onOverdub, onStop, onClear }: Props) {
  const [state, setState] = useState<LooperState>('idle');
  const [position, setPosition] = useState(0);
  const [length, setLength] = useState(0);
  const [hasPort, setHasPort] = useState(false);
  const stateRef = useRef<LooperState>('idle');

  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    setHasPort(!!port);
    if (!port) return;
    port.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'status') {
        setState(e.data.state as LooperState);
        setPosition(e.data.position);
        setLength(e.data.length);
      }
    };
    return () => { port.onmessage = null; };
  }, [port]);

  const hasLoop = length > 0;
  const progress = length > 0 ? (position / length) * 100 : 0;

  const handleRecord = () => {
    if (stateRef.current === 'recording') {
      onStopRecord();
    } else {
      onRecord();
    }
  };

  const handleOverdub = () => {
    if (stateRef.current === 'overdubbing') {
      onPlay();
    } else {
      onOverdub();
    }
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
        {!hasPort && (
          <span className={styles.status} style={{ color: '#e53935' }}>OFF</span>
        )}
        {hasPort && (
          <span className={`${styles.status} ${styles[state]}`}>{stateLabel}</span>
        )}
      </div>

      <div className={styles.progressTrack}>
        <div
          className={`${styles.progressFill} ${state === 'recording' ? styles.recFill : ''}`}
          style={{ width: `${progress}%` }}
        />
      </div>

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
          onClick={onPlay}
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
          onClick={onStop}
          disabled={state === 'idle' || state === 'recording'}
          title="Stop"
        >
          ■
        </button>

        <button
          className={`${styles.btn} ${styles.btnClear}`}
          onClick={onClear}
          disabled={!hasLoop && state === 'idle'}
          title="Clear loop"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
