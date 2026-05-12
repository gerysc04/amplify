import Knob from './knobs/Knob';
import type { GateParams, EqParams, DelayParams, ReverbParams, ChorusParams, CompressorParams } from '../lib/audio/AudioEngine';
import styles from './EffectsRack.module.css';

// ---- value↔param mapping helpers ----------------------------------------

// Gate threshold: knob 0-1 → linear amplitude 0.001–0.3
const threshToKnob  = (t: number) => Math.sqrt((t - 0.001) / 0.299);
const knobToThresh  = (k: number) => 0.001 + k * k * 0.299;

// Delay time: 0-1 → 50ms–600ms
const timeToKnob    = (t: number) => (t - 0.05) / 0.55;
const knobToTime    = (k: number) => 0.05 + k * 0.55;

// Chorus rate: 0-1 → 0.1–4 Hz
const rateToKnob    = (r: number) => (r - 0.1) / 3.9;
const knobToRate    = (k: number) => 0.1 + k * 3.9;

// Chorus depth: 0-1 → 1ms–15ms
const depthToKnob   = (d: number) => (d - 0.001) / 0.014;
const knobToDepth   = (k: number) => 0.001 + k * 0.014;

// Compressor mappings
const threshDbToKnob = (db: number) => (db + 40) / 40;  // -40..0 dB
const knobToThreshDb = (k: number) => k * 40 - 40;
const ratioToKnob    = (r: number) => (r - 1) / 19;      // 1..20
const knobToRatio    = (k: number) => 1 + k * 19;
const attackToKnob   = (a: number) => (a - 0.001) / 0.099; // 1ms..100ms
const knobToAttack   = (k: number) => 0.001 + k * 0.099;
const releaseToKnob  = (r: number) => (r - 0.01) / 0.99;  // 10ms..1s
const knobToRelease  = (k: number) => 0.01 + k * 0.99;
const kneeToKnob     = (db: number) => db / 12;           // 0..12 dB
const knobToKnee     = (k: number) => k * 12;

// ---- Sub-components -------------------------------------------------------

interface ToggleProps {
  on: boolean;
  onClick: () => void;
}
function Toggle({ on, onClick }: ToggleProps) {
  return (
    <button
      className={`${styles.toggle} ${on ? styles.on : ''}`}
      onClick={onClick}
      aria-pressed={on}
      title={on ? 'Enabled' : 'Disabled'}
    />
  );
}

// ---- Main component -------------------------------------------------------

// EQ: ±12 dB
const dbToKnob = (db: number) => (db + 12) / 24;
const knobToDb = (k: number)  => k * 24 - 12;

interface Props {
  gate:     GateParams;
  onGate:   (p: GateParams)   => void;
  eq:       EqParams;
  onEq:     (p: EqParams)     => void;
  compressor?: CompressorParams;
  onCompressor?: (p: CompressorParams) => void;
  delay:    DelayParams;
  onDelay:  (p: DelayParams)  => void;
  reverb:   ReverbParams;
  onReverb: (p: ReverbParams) => void;
  chorus:   ChorusParams;
  onChorus: (p: ChorusParams) => void;
  hideGate?: boolean;
  hideEq?:   boolean;
}

