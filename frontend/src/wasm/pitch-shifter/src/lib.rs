use wasm_bindgen::prelude::*;
use std::f32::consts::PI;

const TARGET_FREQUENCY: f32 = 13.0;
const VOICES: usize = 4;
const GAIN_CORRECTION: f32 = 2.0 / VOICES as f32;
const MIN_PITCH_FREQ: f32 = 50.0;
const MAX_PITCH_FREQ: f32 = 1500.0;

// ============================================================
// One-Pole Lowpass Filter
// ============================================================

struct OnePoleFilter {
    b1: f32,
    z: f32,
}

impl OnePoleFilter {
    fn new(sample_rate: f32, cutoff_freq: f32) -> Self {
        Self {
            b1: (-std::f32::consts::TAU * cutoff_freq * sample_rate.recip()).exp(),
            z: 0.0,
        }
    }
    fn process(&mut self, input: f32) -> f32 {
        let a0 = 1.0 - self.b1;
        self.z = input * a0 + self.z * self.b1;
        self.z
    }
}

// ============================================================
// Delay Line with Spline Interpolation
// ============================================================

struct DelayLine {
    buffer: Vec<f32>,
    mask: usize,
    write_ptr: usize,
    sample_rate: f32,
}

impl DelayLine {
    fn new(length_ms: f32, sample_rate: f32) -> Self {
        let samples = (length_ms * 0.001 * sample_rate).ceil() as usize;
        let size = samples.next_power_of_two();
        Self {
            buffer: vec![0.0f32; size],
            mask: size - 1,
            write_ptr: 0,
            sample_rate,
        }
    }
    fn write(&mut self, value: f32) {
        self.buffer[self.write_ptr] = value;
        self.write_ptr = (self.write_ptr + 1) & self.mask;
    }
    fn read_spline(&self, time_ms: f32) -> f32 {
        let delay_samps = (time_ms * 0.001 * self.sample_rate).max(2.0);
        let read_pos = (self.write_ptr + self.buffer.len()) as f32 - delay_samps;
        let idx = read_pos.floor() as i32;
        let frac = read_pos - idx as f32;

        let i0 = (idx as usize) & self.mask;
        let i1 = ((idx + 1) as usize) & self.mask;
        let i2 = ((idx + 2) as usize) & self.mask;
        let i3 = ((idx + 3) as usize) & self.mask;

        let w = self.buffer[i0];
        let x = self.buffer[i1];
        let y = self.buffer[i2];
        let z = self.buffer[i3];

        let c0 = x;
        let c1 = 0.5 * (y - w);
        let c2 = w - 2.5 * x + 2.0 * y - 0.5 * z;
        let c3 = 0.5 * (z - w) + 1.5 * (x - y);

        ((c3 * frac + c2) * frac + c1) * frac + c0
    }
}

// ============================================================
// Zero-Crossing Pitch Detector
// ============================================================

struct PitchDetector {
    sample_rate: f32,
    filter: OnePoleFilter,
    prev_sign: f32,
    counter: f32,
    frequency: f32,
}

impl PitchDetector {
    fn new(sample_rate: f32) -> Self {
        Self {
            sample_rate,
            filter: OnePoleFilter::new(sample_rate, 20.0),
            prev_sign: 0.0,
            counter: 0.0,
            frequency: 100.0,
        }
    }
    fn process(&mut self, input: f32) -> f32 {
        self.counter += 1.0;
        let filtered = self.filter.process(input);
        let sign = if filtered > 0.0 { 1.0 } else { 0.0 };
        let zero_cross = (sign - self.prev_sign).abs() > 0.5;
        self.prev_sign = sign;

        if zero_cross {
            let freq = self.sample_rate / self.counter;
            if freq > MIN_PITCH_FREQ && freq < MAX_PITCH_FREQ {
                self.frequency = freq;
            }
            self.counter = 0.0;
        }
        self.frequency
    }
}

// ============================================================
// Phasor (0 → 1 ramp)
// ============================================================

fn phasor_advance(x: f32, freq: f32, sample_period: f32) -> f32 {
    let v = x + freq * sample_period;
    if v >= 1.0 { v - 1.0 } else { v }
}

// ============================================================
// Grain (single voice)
// ============================================================

struct Grain {
    freq: f32,
    window_size: f32,
    ramp: f32,
    ramp_active: bool,
    phase_offset: f32,
    prev_phase: f32,
    sample_period: f32,
}

