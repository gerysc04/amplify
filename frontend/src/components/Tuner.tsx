import { useEffect, useRef, useState, useCallback } from 'react';
import styles from './Tuner.module.css';

interface Props {
  tunerNode: AudioWorkletNode | null;
  visible: boolean;
}

interface PitchData {
  frequency: number;
  note: string;
  octave: number;
  cents: number;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** YIN pitch detection (runs on main thread).
 *  Tuned for guitar: threshold 0.08, global-min fallback, RMS gate,
 *  and skipping the noisy first 20 tau values.
 */
function yinPitch(buffer: Float32Array, sr: number): number {
  // 1. RMS gate — don't waste cycles on silence
  let sumSq = 0;
  for (let i = 0; i < buffer.length; i++) sumSq += buffer[i] * buffer[i];
  const rms = Math.sqrt(sumSq / buffer.length);
  if (rms < 0.001) return 0; // below ~-60 dBFS

  const half = Math.floor(buffer.length / 2);
  const yin = new Float32Array(half);

  // 2. Difference function
  for (let tau = 1; tau < half; tau++) {
    let sum = 0;
    for (let j = 0; j < half; j++) {
      const d = buffer[j] - buffer[j + tau];
      sum += d * d;
    }
    yin[tau] = sum;
  }

  // 3. Cumulative mean normalized difference
  yin[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau < half; tau++) {
    runningSum += yin[tau];
    yin[tau] = (yin[tau] * tau) / runningSum;
  }

  // 4. Search for dip — skip first 20 tau (noisy region above ~2.4 kHz)
  const threshold = 0.08;
  const minSearch = 20;  // ~2400 Hz max, guitar never needs higher
  let tau = minSearch;
  let bestTau = minSearch;
  let bestVal = yin[minSearch];

  while (tau < half) {
    if (yin[tau] < bestVal) {
      bestVal = yin[tau];
      bestTau = tau;
    }
    if (yin[tau] < threshold) {
      // Found a dip below threshold — refine to local minimum
      while (tau + 1 < half && yin[tau + 1] < yin[tau]) tau++;
      bestTau = tau;
      bestVal = yin[tau];
      break;
    }
    tau++;
  }

  // If the best value is terrible, reject it
  if (bestVal > 0.5) return 0;

  // 5. Parabolic interpolation (clamp shift to avoid wild values)
  const t = bestTau;
  const x0 = t > 0 ? t - 1 : t;
  const x2 = t + 1 < half ? t + 1 : t;
  const s0 = yin[x0];
  const s1 = yin[t];
  const s2 = yin[x2];
  const denom = 2 * (2 * s1 - s2 - s0);
  let shift = 0;
  if (denom !== 0) {
    shift = (s2 - s0) / denom;
    // Clamp to [-0.5, 0.5] — if parabola is too flat, don't trust it
    shift = Math.max(-0.5, Math.min(0.5, shift));
  }

  const freq = sr / (t + shift);
  return freq >= 30 && freq <= 1500 ? freq : 0;
}

function freqToNote(freq: number): PitchData {
  const A4 = 440;
  const semitones = 12 * Math.log2(freq / A4);
  const midiNote = Math.round(semitones) + 69;
  const cents = (semitones - Math.round(semitones)) * 100;
  const name = NOTE_NAMES[((midiNote % 12) + 12) % 12];
  const octave = Math.floor(midiNote / 12) - 1;
  return { frequency: freq, note: name, octave, cents };
}

export default function Tuner({ tunerNode, visible }: Props) {
  const [pitch, setPitch] = useState<PitchData | null>(null);
  const rafRef = useRef<number>(0);
  const pendingRef = useRef<Float32Array | null>(null);

  const processBuffer = useCallback((buf: Float32Array, sr: number) => {
    const freq = yinPitch(buf, sr);
    if (freq > 0) {
      setPitch(freqToNote(freq));
    }
  }, []);

  useEffect(() => {
    if (!tunerNode || !visible) return;

    const handler = ({ data }: MessageEvent) => {
      if (data.type === 'buffer') {
        pendingRef.current = data.samples;
      }
    };

    tunerNode.port.onmessage = handler;

    const loop = () => {
      if (pendingRef.current) {
        processBuffer(pendingRef.current, 48000);
        pendingRef.current = null;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      tunerNode.port.onmessage = null;
      cancelAnimationFrame(rafRef.current);
    };
  }, [tunerNode, visible, processBuffer]);

  if (!visible) return null;

  const inTune = pitch && Math.abs(pitch.cents) < 5;
  const needleDeg = pitch ? Math.max(-45, Math.min(45, pitch.cents * 0.9)) : 0;

  return (
    <div className={styles.tuner}>
      <div className={styles.needleWrap}>
        <div
          className={styles.needle}
          style={{ transform: `rotate(${needleDeg}deg)`, background: inTune ? '#4caf50' : '#ccc' }}
        />
        <div className={styles.needleCenter} />
      </div>

      <div className={styles.noteRow}>
        {pitch ? (
          <>
            <span className={`${styles.note} ${inTune ? styles.inTune : ''}`}>
              {pitch.note}
            </span>
            <span className={styles.octave}>{pitch.octave}</span>
          </>
        ) : (
          <span className={styles.note}>--</span>
        )}
      </div>

      <div className={styles.centsRow}>
        {pitch ? (
          <span className={inTune ? styles.inTune : ''}>
            {pitch.cents > 0 ? '+' : ''}{pitch.cents.toFixed(0)}¢
          </span>
        ) : (
          <span>Play a note…</span>
        )}
      </div>

      {pitch && (
        <div className={styles.freq}>{pitch.frequency.toFixed(1)} Hz</div>
      )}
    </div>
  );
}
