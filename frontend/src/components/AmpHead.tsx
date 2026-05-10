import Knob from './knobs/Knob';
import styles from './AmpHead.module.css';

interface AmpHeadProps {
  gain: number;
  onGainChange: (value: number) => void;
}

export default function AmpHead({ gain, onGainChange }: AmpHeadProps) {
  return (
    <div className={styles.head}>
      <div className={styles.topBar}>
        <span className={styles.brand}>AMPLIFY</span>
        <span className={styles.subtitle}>Phase 1 — Distortion</span>
      </div>
      <div className={styles.controls}>
        <Knob value={gain} onChange={onGainChange} label="Gain" defaultValue={0.5} />
      </div>
    </div>
  );
}
