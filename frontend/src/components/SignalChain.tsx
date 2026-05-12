import type { ToneRef } from '../types/audio';
import { WHAMMY_MODES } from '../types/audio';
import type { GateParams, EqParams, DelayParams, ReverbParams, ChorusParams, WahParams, TransposeParams, WhammyParams } from '../lib/audio/AudioEngine';
import EffectsRack from './EffectsRack';
import Knob from './knobs/Knob';
import { GearIcon } from './GearIcon';
import styles from './SignalChain.module.css';

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-pressed={on} style={{
      width: 28, height: 16, borderRadius: 8, border: 'none', cursor: 'pointer',
      background: on ? '#c8c8c8' : '#2a2a2a', transition: 'background 0.15s',
    }} />
  );
}

const dbToKnob = (db: number) => (db + 12) / 24;
const knobToDb = (k: number)  => k * 24 - 12;

interface Props {
  namModel:  ToneRef;
  cabIR:     ToneRef;
  isFullRig: boolean;
  gain:      number;
  volume:    number;
  gate:      GateParams;
  eq:        EqParams;
  wah:       WahParams;
  transpose: TransposeParams;
  whammy:    WhammyParams;
  delay:     DelayParams;
  reverb:    ReverbParams;
  chorus:    ChorusParams;
  onGainChange:    (v: number) => void;
  onVolumeChange:  (v: number) => void;
  onGate:          (p: GateParams)   => void;
  onEq:            (p: EqParams)     => void;
  onWah:           (p: WahParams)       => void;
  onTranspose:     (p: TransposeParams) => void;
  onWhammy:        (p: WhammyParams)    => void;
  onDelay:         (p: DelayParams)  => void;
  onReverb:        (p: ReverbParams) => void;
  onChorus:        (p: ChorusParams) => void;
  onClickAmp:      () => void;
  onClickCab:      () => void;
}

