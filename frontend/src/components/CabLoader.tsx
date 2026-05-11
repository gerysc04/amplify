import { useRef } from 'react';
import styles from './CabLoader.module.css';

interface CabLoaderProps {
  irName:  string | null;
  loading: boolean;
  onLoad:  (file: File) => void;
}

export default function CabLoader({ irName, loading, onLoad }: CabLoaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onLoad(file);
    e.target.value = '';
  };

  return (
    <div className={styles.row}>
      <span className={styles.sectionLabel}>Cab IR</span>
      <span className={styles.fileName}>
        {loading ? 'Loading…' : (irName ?? 'No IR loaded — sound will be harsh')}
      </span>
      <button
        className={styles.loadBtn}
        onClick={() => inputRef.current?.click()}
        disabled={loading}
      >
        Load .wav
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".wav"
        className={styles.hidden}
        onChange={handleChange}
      />
    </div>
  );
}