export default function EffectsRack({ gate, onGate, eq, onEq, compressor, onCompressor, delay, onDelay, reverb, onReverb, chorus, onChorus, hideGate, hideEq }: Props) {
  return (
    <div className={styles.rack}>

      {/* ---- GATE ---- */}
      {!hideGate && (
      <div className={styles.effect}>
        <div className={styles.header}>
          <Toggle on={gate.enabled} onClick={() => onGate({ ...gate, enabled: !gate.enabled })} />
          <span className={styles.name}>GATE</span>
        </div>
        <div className={styles.knobs}>
          <Knob
            label="Thresh"
            value={threshToKnob(gate.threshold)}
            onChange={(k) => onGate({ ...gate, threshold: knobToThresh(k) })}
            defaultValue={threshToKnob(0.02)}
          />
        </div>
      </div>
      )}

      {/* ---- COMPRESSOR ---- */}
      {compressor && onCompressor && (
      <div className={styles.effect}>
        <div className={styles.header}>
          <Toggle on={compressor.enabled} onClick={() => onCompressor({ ...compressor, enabled: !compressor.enabled })} />
          <span className={styles.name}>COMP</span>
        </div>
        <div className={styles.knobs}>
          <Knob
            label="Thresh"
            value={threshDbToKnob(compressor.threshold)}
            onChange={(k) => onCompressor({ ...compressor, threshold: knobToThreshDb(k) })}
            defaultValue={threshDbToKnob(-20)}
          />
          <Knob
            label="Ratio"
            value={ratioToKnob(compressor.ratio)}
            onChange={(k) => onCompressor({ ...compressor, ratio: knobToRatio(k) })}
            defaultValue={ratioToKnob(4)}
          />
          <Knob
            label="Attack"
            value={attackToKnob(compressor.attack)}
            onChange={(k) => onCompressor({ ...compressor, attack: knobToAttack(k) })}
            defaultValue={attackToKnob(0.003)}
          />
          <Knob
            label="Release"
            value={releaseToKnob(compressor.release)}
            onChange={(k) => onCompressor({ ...compressor, release: knobToRelease(k) })}
            defaultValue={releaseToKnob(0.15)}
          />
          <Knob
            label="Knee"
            value={kneeToKnob(compressor.knee)}
            onChange={(k) => onCompressor({ ...compressor, knee: knobToKnee(k) })}
            defaultValue={kneeToKnob(3)}
          />
        </div>
      </div>
      )}

      {/* ---- EQ ---- */}
      {!hideEq && <div className={styles.effect}>
        <div className={styles.header}>
          <span className={styles.name}>EQ</span>
        </div>
        <div className={styles.knobs}>
          <Knob label="Bass"   value={dbToKnob(eq.bass)}   onChange={(k) => onEq({ ...eq, bass:   knobToDb(k) })} defaultValue={0.5} />
          <Knob label="Mid"    value={dbToKnob(eq.mid)}    onChange={(k) => onEq({ ...eq, mid:    knobToDb(k) })} defaultValue={0.5} />
          <Knob label="Treble" value={dbToKnob(eq.treble)} onChange={(k) => onEq({ ...eq, treble: knobToDb(k) })} defaultValue={0.5} />
        </div>
      </div>}

      {/* ---- DELAY ---- */}
      <div className={styles.effect}>
        <div className={styles.header}>
          <Toggle on={delay.enabled} onClick={() => onDelay({ ...delay, enabled: !delay.enabled })} />
          <span className={styles.name}>DELAY</span>
        </div>
        <div className={styles.knobs}>
          <Knob
            label="Time"
            value={timeToKnob(delay.time)}
            onChange={(k) => onDelay({ ...delay, time: knobToTime(k) })}
            defaultValue={timeToKnob(0.3)}
          />
          <Knob
            label="Fdbk"
            value={delay.feedback / 0.85}
            onChange={(k) => onDelay({ ...delay, feedback: k * 0.85 })}
            defaultValue={0.35 / 0.85}
          />
          <Knob
            label="Mix"
            value={delay.mix}
            onChange={(k) => onDelay({ ...delay, mix: k })}
            defaultValue={0.3}
          />
        </div>
      </div>

      {/* ---- REVERB ---- */}
      <div className={styles.effect}>
        <div className={styles.header}>
          <Toggle on={reverb.enabled} onClick={() => onReverb({ ...reverb, enabled: !reverb.enabled })} />
          <span className={styles.name}>REVERB</span>
        </div>
        <div className={styles.knobs}>
          <Knob
            label="Mix"
            value={reverb.mix}
            onChange={(k) => onReverb({ ...reverb, mix: k })}
            defaultValue={0.25}
          />
        </div>
      </div>

      {/* ---- CHORUS ---- */}
      <div className={styles.effect}>
        <div className={styles.header}>
          <Toggle on={chorus.enabled} onClick={() => onChorus({ ...chorus, enabled: !chorus.enabled })} />
          <span className={styles.name}>CHORUS</span>
        </div>
        <div className={styles.knobs}>
          <Knob
            label="Rate"
            value={rateToKnob(chorus.rate)}
            onChange={(k) => onChorus({ ...chorus, rate: knobToRate(k) })}
            defaultValue={rateToKnob(1.5)}
          />
          <Knob
            label="Depth"
            value={depthToKnob(chorus.depth)}
            onChange={(k) => onChorus({ ...chorus, depth: knobToDepth(k) })}
            defaultValue={depthToKnob(0.005)}
          />
          <Knob
            label="Mix"
            value={chorus.mix}
            onChange={(k) => onChorus({ ...chorus, mix: k })}
            defaultValue={0.3}
          />
        </div>
      </div>

    </div>
  );
}
