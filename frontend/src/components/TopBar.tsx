import type { Preset } from '../types/audio';
import LevelMeter from './LevelMeter';
import styles from './TopBar.module.css';

interface Props {
  muted:         boolean;
  audioReady:    boolean;
  activePreset:  Preset | null;
  analyser:      AnalyserNode | null;
  onOpenPresets: () => void;
  onOpenBrowse:  () => void;
  onOpenSettings:() => void;
  onOpenMidi:    () => void;
  midiReady:     boolean;
  onSavePreset:  () => void;
  onUpdatePreset:() => void;
  onToggleMute:  () => void;
  tunerVisible:  boolean;
  onToggleTuner: () => void;
}

export default function TopBar({
  muted, audioReady, activePreset, analyser, midiReady,
  onOpenPresets, onOpenBrowse, onOpenSettings, onOpenMidi,
  onSavePreset, onUpdatePreset, onToggleMute,
  tunerVisible, onToggleTuner,
}: Props) {
  return (
    <header className={styles.bar}>
      <span className={styles.logo}>Amplify</span>
      <div className={styles.divider} />

      {/* Preset */}
      <div className={styles.presetSection}>
        <button
          className={`${styles.presetBtn} ${activePreset ? styles.presetActive : ''}`}
          onClick={onOpenPresets}
          title="Open presets"
        >
          {activePreset ? `◈ ${activePreset.name}` : 'No preset'}
        </button>
        {activePreset && (
          <button className={styles.saveBtn} onClick={onUpdatePreset}>Update</button>
        )}
        <button className={styles.saveBtn} onClick={onSavePreset}>
          {activePreset ? 'Save as new' : 'Save preset'}
        </button>
      </div>

      <div className={styles.divider} />

      {/* Nav */}
      <nav className={styles.nav}>
        <button className={styles.navBtn} onClick={onOpenBrowse}>Browse tones</button>
        <button className={styles.navBtn} onClick={onOpenPresets}>Presets</button>
        <button className={`${styles.navBtn} ${tunerVisible ? styles.navBtnActive : ''}`} onClick={onToggleTuner}>
          Tuner
        </button>
        <button className={styles.navBtn} onClick={onOpenMidi}>
          MIDI{midiReady ? ' ●' : ''}
        </button>
        <button className={styles.navBtn} onClick={onOpenSettings}>Settings</button>
      </nav>

      <div className={styles.divider} />

      {/* Level meter — shows signal even when muted */}
      <div className={styles.meter}>
        <LevelMeter analyserNode={analyser} />
      </div>

      <div className={styles.divider} />

      {audioReady ? (
        <button
          className={muted ? styles.startBtn : styles.stopBtn}
          onClick={onToggleMute}
          title={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? '▶ UNMUTE' : '⏸ MUTE'}
        </button>
      ) : (
        <span className={styles.waitingHint}>click anywhere to start</span>
      )}
    </header>
  );
}
