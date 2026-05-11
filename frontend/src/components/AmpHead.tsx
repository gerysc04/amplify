import Knob from './knobs/Knob';
import type { EqParams } from '../lib/audio/AudioEngine';
import styles from './AmpHead.module.css';

interface AmpHeadProps {
  gain:         number;
  onGainChange: (value: number) => void;
  eq:           EqParams;
  onEqChange:   (p: EqParams) => void;
  modelName:    string | null;
  namLoaded:    boolean;
}

// EQ knob maps 0–1 to −12 dB … +12 dB
const dbToKnob = (db: number) => (db + 12) / 24;
const knobToDb = (k: number)  => k * 24 - 12;

export default function AmpHead({ gain, onGainChange, eq, onEqChange, modelName, namLoaded }: AmpHeadProps) {
  return (
    <div className={styles.head}>
      <div className={styles.topBar}>
        <span className={styles.brand}>AMPLIFY</span>
        <span className={`${styles.modelName} ${namLoaded ? styles.loaded : styles.empty}`}>
          {modelName ?? 'No model loaded'}
        </span>
      </div>
      <div className={styles.controls}>
        <Knob value={gain}                onChange={onGainChange}                                    label="Gain"   defaultValue={0.5} />
        <Knob value={dbToKnob(eq.bass)}   onChange={(k) => onEqChange({ ...eq, bass:   knobToDb(k) })} label="Bass"   defaultValue={0.5} />
        <Knob value={dbToKnob(eq.mid)}    onChange={(k) => onEqChange({ ...eq, mid:    knobToDb(k) })} label="Mid"    defaultValue={0.5} />
        <Knob value={dbToKnob(eq.treble)} onChange={(k) => onEqChange({ ...eq, treble: knobToDb(k) })} label="Treble" defaultValue={0.5} />
      </div>
    </div>
  );
}
