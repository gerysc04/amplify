export interface LSTMConfig {
  hidden_size: number;
  num_layers?: number; // default 1
}

// Each entry in WaveNetConfig.layers
export interface WaveNetLayerConfig {
  input_size:     number;   // 1 for layer 0, prev-layer channels for layer N
  condition_size: number;   // always 1 in practice
  head_size:      number;   // output channels of this layer's head
  channels:       number;   // internal channel count
  kernel_size:    number;   // conv kernel size (typically 3)
  dilations:      number[]; // e.g. [1,2,4,8,16,32,64,128,256,512]
  activation:     string;   // "Tanh"
  gated:          boolean;  // false = plain tanh (no tanh*sigmoid gating)
  head_bias:      boolean;
}

export interface WaveNetConfig {
  layers:     WaveNetLayerConfig[];
  head:       null;
  head_scale: number; // global output scale (e.g. 0.02)
}

export type NamArchitecture = 'LSTM' | 'WaveNet';

export interface NamFile {
  version:      string;
  architecture: NamArchitecture;
  config:       LSTMConfig | WaveNetConfig;
  weights:      number[];
  metadata?:    Record<string, unknown>;
}

// Payload sent to the AudioWorklet
export interface NamModelData {
  architecture: NamArchitecture;
  config:       LSTMConfig | WaveNetConfig;
  weights:      Float32Array;
}
