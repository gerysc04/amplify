import { useRef } from 'react';
import Modal from './Modal';
import styles from './SettingsModal.module.css';

interface Props {
  inputs:    MediaDeviceInfo[];
  outputs:   MediaDeviceInfo[];
  inputId:   string;
  outputId:  string;
  cachedModels: string[];
  cachedIrs:    string[];
  onInputChange:  (id: string) => void;
  onOutputChange: (id: string) => void;
  onLoadModel:    (file: File) => void;
  onLoadIr:       (file: File) => void;
  onDeleteCached: (filename: string) => void;
  onClose: () => void;
}

export default function SettingsModal({
  inputs, outputs, inputId, outputId,
  cachedModels, cachedIrs,
  onInputChange, onOutputChange,
  onLoadModel, onLoadIr, onDeleteCached,
  onClose,
}: Props) {
  const modelRef = useRef<HTMLInputElement>(null);
  const irRef    = useRef<HTMLInputElement>(null);

  return (
    <Modal title="SETTINGS" onClose={onClose}>
      <div className={styles.root}>
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Audio devices</h3>
          {inputs.length === 0 && outputs.length === 0 && (
            <p className={styles.hint}>Start audio (click anywhere) to detect devices. Browser security requires microphone permission before listing inputs.</p>
          )}
          <label className={styles.label}>Input (guitar)</label>
          <select className={styles.select} value={inputId} onChange={(e) => onInputChange(e.target.value)}>
            <option value="">Default</option>
            {inputs.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId.slice(0, 16) + '…'}</option>)}
          </select>
          <label className={styles.label}>Output</label>
          <select className={styles.select} value={outputId} onChange={(e) => onOutputChange(e.target.value)}>
            <option value="">Default</option>
            {outputs.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId.slice(0, 16) + '…'}</option>)}
          </select>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Local file import</h3>
          <p className={styles.hint}>Local files are cached in your browser and cannot be shared as public presets.</p>
          <div className={styles.importRow}>
            <button className={styles.importBtn} onClick={() => modelRef.current?.click()}>Import .nam model</button>
            <button className={styles.importBtn} onClick={() => irRef.current?.click()}>Import cab IR (.wav)</button>
          </div>
          <input ref={modelRef} type="file" accept=".nam" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) { onLoadModel(f); e.target.value = ''; } }} />
          <input ref={irRef} type="file" accept=".wav" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) { onLoadIr(f); e.target.value = ''; } }} />
        </section>

        {(cachedModels.length > 0 || cachedIrs.length > 0) && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Cached files</h3>
            {[...cachedModels.map(f => ({ f, tag: 'model' })), ...cachedIrs.map(f => ({ f, tag: 'IR' }))].map(({ f, tag }) => (
              <div key={f} className={styles.cacheRow}>
                <span className={styles.cacheName}>{f}</span>
                <span className={styles.cacheTag}>{tag}</span>
                <button className={styles.deleteBtn} onClick={() => onDeleteCached(f)}>✕</button>
              </div>
            ))}
          </section>
        )}
      </div>
    </Modal>
  );
}
