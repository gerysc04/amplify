import { useRef } from 'react';
import type { Preset } from '../types/audio';
import Modal from './Modal';
import styles from './PresetsModal.module.css';

interface Props {
  presets:      Preset[];
  activePreset: Preset | null;
  onLoad:       (p: Preset) => void;
  onDelete:     (id: string) => void;
  onExport:     (p: Preset) => void;
  onImport:     (file: File) => void;
  onClose:      () => void;
}

export default function PresetsModal({ presets, activePreset, onLoad, onDelete, onExport, onImport, onClose }: Props) {
  const importRef = useRef<HTMLInputElement>(null);

  return (
    <Modal title="PRESETS" onClose={onClose}>
      <div className={styles.root}>
        <div className={styles.actions}>
          <button className={styles.actionBtn} onClick={() => importRef.current?.click()}>Import .json</button>
          <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) { onImport(f); e.target.value = ''; } }} />
        </div>

        {presets.length === 0 ? (
          <p className={styles.empty}>No presets yet — save your current settings from the top bar.</p>
        ) : (
          <div className={styles.list}>
            {presets.map((p) => (
              <div key={p.id} className={`${styles.item} ${activePreset?.id === p.id ? styles.active : ''}`}>
                <div className={styles.info}>
                  <span className={styles.name}>{p.name}</span>
                  <span className={styles.meta}>
                    {p.namModel.title ?? p.namModel.filename ?? 'No amp'}
                    {!p.namModel.available && p.namModel.filename && ' ⚠'}
                  </span>
                </div>
                <div className={styles.itemActions}>
                  <button className={styles.btn} onClick={() => onLoad(p)}>Load</button>
                  <button className={styles.btn} onClick={() => onExport(p)} title="Export">↓</button>
                  <button className={styles.btnDanger} onClick={() => onDelete(p.id)} title="Delete">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