export default function SignalChain({
  namModel, cabIR, isFullRig,
  gain, volume, gate, eq, wah, transpose, whammy, delay, reverb, chorus,
  onGainChange, onVolumeChange, onGate, onEq, onWah, onTranspose, onWhammy,
  onDelay, onReverb, onChorus,
  onClickAmp, onClickCab,
}: Props) {
  return (
    <div className={styles.chain}>

      {/* Gate */}
      <div className={styles.gateSlot}>
        <div className={styles.gateHeader}>
          <span className={styles.gateLabel}>Gate</span>
          <Toggle on={gate.enabled} onClick={() => onGate({ ...gate, enabled: !gate.enabled })} />
        </div>
        <Knob
          value={(gate.threshold - 0.001) / (0.1 - 0.001)}
          onChange={(v) => onGate({ ...gate, threshold: 0.001 + v * (0.1 - 0.001) })}
          label="Thresh"
          size={48}
        />
      </div>

      <div className={styles.arrow}>›</div>

      {/* Wah */}
      <div className={styles.gateSlot}>
        <div className={styles.gateHeader}>
          <span className={styles.gateLabel}>Wah</span>
          <Toggle on={wah.enabled} onClick={() => onWah({ ...wah, enabled: !wah.enabled })} />
        </div>
        <Knob value={wah.frequency} onChange={(v) => onWah({ ...wah, frequency: v, enabled: wah.enabled })} label="Sweep" size={48} />
      </div>

      <div className={styles.arrow}>›</div>

      {/* Transpose */}
      <div className={styles.gateSlot}>
        <div className={styles.gateHeader}>
          <span className={styles.gateLabel}>Transpose</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => onTranspose({ semitones: Math.max(-24, transpose.semitones - 1) })}
            style={{ background: 'transparent', border: '1px solid #2a2a2a', borderRadius: 3, color: '#555', width: 22, height: 22, cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
          >−</button>
          <span style={{ fontSize: 12, color: transpose.semitones === 0 ? '#333' : '#aaa', minWidth: 36, textAlign: 'center', fontFamily: 'monospace' }}>
            {transpose.semitones > 0 ? `+${transpose.semitones}` : transpose.semitones}st
          </span>
          <button
            onClick={() => onTranspose({ semitones: Math.min(24, transpose.semitones + 1) })}
            style={{ background: 'transparent', border: '1px solid #2a2a2a', borderRadius: 3, color: '#555', width: 22, height: 22, cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
          >+</button>
        </div>
      </div>

      <div className={styles.arrow}>›</div>

      {/* Whammy */}
      <div className={styles.gateSlot}>
        <div className={styles.gateHeader}>
          <span className={styles.gateLabel}>Whammy</span>
          <Toggle on={whammy.enabled} onClick={() => onWhammy({ ...whammy, enabled: !whammy.enabled })} />
        </div>
        <select
          value={whammy.mode}
          onChange={(e) => {
            const m = WHAMMY_MODES.find((x) => x.value === e.target.value)!;
            onWhammy({ ...whammy, mode: m.value, semitones: m.value === 'custom' ? whammy.semitones : m.semitones });
          }}
          style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 3, color: '#888', fontSize: 10, padding: '3px 4px', width: '100%', outline: 'none' }}
        >
          {WHAMMY_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        {whammy.mode === 'custom' && (
          <Knob
            value={(whammy.semitones + 24) / 48}
            onChange={(v) => onWhammy({ ...whammy, semitones: Math.round(v * 48 - 24) })}
            label={`${whammy.semitones > 0 ? '+' : ''}${whammy.semitones}st`}
            size={40}
            defaultValue={0.5}
          />
        )}
        {/* Expression position — driven by MIDI CC, also draggable */}
        <Knob
          value={whammy.expression}
          onChange={(v) => onWhammy({ ...whammy, expression: v })}
          label="Pedal"
          size={40}
        />
      </div>

      <div className={styles.arrow}>›</div>

      {/* Amp — horizontal layout */}
      <div className={styles.ampSlot} onClick={onClickAmp} title="Click to browse amps">
        {/* Left: visual + info */}
        <div className={styles.ampLeft}>
          <div className={styles.ampVisual}>
            <GearIcon type={namModel.gearType ?? 'amp'} size={72} />
          </div>
          <div className={styles.ampInfo}>
            <span className={styles.slotLabel}>Amp</span>
            {namModel.title
              ? <div className={styles.slotName}>{namModel.title}</div>
              : <div className={styles.slotEmpty}>No amp — click to browse</div>
            }
          </div>
        </div>

        {/* Right: 3×2 knob grid */}
        <div className={styles.ampKnobs} onClick={(e) => e.stopPropagation()}>
          <Knob value={gain}                 onChange={onGainChange}                                          label="Gain"   size={44} />
          <Knob value={dbToKnob(eq.bass)}    onChange={(k) => onEq({ ...eq, bass:   knobToDb(k) })}          label="Bass"   size={44} defaultValue={0.5} />
          <Knob value={dbToKnob(eq.mid)}     onChange={(k) => onEq({ ...eq, mid:    knobToDb(k) })}          label="Mid"    size={44} defaultValue={0.5} />
          <Knob value={dbToKnob(eq.treble)}  onChange={(k) => onEq({ ...eq, treble: knobToDb(k) })}          label="Treble" size={44} defaultValue={0.5} />
          <Knob value={reverb.mix}           onChange={(k) => onReverb({ ...reverb, mix: k, enabled: k > 0 })} label="Reverb" size={44} />
          <Knob value={volume}               onChange={onVolumeChange}                                        label="Volume" size={44} defaultValue={0.8} />
        </div>
      </div>

      {!isFullRig && <div className={styles.arrow}>›</div>}

      {/* Cab */}
      {!isFullRig && (
        <div className={styles.cabSlot} onClick={onClickCab} title="Click to browse cabs">
          <div className={styles.cabVisual}>
            <GearIcon type="ir" size={60} />
          </div>
          <div className={styles.ampInfo}>
            <span className={styles.slotLabel}>Cabinet IR</span>
            {cabIR.title
              ? <div className={styles.slotName}>{cabIR.title}</div>
              : <div className={styles.slotEmpty}>No cab</div>
            }
          </div>
        </div>
      )}

      <div className={styles.arrow}>›</div>

      {/* Effects */}
      <div className={styles.effectsSlot}>
        <div className={styles.effectsSlotInner}>
          <EffectsRack
            gate={gate}     onGate={onGate}
            eq={eq}         onEq={onEq}
            delay={delay}   onDelay={onDelay}
            reverb={reverb} onReverb={onReverb}
            chorus={chorus} onChorus={onChorus}
            hideGate hideEq
          />
        </div>
      </div>

    </div>
  );
}
