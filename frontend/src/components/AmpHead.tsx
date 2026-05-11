import Knob from './knobs/Knob';
import styles from './AmpHead.module.css';

interface AmpHeadProps {
  gain:        number;
  onGainChange: (value: number) => void;
  modelName:   string | null;
  namLoaded:   boolean;
}

export default function AmpHead({ gain, onGainChange, modelName, namLoaded }: AmpHeadProps) {
  return (
    <div className={styles.head}>
      <div className={styles.topBar}>
        <span className={styles.brand}>AMPLIFY</span>
        <span className={`${styles.modelName} ${namLoaded ? styles.loaded : styles.empty}`}>
          {modelName ?? 'No model loaded'}
        </span>
      </div>
      <div className={styles.controls}>
        <Knob value={gain} onChange={onGainChange} label="Gain" defaultValue={0.5} />
      </div>
    </div>
  );
}
