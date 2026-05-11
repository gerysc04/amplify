import type { NamFile, NamModelData, LSTMConfig, WaveNetConfig, WaveNetLayerConfig } from './types';

// ---------------------------------------------------------------------------
// Weight count helpers — must match nam-processor.js parsing exactly
// ---------------------------------------------------------------------------

function lstmWeightCount(cfg: LSTMConfig): number {
  const H = cfg.hidden_size;
  const L = cfg.num_layers ?? 1;
  // Layer 0: wIh[4H×1] wHh[4H×H] bIh[4H] bHh[4H]
  // Layer l>0: wIh[4H×H] wHh[4H×H] bIh[4H] bHh[4H]
  const layer0 = 4 * H + 4 * H * H + 4 * H + 4 * H;
  const layerN = 4 * H * H + 4 * H * H + 4 * H + 4 * H;
  return layer0 + (L - 1) * layerN + H + 1; // + head.weight[H] + head.bias[1]
}

function waveNetLayerWeightCount(layer: WaveNetLayerConfig): number {
  const { input_size, condition_size, channels, kernel_size, dilations, head_size, head_bias } = layer;
  // _rechannel: Conv1d(IS, C, 1, bias=False)
  const rechannel = channels * input_size;
  // Per dilation: _conv [C,C,K]+[C]  _input_mixer [C,CS] (no bias)  _1x1 [C,C]+[C]
  const perBlock = channels * channels * kernel_size + channels  // _conv weight + bias
                 + channels * condition_size                      // _input_mixer weight (no bias)
                 + channels * channels + channels;                // _1x1 weight + bias
  // _head_rechannel: Conv1d(C, HS, 1, bias=head_bias)
  const headRechannel = head_size * channels + (head_bias ? head_size : 0);
  return rechannel + dilations.length * perBlock + headRechannel;
}

function waveNetWeightCount(cfg: WaveNetConfig): number {
  // Sum of all _Layers blocks + 1 scalar for head_scale (stored as last weight)
  return cfg.layers.reduce((sum, layer) => sum + waveNetLayerWeightCount(layer), 0) + 1;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function parseNamFile(file: File): Promise<NamModelData> {
  const text = await file.text();
  const json: NamFile = JSON.parse(text);

  const { architecture, config, weights: rawWeights } = json;

  if (architecture !== 'LSTM' && architecture !== 'WaveNet') {
    throw new Error(`Unsupported NAM architecture: "${architecture}". Supported: LSTM, WaveNet.`);
  }

  const expected =
    architecture === 'LSTM'
      ? lstmWeightCount(config as LSTMConfig)
      : waveNetWeightCount(config as WaveNetConfig);

  if (rawWeights.length !== expected) {
    throw new Error(
      `Weight count mismatch for ${architecture}: ` +
      `got ${rawWeights.length}, expected ${expected}. ` +
      `The model may use an architecture variant not yet supported.`
    );
  }

  return {
    architecture,
    config,
    weights: new Float32Array(rawWeights),
  };
}
