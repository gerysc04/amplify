import { useRef } from 'react';
import styles from './ModelLoader.module.css';

interface ModelLoaderProps {
  modelName: string | null;
  loading:   boolean;
  onLoad:    (file: File) => void;
}

export default function ModelLoader({ modelName, loading, onLoad }: ModelLoaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onLoad(file);
    // Reset so the same file can be reloaded if needed
    e.target.value = '';
  };

  return (
    <div className={styles.row}>
      <span className={styles.sectionLabel}>NAM Model</span>
      <span className={styles.fileName}>
        {loading ? 'Loading…' : (modelName ?? 'No model loaded')}
      </span>
      <button
        className={styles.loadBtn}
        onClick={() => inputRef.current?.click()}
        disabled={loading}
      >
        Load .nam
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".nam"
        className={styles.hidden}
        onChange={handleChange}
      />
    </div>
  );
}
