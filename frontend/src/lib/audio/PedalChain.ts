import { parseNamFile } from './nam/index';
import type { NamModelData } from './nam/types';
import type { PedalSlot } from '../../types/audio';

// ---------------------------------------------------------------------------
// PedalChain — dynamic chain of NAM pedal AudioWorkletNodes
// ---------------------------------------------------------------------------
// Each pedal is a NAM model (overdrive, fuzz, etc.) running in its own
// nam-processor worklet instance, with dry/wet bypass.
// The chain lives between preGain and the NAM amp node.

interface PedalInstance {
  slot:    PedalSlot;
  dry:     GainNode;
  wet:     GainNode;
  namNode: AudioWorkletNode;
  output:  GainNode;
  model:   NamModelData;
}

export class PedalChain {
  private ctx:     AudioContext;
  input:           GainNode;
  output:          GainNode;
  private pedals:  PedalInstance[] = [];

  constructor(ctx: AudioContext) {
    this.ctx    = ctx;
    this.input  = ctx.createGain();
    this.output = ctx.createGain();
    // Bypass when empty
    this.input.connect(this.output);
  }

  // -------------------------------------------------------------------------
  // Add a pedal at a specific index (or append)
  // -------------------------------------------------------------------------

  async addPedal(modelFile: File, slot: PedalSlot, index?: number): Promise<void> {
    const model = await parseNamFile(modelFile);

    const dry = this.ctx.createGain();
    dry.gain.value = slot.enabled ? 0 : 1;

    const wet = this.ctx.createGain();
    wet.gain.value = slot.enabled ? 1 : 0;

    const output = this.ctx.createGain();

    const namNode = new AudioWorkletNode(this.ctx, 'nam-processor');
    namNode.channelCount = 1;
    namNode.channelCountMode = 'explicit';

    // Send model weights
    const { architecture, config, weights } = model;
    namNode.port.postMessage({ type: 'load-model', architecture, config, weights });

    // Internal wiring: source → dry ──┐
    //                                 ├──→ output
    //              source → nam → wet─┘
    dry.connect(output);
    wet.connect(output);

    const inst: PedalInstance = { slot, dry, wet, namNode, output, model };

    const insertAt = index ?? this.pedals.length;

    // Disconnect current chain
    this._disconnectChain();

    // Insert
    this.pedals.splice(insertAt, 0, inst);

    // Reconnect
    this._connectChain();
  }

  // -------------------------------------------------------------------------
  // Remove a pedal by index
  // -------------------------------------------------------------------------

  removePedal(index: number): void {
    if (index < 0 || index >= this.pedals.length) return;

    this._disconnectChain();

    const inst = this.pedals.splice(index, 1)[0];
    inst.dry.disconnect();
    inst.wet.disconnect();
    inst.output.disconnect();
    inst.namNode.port.postMessage({ type: 'dispose' });
    inst.namNode.disconnect();

    this._connectChain();
  }

  // -------------------------------------------------------------------------
  // Move a pedal from one position to another
  // -------------------------------------------------------------------------

  movePedal(fromIndex: number, toIndex: number): void {
    if (fromIndex < 0 || fromIndex >= this.pedals.length) return;
    if (toIndex < 0 || toIndex >= this.pedals.length) return;

    this._disconnectChain();

    const [inst] = this.pedals.splice(fromIndex, 1);
    this.pedals.splice(toIndex, 0, inst);

    this._connectChain();
  }

  // -------------------------------------------------------------------------
  // Toggle enabled state
  // -------------------------------------------------------------------------

  setEnabled(index: number, enabled: boolean): void {
    const inst = this.pedals[index];
    if (!inst) return;
    inst.slot.enabled = enabled;
    const t = this.ctx.currentTime;
    const ramp = 0.02;
    inst.dry.gain.setTargetAtTime(enabled ? 0 : 1, t, ramp);
    inst.wet.gain.setTargetAtTime(enabled ? 1 : 0, t, ramp);
  }

  // -------------------------------------------------------------------------
  // Accessors
  // -------------------------------------------------------------------------

  getSlots(): PedalSlot[] {
    return this.pedals.map(p => p.slot);
  }

  getLength(): number {
    return this.pedals.length;
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  dispose(): void {
    this._disconnectChain();
    for (const inst of this.pedals) {
      inst.dry.disconnect();
      inst.wet.disconnect();
      inst.output.disconnect();
      inst.namNode.port.postMessage({ type: 'dispose' });
      inst.namNode.disconnect();
    }
    this.pedals = [];
    this.input.disconnect();
    this.output.disconnect();
  }

  // -------------------------------------------------------------------------
  // Private wiring helpers
  // -------------------------------------------------------------------------

  private _disconnectChain(): void {
    // Disconnect input from first pedal (or output if empty)
    this.input.disconnect();

    // Disconnect inter-pedal links
    for (const inst of this.pedals) {
      inst.output.disconnect();
    }
  }

  private _connectChain(): void {
    if (this.pedals.length === 0) {
      this.input.connect(this.output);
      return;
    }

    // input → first pedal
    this.input.connect(this.pedals[0].dry);
    this.input.connect(this.pedals[0].namNode);
    this.pedals[0].namNode.connect(this.pedals[0].wet);

    // inter-pedal
    for (let i = 0; i < this.pedals.length - 1; i++) {
      const curr = this.pedals[i];
      const next = this.pedals[i + 1];
      curr.output.connect(next.dry);
      curr.output.connect(next.namNode);
      next.namNode.connect(next.wet);
    }

    // last pedal → output
    const last = this.pedals[this.pedals.length - 1];
    last.output.connect(this.output);
  }
}