impl Grain {
    fn new(sample_rate: f32, index: usize) -> Self {
        Self {
            freq: TARGET_FREQUENCY,
            window_size: 1000.0 / TARGET_FREQUENCY,
            ramp: 0.0,
            ramp_active: false,
            phase_offset: index as f32 / VOICES as f32,
            prev_phase: 0.0,
            sample_period: sample_rate.recip(),
        }
    }

    fn process(&mut self, delay_line: &DelayLine, phasor: f32, grain_freq: f32, speed: f32) -> f32 {
        let phase = wrap(phasor + self.phase_offset);
        let delta = phase - self.prev_phase;
        self.prev_phase = phase;

        let trigger = delta.abs() > 0.5;
        if trigger {
            self.freq = grain_freq;
            self.window_size = 1000.0 / grain_freq;
            self.ramp = 0.0;
            self.ramp_active = true;
        } else if self.ramp_active {
            let step = self.freq * speed * self.sample_period;
            self.ramp += step;
            if self.ramp >= 1.0 {
                self.ramp = 1.0;
                self.ramp_active = false;
            }
        }

        let time = self.ramp * self.window_size;
        let window = (self.ramp * PI).sin() * (phase * PI).sin();
        delay_line.read_spline(time) * window
    }
}

fn wrap(input: f32) -> f32 {
    if input >= 1.0 {
        input - 1.0
    } else {
        input
    }
}

// ============================================================
// Granular Shifter Core
// ============================================================

fn get_grain_freq(detected_freq: f32) -> f32 {
    let divider = ((detected_freq / TARGET_FREQUENCY / 4.0).trunc() * 4.0).max(4.0);
    detected_freq / divider
}

struct GranularShifter {
    use_pitch_detect: bool,
    delay_line: DelayLine,
    pitch_detector: PitchDetector,
    grains: [Grain; VOICES],
    phasor: f32,
    target_speed: f32,
    current_speed: f32,
    sample_period: f32,
    semitones_smoother: OnePoleFilter,
}

impl GranularShifter {
    fn new(sample_rate: f32, use_pitch_detect: bool) -> Self {
        let grains: [Grain; VOICES] = std::array::from_fn(|i| Grain::new(sample_rate, i));
        Self {
            use_pitch_detect,
            delay_line: DelayLine::new(200.0, sample_rate),
            pitch_detector: PitchDetector::new(sample_rate),
            grains,
            phasor: 0.0,
            target_speed: 1.0,
            current_speed: 1.0,
            sample_period: sample_rate.recip(),
            semitones_smoother: OnePoleFilter::new(sample_rate, 100.0),
        }
    }

    fn set_semitones(&mut self, semitones: f32) {
        let speed = 2.0f32.powf(semitones.clamp(-24.0, 24.0) / 12.0);
        self.target_speed = speed;
    }

    fn process(&mut self, input: &[f32], output: &mut [f32]) {
        // Smooth speed parameter to avoid zipper noise
        self.current_speed = self.semitones_smoother.process(self.target_speed);

        for i in 0..input.len() {
            let s = input[i];

            let grain_freq = if self.use_pitch_detect {
                get_grain_freq(self.pitch_detector.process(s))
            } else {
                TARGET_FREQUENCY
            };

            self.phasor = phasor_advance(self.phasor, grain_freq * self.current_speed, self.sample_period);

            let mut sum = 0.0f32;
            for grain in self.grains.iter_mut() {
                sum += grain.process(&self.delay_line, self.phasor, grain_freq, self.current_speed);
            }

            output[i] = sum * GAIN_CORRECTION;
            self.delay_line.write(s);
        }
    }
}

// ============================================================
// TransposeShifter — fixed pitch shift, no pitch detection
// ============================================================

#[wasm_bindgen]
pub struct TransposeShifter {
    core: GranularShifter,
}

#[wasm_bindgen]
impl TransposeShifter {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: f32) -> Self {
        Self {
            core: GranularShifter::new(sample_rate, false),
        }
    }
    pub fn set_semitones(&mut self, semitones: f32) {
        self.core.set_semitones(semitones);
    }
    pub fn process(&mut self, input: &[f32], output: &mut [f32]) {
        self.core.process(input, output);
    }
}

// ============================================================
// WhammyShifter — expression pedal, with pitch detection
// ============================================================

#[wasm_bindgen]
pub struct WhammyShifter {
    core: GranularShifter,
}

#[wasm_bindgen]
impl WhammyShifter {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: f32) -> Self {
        Self {
            core: GranularShifter::new(sample_rate, true),
        }
    }
    pub fn set_semitones(&mut self, semitones: f32) {
        self.core.set_semitones(semitones);
    }
    pub fn process(&mut self, input: &[f32], output: &mut [f32]) {
        self.core.process(input, output);
    }
}
