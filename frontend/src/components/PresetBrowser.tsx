import { useRef, useState } from 'react';
import type { Preset } from '../types/audio';
import styles from './PresetBrowser.module.css';

interface Props {
  presets:      Preset[];
  activePreset: Preset | null;
  cachedModels: string[];
  cachedIrs:    string[];
  onLoad:             (preset: Preset) => void;
  onSave:             (name: string) => void;
  onUpdate:           () => void;
  onDelete:           (id: string) => void;
  onExport:           (preset: Preset) => void;
  onImport:           (file: File) => void;
  onDeleteCachedFile: (filename: string) => void;
}

export default function PresetBrowser({
  presets, cachedModels, cachedIrs,
  onLoad, onSave, onDelete, onExport, onImport, onDeleteCachedFile,
}: Props) {
  const [showSave, setShowSave]   = useState(false);
  const [saveName, setSaveName]   = useState('');
  const [showLib,  setShowLib]    = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const handleSave = () => {
    const name = saveName.trim();
    if (!name) return;
    onSave(name);
    setSaveName('');
    setShowSave(false);
  };

  const openSaveAs = (prefill = '') => {
    setSaveName(prefill);
    setShowSave(true);
  };

  const handleImportChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { onImport(file); e.target.value = ''; }
  };

  const totalCached = cachedModels.length + cachedIrs.length;

  return (
    <div className={styles.browser}>

      {/* ---- Header ---- */}
      <div className={styles.header}>
        <span className={styles.title}>PRESETS</span>
        <div className={styles.headerActions}>
          <button className={styles.btn} onClick={() => openSaveAs()}>
            Save current
          </button>
          <button className={styles.btn} onClick={() => importRef.current?.click()}>
            Import
          </button>
          {totalCached > 0 && (
            <button className={styles.btnGhost} onClick={() => setShowLib(!showLib)}>
              Library ({totalCached})
            </button>
          )}
          <a
            className={styles.link}
            href="https://tone3000.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            Get more amps →
          </a>
        </div>
      </div>

      {/* ---- Save row ---- */}
      {showSave && (
        <div className={styles.saveRow}>
          <input
            className={styles.nameInput}
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setShowSave(false); }}
            placeholder="Preset name…"
            autoFocus
          />
          <button className={styles.btnPrimary} onClick={handleSave} disabled={!saveName.trim()}>
            Save
          </button>
          <button className={styles.btnGhost} onClick={() => setShowSave(false)}>
            Cancel
          </button>
        </div>
      )}

      {/* ---- Preset list ---- */}
      <div className={styles.list}>
        {presets.length === 0 ? (
          <p className={styles.empty}>No presets yet — save your current settings above.</p>
        ) : (
          presets.map((p) => (
            <div key={p.id} className={styles.item}>
              <div className={styles.itemInfo}>
                <span className={styles.itemName}>{p.name}</span>
                <span className={`${styles.itemMeta} ${!p.namModel.available ? styles.missing : ''}`}>
                  {p.namModel.available ? p.namModel.filename : `⚠ ${p.namModel.filename} (missing)`}
                </span>
              </div>
              <div className={styles.itemActions}>
                <button className={styles.btnSmall} onClick={() => onLoad(p)}>Load</button>
                <button className={styles.btnSmall} onClick={() => onExport(p)} title="Export as JSON">↓</button>
                <button className={styles.btnSmall} onClick={() => onDelete(p.id)} title="Delete">✕</button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ---- Library panel ---- */}
      {showLib && totalCached > 0 && (
        <div className={styles.library}>
          <span className={styles.libTitle}>CACHED FILES</span>
          {cachedModels.map((f) => (
            <div key={f} className={styles.libItem}>
              <span className={styles.libName}>{f}</span>
              <span className={styles.libTag}>model</span>
              <button className={styles.btnSmall} onClick={() => onDeleteCachedFile(f)}>✕</button>
            </div>
          ))}
          {cachedIrs.map((f) => (
            <div key={f} className={styles.libItem}>
              <span className={styles.libName}>{f}</span>
              <span className={styles.libTag}>IR</span>
              <button className={styles.btnSmall} onClick={() => onDeleteCachedFile(f)}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Hidden file input for import */}
      <input
        ref={importRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleImportChange}
      />
    </div>
  );
}
