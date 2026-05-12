import { useCallback, useRef, useState } from 'react';
import type { MidiAction, MidiMapping, MidiSetup, ParamTarget, ToggleTarget } from '../types/audio';
import type { MidiManager } from '../lib/midi/MidiManager';
import Modal from './Modal';
import styles from './MidiController.module.css';

interface Props {
  setups:      MidiSetup[];
  midiManager: MidiManager | null;
  midiReady:   boolean;
  onSaveSetup: (setup: MidiSetup) => void;
  onDeleteSetup: (id: string) => void;
  onActivate:  (id: string) => void;
  onCreateSetup: (name: string) => void;
  onClose:     () => void;
}

const TOGGLE_TARGETS: { value: ToggleTarget; label: string }[] = [
  { value: 'gate',   label: 'Gate on/off'   },
  { value: 'delay',  label: 'Delay on/off'  },
  { value: 'reverb', label: 'Reverb on/off'  },
  { value: 'chorus', label: 'Chorus on/off'  },
  { value: 'wah',    label: 'Wah on/off'     },
  { value: 'whammy', label: 'Whammy on/off'  },
];

const PARAM_TARGETS: { value: ParamTarget; label: string }[] = [
  { value: 'gain',          label: 'Gain'           },
  { value: 'volume',        label: 'Volume'         },
  { value: 'eq.bass',       label: 'EQ Bass'        },
  { value: 'eq.mid',        label: 'EQ Mid'         },
  { value: 'eq.treble',     label: 'EQ Treble'      },
  { value: 'reverb.mix',    label: 'Reverb mix'     },
  { value: 'delay.time',    label: 'Delay time'     },
  { value: 'delay.feedback',label: 'Delay feedback' },
  { value: 'delay.mix',     label: 'Delay mix'      },
  { value: 'chorus.mix',         label: 'Chorus mix'        },
  { value: 'chorus.rate',        label: 'Chorus rate'       },
  { value: 'chorus.depth',       label: 'Chorus depth'      },
  { value: 'gate.threshold',     label: 'Gate threshold'    },
  { value: 'wah.frequency',      label: 'Wah sweep (expr pedal)'    },
  { value: 'whammy.expression',  label: 'Whammy pedal (heel→toe)'  },
  { value: 'whammy.semitones',   label: 'Whammy target (manual)'   },
  { value: 'transpose.semitones',label: 'Transpose'                 },
];

function actionLabel(action: MidiAction): string {
  switch (action.type) {
    case 'toggle':      return `Toggle ${action.target}`;
    case 'set_param':   return `Control ${action.target}`;
    case 'load_preset': return `Load preset`;
  }
}

interface MappingFormProps {
  midiManager: MidiManager | null;
  initial?:    MidiMapping;        // pre-fill for edit mode
  submitLabel: string;
  onSubmit:    (mapping: MidiMapping) => void;
  onCancel?:   () => void;
}

