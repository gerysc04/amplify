import { parseNamFile } from './nam/index';
import type { NamModelData } from './nam/types';

export class NamProcessor {
  private workletNode: AudioWorkletNode | null = null;
  private modelData:   NamModelData     | null = null;
  private _loaded = false;

  // ---------------------------------------------------------------------------
  // Model loading (can be called before or after attaching to a worklet)
  // ---------------------------------------------------------------------------

  async loadModel(file: File): Promise<void> {
    this.modelData = await parseNamFile(file);
    this._loaded   = true;
    // If already attached, send immediately
    if (this.workletNode) this._sendToWorklet();
  }

  // ---------------------------------------------------------------------------
  // Worklet lifecycle
  // ---------------------------------------------------------------------------

  attach(workletNode: AudioWorkletNode): void {
    this.workletNode = workletNode;
    // Send pre-loaded model if one exists
    if (this.modelData) this._sendToWorklet();
  }

  detach(): void {
    this.workletNode = null;
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private _sendToWorklet(): void {
    if (!this.workletNode || !this.modelData) return;
    const { architecture, config, weights } = this.modelData;
    // Regular postMessage (copy, not transfer) so modelData stays intact for
    // re-attachment when the user stops and starts audio again.
    this.workletNode.port.postMessage({ type: 'load-model', architecture, config, weights });
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  isLoaded(): boolean { return this._loaded; }

  dispose(): void {
    this.detach();
    this.modelData = null;
    this._loaded   = false;
  }
}
