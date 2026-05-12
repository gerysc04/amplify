import type { MidiMapping, MidiAction } from '../../types/audio';

type ActionHandler = (action: MidiAction) => void;
type RawCCHandler  = (cc: number, value: number, channel: number) => void;

export class MidiManager {
  private _access:   MIDIAccess    | null = null;
  private _mappings: MidiMapping[] = [];
  private _onAction: ActionHandler | null = null;
  private _onRawCC:  RawCCHandler  | null = null;
  private _learning  = false;

  async init(): Promise<boolean> {
    if (!navigator.requestMIDIAccess) return false;
    try {
      this._access = await navigator.requestMIDIAccess({ sysex: false });
      this._attachInputs();
      this._access.onstatechange = () => this._attachInputs();
      return true;
    } catch { return false; }
  }

  private _attachInputs(): void {
    if (!this._access) return;
    for (const input of this._access.inputs.values()) {
      input.onmidimessage = (e) => this._handle(e);
    }
  }

  private _handle(e: MIDIMessageEvent): void {
    if (!e.data || e.data.length < 2) return;
    const status  = e.data[0];
    const data1   = e.data[1];
    const data2   = e.data[2] ?? 0;
    const type    = status & 0xf0;
    const channel = (status & 0x0f) + 1; // 1-based

    if (type === 0xb0) {
      const cc = data1, value = data2;
      this._onRawCC?.(cc, value, channel);
      if (!this._learning) this._dispatchCC(cc, value, channel);
    } else if (type === 0xc0) {
      // Program Change — find a load_preset mapping using PC as index into presets
      this._dispatchPC(data1);
    }
  }

  private _dispatchCC(cc: number, value: number, channel: number): void {
    const norm = value / 127; // always 0–1

    for (const m of this._mappings) {
      if (m.cc !== cc) continue;
      if (m.channel !== 0 && m.channel !== channel) continue;

      if (m.action.type === 'set_param') {
        // Map 0-1 into the user-configured [min, max] range
        const resolved = m.action.min + norm * (m.action.max - m.action.min);
        this._onAction?.({ type: 'set_param', target: m.action.target, min: resolved, max: m.action.max });
      } else {
        this._onAction?.(m.action);
      }
    }
  }

  private _dispatchPC(pc: number): void {
    // PC messages: find first load_preset mapping whose preset index matches
    const m = this._mappings.find((m) => m.action.type === 'load_preset' && m.cc === pc);
    if (m) this._onAction?.(m.action);
  }

  setMappings(mappings: MidiMapping[]): void {
    this._mappings = mappings;
  }

  onAction(handler: ActionHandler): void {
    this._onAction = handler;
  }

  /** Listen for the next incoming CC. Returns promise + cancel. */
  listenForCC(): { promise: Promise<{ cc: number; channel: number }>; cancel: () => void } {
    this._learning = true;
    let res: (v: { cc: number; channel: number }) => void;
    let rej: (e: unknown) => void;
    const promise = new Promise<{ cc: number; channel: number }>((r, j) => { res = r; rej = j; });

    this._onRawCC = (cc, _val, channel) => {
      this._learning = false;
      this._onRawCC  = null;
      res({ cc, channel });
    };

    const cancel = () => {
      this._learning = false;
      this._onRawCC  = null;
      rej(new Error('cancelled'));
    };

    return { promise, cancel };
  }

  get inputNames(): string[] {
    if (!this._access) return [];
    return Array.from(this._access.inputs.values()).map((i) => i.name ?? 'Unknown');
  }

  dispose(): void {
    if (this._access) {
      for (const input of this._access.inputs.values()) input.onmidimessage = null;
    }
    this._access = this._onAction = this._onRawCC = null;
  }
}