function MappingForm({ midiManager, initial, submitLabel, onSubmit, onCancel }: MappingFormProps) {
  const initAction = initial?.action;
  const [cc,         setCc]         = useState(initial ? String(initial.cc) : '');
  const [channel,    setChannel]    = useState(initial?.channel ?? 0);
  const [actionType, setActionType] = useState<MidiAction['type']>(initAction?.type ?? 'toggle');
  const [toggleTgt,  setToggleTgt]  = useState<ToggleTarget>(
    initAction?.type === 'toggle' ? initAction.target : 'gate',
  );
  const [paramTgt,   setParamTgt]   = useState<ParamTarget>(
    initAction?.type === 'set_param' ? initAction.target : 'gain',
  );
  const [listening,  setListening]  = useState(false);
  const cancelRef = useRef<() => void>(() => {});

  const handleListen = useCallback(async () => {
    if (!midiManager) return;
    setListening(true);
    const { promise, cancel } = midiManager.listenForCC();
    cancelRef.current = cancel;
    try {
      const { cc: c, channel: ch } = await promise;
      setCc(String(c));
      setChannel(ch);
    } catch { /* cancelled */ }
    finally { setListening(false); }
  }, [midiManager]);

  const handleSubmit = () => {
    const ccNum = parseInt(cc, 10);
    if (isNaN(ccNum) || ccNum < 0 || ccNum > 127) return;
    let action: MidiAction;
    if (actionType === 'toggle')     action = { type: 'toggle',    target: toggleTgt };
    else if (actionType === 'set_param') action = { type: 'set_param', target: paramTgt, min: 0, max: 1 };
    else return;
    onSubmit({ id: initial?.id ?? crypto.randomUUID(), cc: ccNum, channel, action });
    if (!initial) setCc('');
  };

  return (
    <div className={styles.formRow}>
      <input
        className={styles.ccBox}
        placeholder="CC#"
        value={cc}
        onChange={(e) => setCc(e.target.value)}
        type="number"
        min={0}
        max={127}
      />
      <button
        className={`${styles.listenBtn} ${listening ? styles.listenActive : ''}`}
        onClick={listening ? () => cancelRef.current() : handleListen}
        disabled={!midiManager}
      >
        {listening ? 'Move a knob…' : 'Learn CC'}
      </button>
      <select className={styles.actionSelect} value={actionType} onChange={(e) => setActionType(e.target.value as MidiAction['type'])}>
        <option value="toggle">Toggle effect</option>
        <option value="set_param">Control param</option>
      </select>
      {actionType === 'toggle' && (
        <select className={styles.actionSelect} value={toggleTgt} onChange={(e) => setToggleTgt(e.target.value as ToggleTarget)}>
          {TOGGLE_TARGETS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      )}
      {actionType === 'set_param' && (
        <select className={styles.actionSelect} value={paramTgt} onChange={(e) => setParamTgt(e.target.value as ParamTarget)}>
          {PARAM_TARGETS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      )}
      <button className={styles.addBtn} onClick={handleSubmit} disabled={!cc.trim()}>{submitLabel}</button>
      {onCancel && <button className={styles.btn} onClick={onCancel}>Cancel</button>}
    </div>
  );
}

export default function MidiController({
  setups, midiManager, midiReady,
  onSaveSetup, onDeleteSetup, onActivate, onCreateSetup, onClose,
}: Props) {
  const [newName,  setNewName]  = useState('');
  const [editingId, setEditingId] = useState<string | null>(null); // "setupId:mappingId"

  const editKey = (setupId: string, mappingId: string) => `${setupId}:${mappingId}`;

  const removeMapping = (setup: MidiSetup, mappingId: string) => {
    onSaveSetup({ ...setup, mappings: setup.mappings.filter((m) => m.id !== mappingId) });
  };

  const addMapping = (setup: MidiSetup, mapping: MidiMapping) => {
    onSaveSetup({ ...setup, mappings: [...setup.mappings, mapping] });
  };

  const updateMapping = (setup: MidiSetup, updated: MidiMapping) => {
    onSaveSetup({ ...setup, mappings: setup.mappings.map((m) => m.id === updated.id ? updated : m) });
    setEditingId(null);
  };

  return (
    <Modal title="MIDI" onClose={onClose}>
      <div className={styles.root}>
        {!midiReady ? (
          <p className={styles.noMidi}>MIDI not available — use Chrome/Edge and allow MIDI access.</p>
        ) : (
          <p className={styles.inputs}>
            {midiManager?.inputNames.length
              ? `Connected: ${midiManager.inputNames.join(', ')}`
              : 'No MIDI devices detected.'}
          </p>
        )}

        {/* Create new setup */}
        <div className={styles.newSetupRow}>
          <input
            className={styles.nameInput}
            placeholder="New setup name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) { onCreateSetup(newName.trim()); setNewName(''); } }}
          />
          <button
            className={styles.btnPrimary}
            disabled={!newName.trim()}
            onClick={() => { onCreateSetup(newName.trim()); setNewName(''); }}
          >
            Create
          </button>
        </div>

        {/* Setup list */}
        <div className={styles.setupList}>
          {setups.map((setup) => (
            <div key={setup.id} className={`${styles.setup} ${setup.is_active ? styles.setupActive : ''}`}>
              <div className={styles.setupHeader}>
                <span className={`${styles.setupName} ${setup.is_active ? styles.setupNameActive : ''}`}>{setup.name}</span>
                {setup.is_active && <span className={styles.activeBadge}>ACTIVE</span>}
                {!setup.is_active && (
                  <button className={styles.btnPrimary} onClick={() => onActivate(setup.id)}>Activate</button>
                )}
                <button className={styles.btnDanger} onClick={() => onDeleteSetup(setup.id)}>Delete</button>
              </div>

              <div className={styles.mappings}>
                {setup.mappings.length === 0
                  ? <p className={styles.noMappings}>No mappings yet — add one below.</p>
                  : setup.mappings.map((m) => {
                    const key = editKey(setup.id, m.id);
                    if (editingId === key) {
                      return (
                        <MappingForm
                          key={m.id}
                          midiManager={midiManager}
                          initial={m}
                          submitLabel="Save"
                          onSubmit={(updated) => updateMapping(setup, updated)}
                          onCancel={() => setEditingId(null)}
                        />
                      );
                    }
                    return (
                      <div key={m.id} className={styles.mapping}>
                        <span className={styles.mappingCc}>CC {m.cc}{m.channel ? ` ch${m.channel}` : ''}</span>
                        <span className={styles.mappingDesc}>{actionLabel(m.action)}</span>
                        <button className={styles.btn} onClick={() => setEditingId(key)} title="Edit">✎</button>
                        <button className={styles.btnDanger} onClick={() => removeMapping(setup, m.id)} title="Delete">✕</button>
                      </div>
                    );
                  })
                }
              </div>

              <MappingForm
                midiManager={midiManager}
                submitLabel="Add"
                onSubmit={(mapping) => addMapping(setup, mapping)}
              />
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
