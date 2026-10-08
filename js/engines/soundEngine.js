/* StandBy Mode Pro - Web Audio API Procedural Sound Synthesizer */

/** Clamps a gain to 0..1. NaN becomes 0 rather than poisoning the graph. */
function clamp01(value) {
  const num = typeof value === "number" ? value : parseFloat(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(1, num));
}

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.activeNodes = {};
    this.masterGain = null;
    this.isMuted = false;
    this.tickVolume = 0.75; // Default crisp audible volume (75%)
    /** E2: the mix the caller asked for, kept so cancelFade can restore it. */
    this.activeMix = {};
    /** E3: pending stopAmbient() from a fade, so it can be cancelled. */
    this._fadeTimer = null;
    /** Lazily built so a context is not required to construct the engine. */
    this._factories = null;
    /**
     * E4: an AnalyserNode tapping the master bus.
     *
     * Created lazily on first request. Wiring it permanently would make the
     * audio graph depend on a visualiser nobody may ever open, and would cost
     * an FFT per sample for a display showing no visualizer.
     */
    this._analyser = null;
  }

  initContext() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.95, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  }

  setVolume(val) {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1, val)), this.ctx.currentTime, 0.05);
    }
  }

  setTickVolume(val) {
    const num = parseFloat(val);
    this.tickVolume = Number.isFinite(num) ? Math.max(0, Math.min(1, num)) : 0.75;
  }

  getTickVolume() {
    return this.tickVolume;
  }

  // Authentic, Crisp & Punchy Mechanical Clock / Flip Tick
  playFlipTick(customVol) {
    const vol = customVol !== undefined ? Math.max(0, Math.min(1, parseFloat(customVol))) : this.tickVolume;
    if (vol <= 0.001) return;

    try {
      this.initContext();
      const t = this.ctx.currentTime;

      // --- Layer 1: High-Frequency Snap / Click Transient ---
      const snapOsc = this.ctx.createOscillator();
      const snapGain = this.ctx.createGain();
      const snapFilter = this.ctx.createBiquadFilter();

      snapFilter.type = "highpass";
      snapFilter.frequency.setValueAtTime(1800, t);

      snapOsc.type = "sine";
      snapOsc.frequency.setValueAtTime(2400, t);
      snapOsc.frequency.exponentialRampToValueAtTime(800, t + 0.015);

      const snapLevel = 0.85 * vol;
      snapGain.gain.setValueAtTime(snapLevel, t);
      snapGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);

      snapOsc.connect(snapFilter);
      snapFilter.connect(snapGain);
      snapGain.connect(this.masterGain);

      snapOsc.start(t);
      snapOsc.stop(t + 0.03);

      // --- Layer 2: Mechanical Gear Body & Resonance Thud ---
      const bodyOsc = this.ctx.createOscillator();
      const bodyGain = this.ctx.createGain();
      const bodyFilter = this.ctx.createBiquadFilter();

      bodyFilter.type = "lowpass";
      bodyFilter.frequency.setValueAtTime(950, t);
      bodyFilter.Q.setValueAtTime(2.0, t);

      bodyOsc.type = "triangle";
      bodyOsc.frequency.setValueAtTime(380, t);
      bodyOsc.frequency.exponentialRampToValueAtTime(90, t + 0.045);

      const bodyLevel = 0.95 * vol;
      bodyGain.gain.setValueAtTime(bodyLevel, t);
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);

      bodyOsc.connect(bodyFilter);
      bodyFilter.connect(bodyGain);
      bodyGain.connect(this.masterGain);

      bodyOsc.start(t);
      bodyOsc.stop(t + 0.055);

      // --- Layer 3: Subtle Noise Texture Impulse ---
      const noiseBuffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 0.02), this.ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.3));
      }
      const noiseSource = this.ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;

      const noiseFilter = this.ctx.createBiquadFilter();
      noiseFilter.type = "bandpass";
      noiseFilter.frequency.setValueAtTime(3200, t);
      noiseFilter.Q.setValueAtTime(1.5, t);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.45 * vol, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);

      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(this.masterGain);

      noiseSource.start(t);
      noiseSource.stop(t + 0.025);

    } catch (e) {}
  }

  // Crisp timer countdown tick
  playTimerTick(customVol) {
    this.playFlipTick(customVol);
  }

  // Play Timer Alarm Chime
  playAlarmChime() {
    this.initContext();
    const frequencies = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    frequencies.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const startTime = this.ctx.currentTime + i * 0.12;

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.6, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 1.2);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(startTime);
      osc.stop(startTime + 1.3);
    });
  }

  // Continuous Ambient Atmosphere Synthesizer

  /**
   * The ambience factory map (FEATURE_PLAN E1).
   *
   * Replaces a five-branch if/else with a lookup, so adding an ambience is one
   * entry here and one row in core/ambiences.js - not a new branch in a
   * dispatcher that grows linearly and is easy to get subtly wrong.
   *
   * Every factory receives a `dest` AudioNode and must connect to THAT rather
   * than to `this.masterGain`. This is what makes E2's per-layer mixer work: a
   * layer can only be faded independently if it has its own GainNode to fade,
   * and it can only have one if the factory was handed somewhere to connect.
   */
  get factories() {
    if (!this._factories) {
      this._factories = {
        rain: (dest) => this.createRainSynthesizer(dest),
        waves: (dest) => this.createWavesSynthesizer(dest),
        forest: (dest) => this.createForestSynthesizer(dest),
        wind: (dest) => this.createWindSynthesizer(dest),
        fire: (dest) => this.createFireSynthesizer(dest),
        thunderstorm: (dest) => this.createThunderstormSynthesizer(dest),
        cafe: (dest) => this.createCafeSynthesizer(dest),
        brownnoise: (dest) => this.createBrownNoiseSynthesizer(dest),
        brownnoiseplus: (dest) => this.createBrownNoisePlusSynthesizer(dest),
        noise: (dest) => this.createPinkNoiseSynthesizer(dest),
        vinyl: (dest) => this.createVinylSynthesizer(dest),
        binaural: (dest) => this.createBinauralSynthesizer(dest)
      };
    }
    return this._factories;
  }

  /** Every ambience id the engine can actually produce. */
  listAmbiences() {
    return Object.keys(this.factories);
  }

  canPlay(id) {
    return Object.prototype.hasOwnProperty.call(this.factories, id);
  }

  /**
   * Starts (or replaces) the ambience mix.
   *
   * E2: `mix` maps ambience id -> 0..1. Layers at 0 are not started at all,
   * which is not the same as started-and-faded - an oscillator running at gain
   * 0 still costs CPU, and on a desk display left on overnight that is the
   * difference between a quiet display and a hot one.
   *
   * @param {Record<string, number>} [mix] Replaces `layers` when given.
   * @returns {string[]} ids actually started.
   */
  playAmbient(mix) {
    const layers = mix || this.activeMix;
    this.stopAmbient();
    if (!layers) return [];

    const ctx = this.initContext();
    if (!ctx) return [];

    const started = [];
    for (const [id, level] of Object.entries(layers)) {
      const factory = this.factories[id];
      // An unknown id is skipped, not fatal: a stale persisted id must not stop
      // the rest of the mix from playing.
      if (!factory) continue;

      const gain = clamp01(level);
      if (gain <= 0.001) continue;

      try {
        const layerGain = ctx.createGain();
        layerGain.gain.value = gain;
        layerGain.connect(this.masterGain);
        this.activeNodes[id] = factory(layerGain);
        started.push(id);
      } catch (err) {
        console.error("[soundEngine] ambience failed:", id, err);
        try { layerGain.disconnect(); } catch (e) { /* already failed */ }
      }
    }
    return started;
  }

  /**
   * Changes one layer's level without restarting it (E2).
   *
   * @returns {boolean} false when the layer is not currently playing, so the
   *   caller knows to start it rather than believing a silent slider worked.
   */
  setLayerVolume(id, level) {
    const layer = this.activeNodes[id];
    if (!layer || !layer.gainNode) return false;
    try {
      const target = clamp01(level);
      layer.gainNode.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
      if (this.activeMix) this.activeMix[id] = target;
      return true;
    } catch (err) {
      console.error("[soundEngine] layer volume failed:", id, err);
      return false;
    }
  }

  /** The full current mix, derived from live layer gains rather than cached. */
  currentMix() {
    const out = {};
    for (const [id, layer] of Object.entries(this.activeNodes)) {
      out[id] = layer && layer.gainNode ? Number(layer.gainNode.gain.value) : 0;
    }
    return out;
  }

  whichLayersArePlaying() {
    return Object.keys(this.activeNodes);
  }

  /**
   * Stops every layer and releases its GainNode.
   *
   * E2's failure mode, stated so it is not reintroduced: stopping a source is
   * not enough. Each layer's GainNode is a node in the graph with an
   * accumulating connection, and a layer that is "stopped" without being
   * disconnected is a leak that survives every later playAmbient() call.
   */
  stopAmbient() {
    const keys = Object.keys(this.activeNodes);
    for (const key of keys) {
      const layer = this.activeNodes[key];
      try {
        if (layer && typeof layer.stop === "function") layer.stop();
      } catch (err) {
        // A source already stopped throws InvalidStateError. That is the
        // desired end state, so it is not reported.
      }
      try {
        if (layer && layer.gainNode) layer.gainNode.disconnect();
      } catch (err) { /* already disconnected */ }
    }
    this.activeNodes = {};
    this.activeMix = {};
  }

  /**
   * Fades the whole mix out, then stops it (FEATURE_PLAN E3, sleep timer).
   *
   * A hard stop on a noise bed is audible as a click and, worse, plays a
   * broadband transient into a quiet room at full level. `setTargetAtTime`
   * with a time constant is the same pattern already used for the master gain,
   * so the ramp is exponential rather than linear and sounds natural.
   *
   * @param {number} seconds Ramp duration.
   * @returns {boolean} false when there is nothing playing.
   */
  fadeOutAmbient(seconds = 30) {
    if (!this.ctx || Object.keys(this.activeNodes).length === 0) return false;
    const ramp = Math.max(0.1, Number(seconds) || 30);
    const now = this.ctx.currentTime;

    for (const layer of Object.values(this.activeNodes)) {
      if (!layer || !layer.gainNode) continue;
      try {
        layer.gainNode.gain.cancelScheduledValues(now);
        layer.gainNode.gain.setValueAtTime(layer.gainNode.gain.value, now);
        // A time constant of ramp/4 reaches ~98% of the target within `ramp`,
        // which is the closest an exponential can get to a linear ramp.
        layer.gainNode.gain.setTargetAtTime(0, now, ramp / 4);
      } catch (err) {
        console.error("[soundEngine] fade failed:", err);
      }
    }

    // Disconnect slightly after the ramp completes, so the audio is genuinely
    // silent before the graph is torn down.
    this._fadeTimer = setTimeout(() => this.stopAmbient(), (ramp + 0.5) * 1000);
    return true;
  }

  /** Cancels a pending fade and restores full level. */
  cancelFade() {
    if (this._fadeTimer) {
      clearTimeout(this._fadeTimer);
      this._fadeTimer = null;
    }
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    for (const layer of Object.values(this.activeNodes)) {
      if (!layer || !layer.gainNode) continue;
      try {
        layer.gainNode.gain.cancelScheduledValues(now);
        layer.gainNode.gain.setValueAtTime(this.activeMix?.[
          Object.keys(this.activeNodes).find((k) => this.activeNodes[k] === layer)
        ] ?? 1, now);
      } catch (err) { /* nothing to restore */ }
    }
    return true;
  }

  createNoiseBuffer(type = "pink", duration = 5) {
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      if (type === "pink") {
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      } else if (type === "brown") {
        b0 = (b0 + (0.02 * white)) / 1.02;
        data[i] = b0 * 3.5;
      } else {
        data[i] = white * 0.2;
      }
    }
    return buffer;
  }

  /**
   * Layer gain level.
   *
   * Since E1/E2 every factory receives a `dest` GainNode and returns the
   * internal gain it controls, so the mixer can fade the layer without
   * restarting it. Internal levels are near 1 because the per-layer value the
   * user set is applied on the `dest` node; keeping them low here would make
   * the two multiply into something unexpectedly quiet.
   */
  createRainSynthesizer(dest) {
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = this.createNoiseBuffer("pink", 5);
    noiseSource.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(800, this.ctx.currentTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(1, this.ctx.currentTime);

    noiseSource.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    noiseSource.start();

    return {
      gainNode: gain,
      stop: () => {
        this.safeStop(noiseSource);
        noiseSource.disconnect();
        filter.disconnect();
        gain.disconnect();
      }
    };
  }

createWavesSynthesizer(dest) {
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = this.createNoiseBuffer("pink", 6);
    noiseSource.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(450, this.ctx.currentTime);

    const lfo = this.ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.12, this.ctx.currentTime);

    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(0.7, this.ctx.currentTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, this.ctx.currentTime);

    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    noiseSource.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    noiseSource.start();
    lfo.start();

    return {
      gainNode: gain,
      stop: () => {
        this.safeStop(noiseSource);
        this.safeStop(lfo);
        noiseSource.disconnect();
        filter.disconnect();
        lfo.disconnect();
        lfoGain.disconnect();
        gain.disconnect();
      }
    };
  }

  /**
   * E1 - Forest: wind through leaves plus sparse birdsong.
   *
   * Birdsong is scheduled, not sampled: short frequency sweeps at randomised
   * intervals. That is a crude approximation of a real bird, and deliberately
   * so - the alternative is a megabyte of samples, and the point of E1 is
   * seven new sounds at zero bandwidth.
   */
  createForestSynthesizer(dest) {
    const t0 = this.ctx.currentTime;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer("pink", 8);
    noise.loop = true;

    // A high band on brown noise reads as rustling leaves rather than wind,
    // which is what separates this from the `wind` layer at similar volume.
    const leafFilter = this.ctx.createBiquadFilter();
    leafFilter.type = "bandpass";
    leafFilter.frequency.setValueAtTime(3200, t0);
    leafFilter.Q.setValueAtTime(0.6, t0);

    const leafGain = this.ctx.createGain();
    leafGain.gain.setValueAtTime(0.5, t0);

    // Slow swell so the bed breathes instead of sitting flat.
    const breathLfo = this.ctx.createOscillator();
    breathLfo.frequency.setValueAtTime(0.07, t0);
    const breathGain = this.ctx.createGain();
    breathGain.gain.setValueAtTime(0.25, t0);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(1, t0);

    breathLfo.connect(breathGain);
    breathGain.connect(leafGain.gain);
    noise.connect(leafFilter);
    leafFilter.connect(leafGain);
    leafGain.connect(gain);
    gain.connect(dest);

    noise.start();
    breathLfo.start();

    // Sparse chirps. Each is its own oscillator, self-stopping, so the list
    // only needs clearing on teardown.
    const chirps = [];
    const chirp = () => {
      if (this._disposed) return;
      const start = this.ctx.currentTime + 0.2 + Math.random() * 5;
      const osc = this.ctx.createOscillator();
      const cg = this.ctx.createGain();
      const f = 1800 + Math.random() * 1600;

      osc.type = "sine";
      osc.frequency.setValueAtTime(f, start);
      // A quick upward sweep is the shape of most small birdsong.
      osc.frequency.exponentialRampToValueAtTime(f * (1.15 + Math.random() * 0.3), start + 0.07);
      osc.frequency.exponentialRampToValueAtTime(f * 0.95, start + 0.16);

      cg.gain.setValueAtTime(0, start);
      cg.gain.linearRampToValueAtTime(0.22, start + 0.02);
      cg.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);

      osc.connect(cg);
      cg.connect(dest);
      osc.start(start);
      osc.stop(start + 0.2);
      chirps.push(osc);
    };

    const chirpTimer = setInterval(chirp, 2600 + Math.random() * 3200);
    chirp();

    return {
      gainNode: gain,
      stop: () => {
        clearInterval(chirpTimer);
        this._disposed = true;
        for (const osc of chirps) this.safeStop(osc);
        this.safeStop(noise);
        this.safeStop(breathLfo);
        noise.disconnect();
        leafFilter.disconnect();
        leafGain.disconnect();
        breathLfo.disconnect();
        breathGain.disconnect();
        gain.disconnect();
      }
    };
  }

  /** E1 - Wind: brown noise with a slow gusting envelope. */
  createWindSynthesizer(dest) {
    const t0 = this.ctx.currentTime;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer("brown", 8);
    noise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(600, t0);

    // Two detuned LFOs beat against each other so the gusting never falls into
    // an obvious repeating period - the giveaway of a single slow LFO.
    const gustA = this.ctx.createOscillator();
    gustA.frequency.setValueAtTime(0.045, t0);
    const gustB = this.ctx.createOscillator();
    gustB.frequency.setValueAtTime(0.071, t0);

    const gustAGain = this.ctx.createGain();
    gustAGain.gain.setValueAtTime(0.35, t0);
    const gustBGain = this.ctx.createGain();
    gustBGain.gain.setValueAtTime(0.22, t0);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.9, t0);

    gustA.connect(gustAGain);
    gustB.connect(gustBGain);
    gustAGain.connect(gain.gain);
    gustBGain.connect(gain.gain);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    noise.start();
    gustA.start();
    gustB.start();

    return {
      gainNode: gain,
      stop: () => {
        this.safeStop(noise);
        this.safeStop(gustA);
        this.safeStop(gustB);
        noise.disconnect();
        filter.disconnect();
        gustA.disconnect();
        gustB.disconnect();
        gustAGain.disconnect();
        gustBGain.disconnect();
        gain.disconnect();
      }
    };
  }

  createFireSynthesizer(dest) {
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = this.createNoiseBuffer("brown", 5);
    noiseSource.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(500, this.ctx.currentTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.9, this.ctx.currentTime);

    // Crackles: short filtered noise bursts at irregular intervals. The
    // irregularity is the point - evenly spaced crackles sound like a machine.
    const crackles = [];
    const crackle = () => {
      if (this._disposed) return;
      const start = this.ctx.currentTime + Math.random() * 0.35;
      const burst = this.ctx.createBufferSource();
      burst.buffer = this.createNoiseBuffer("white", 0.04);
      const bf = this.ctx.createBiquadFilter();
      bf.type = "bandpass";
      bf.frequency.setValueAtTime(1200 + Math.random() * 2400, start);
      const bg = this.ctx.createGain();
      bg.gain.setValueAtTime(0, start);
      bg.gain.linearRampToValueAtTime(0.35 + Math.random() * 0.3, start + 0.005);
      bg.gain.exponentialRampToValueAtTime(0.0001, start + 0.05);
      burst.connect(bf);
      bf.connect(bg);
      bg.connect(dest);
      burst.start(start);
      burst.stop(start + 0.06);
      crackles.push(burst);
      if (crackles.length > 60) crackles.splice(0, 30);
    };

    const crackleTimer = setInterval(crackle, 120);
    crackle();

    noiseSource.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    noiseSource.start();

    return {
      gainNode: gain,
      stop: () => {
        clearInterval(crackleTimer);
        this._disposed = true;
        for (const burst of crackles) this.safeStop(burst);
        this.safeStop(noiseSource);
        noiseSource.disconnect();
        filter.disconnect();
        gain.disconnect();
      }
    };
  }

  /**
   * E1 - Thunder: distant thunder over a rain bed.
   *
   * Each rumble is a low-passed brown-noise burst with a long decay. Kept
   * deliberately sparse and low-frequency so it reads as distant rather than
   * as a crack, which would be startling rather than atmospheric.
   */
  createThunderstormSynthesizer(dest) {
    const t0 = this.ctx.currentTime;

    const rain = this.ctx.createBufferSource();
    rain.buffer = this.createNoiseBuffer("pink", 8);
    rain.loop = true;
    const rainFilter = this.ctx.createBiquadFilter();
    rainFilter.type = "lowpass";
    rainFilter.frequency.setValueAtTime(700, t0);
    const rainGain = this.ctx.createGain();
    rainGain.gain.setValueAtTime(0.45, t0);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(1, t0);

    rain.connect(rainFilter);
    rainFilter.connect(rainGain);
    rainGain.connect(gain);
    gain.connect(dest);
    rain.start();

    const strikes = [];
    const strike = () => {
      if (this._disposed) return;
      const start = this.ctx.currentTime + 0.3;
      const source = this.ctx.createBufferSource();
      source.buffer = this.createNoiseBuffer("brown", 3);
      const low = this.ctx.createBiquadFilter();
      low.type = "lowpass";
      low.frequency.setValueAtTime(220, start);
      const sg = this.ctx.createGain();
      sg.gain.setValueAtTime(0, start);
      sg.gain.linearRampToValueAtTime(0.9, start + 0.12);
      // A 2.5 s decay is what makes it read as distance.
      sg.gain.exponentialRampToValueAtTime(0.0001, start + 2.5);
      source.connect(low);
      low.connect(sg);
      sg.connect(dest);
      source.start(start);
      source.stop(start + 2.6);
      strikes.push(source);
      if (strikes.length > 8) strikes.splice(0, 4);
    };

    const strikeTimer = setInterval(strike, 7000 + Math.random() * 9000);
    // First strike after a short delay, so mounting the layer is not itself
    // the loud event.
    setTimeout(strike, 1400);

    return {
      gainNode: gain,
      stop: () => {
        clearInterval(strikeTimer);
        this._disposed = true;
        for (const source of strikes) this.safeStop(source);
        this.safeStop(rain);
        rain.disconnect();
        rainFilter.disconnect();
        rainGain.disconnect();
        gain.disconnect();
      }
    };
  }

  /**
   * E1 - Cafe: band-limited chatter.
   *
   * This is a masker, and it works for a specific reason: babble is dense and
   * non-predictable in the speech band, so the ear cannot separate a voice from
   * it. Modelled as brown noise through a narrow band around 500 Hz plus a
   * second formant band, with a slow random walk so it never settles.
   */
  createCafeSynthesizer(dest) {
    const t0 = this.ctx.currentTime;

    const source = this.ctx.createBufferSource();
    source.buffer = this.createNoiseBuffer("brown", 8);
    source.loop = true;

    // Formant 1: the vowel body of speech.
    const f1 = this.ctx.createBiquadFilter();
    f1.type = "bandpass";
    f1.frequency.setValueAtTime(500, t0);
    f1.Q.setValueAtTime(4, t0);

    // Formant 2: a higher, narrower band that adds the "sibilance" edge.
    const f2 = this.ctx.createBiquadFilter();
    f2.type = "bandpass";
    f2.frequency.setValueAtTime(1800, t0);
    f2.Q.setValueAtTime(6, t0);

    // A random walk on the band centre is what turns a flat noise bed into
    // something that sounds like many voices rather than one hiss.
    const walk = this.ctx.createOscillator();
    walk.type = "sine";
    walk.frequency.setValueAtTime(0.13, t0);
    const walkGain = this.ctx.createGain();
    walkGain.gain.setValueAtTime(180, t0);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.85, t0);

    walk.connect(walkGain);
    walkGain.connect(f1.frequency);
    source.connect(f1);
    source.connect(f2);
    f1.connect(gain);
    f2.connect(gain);
    gain.connect(dest);

    source.start();
    walk.start();

    return {
      gainNode: gain,
      stop: () => {
        this.safeStop(source);
        this.safeStop(walk);
        source.disconnect();
        f1.disconnect();
        f2.disconnect();
        walk.disconnect();
        walkGain.disconnect();
        gain.disconnect();
      }
    };
  }

  createBrownNoiseSynthesizer(dest) {
    const source = this.ctx.createBufferSource();
    source.buffer = this.createNoiseBuffer("brown", 6);
    source.loop = true;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(1, this.ctx.currentTime);

    source.connect(gain);
    gain.connect(dest);
    source.start();

    return {
      gainNode: gain,
      stop: () => {
        this.safeStop(source);
        source.disconnect();
        gain.disconnect();
      }
    };
  }

  /**
   * E1 - Brown noise plus a low sine undertone.
   *
   * The sine sits near 40 Hz, at the bottom of where most laptop speakers
   * reproduce anything. On those it is nearly inaudible, so this reads as
   * "a bit more brown noise" - which is a reasonable outcome, not a failure.
   * The stated limitation is preferable to boosting a band the hardware
   * cannot play.
   */
  createBrownNoisePlusSynthesizer(dest) {
    const t0 = this.ctx.currentTime;

    const source = this.ctx.createBufferSource();
    source.buffer = this.createNoiseBuffer("brown", 6);
    source.loop = true;

    const tone = this.ctx.createOscillator();
    tone.type = "sine";
    tone.frequency.setValueAtTime(40, t0);

    const toneGain = this.ctx.createGain();
    toneGain.gain.setValueAtTime(0.35, t0);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.75, t0);

    source.connect(gain);
    tone.connect(toneGain);
    toneGain.connect(gain);
    gain.connect(dest);

    source.start();
    tone.start();

    return {
      gainNode: gain,
      stop: () => {
        this.safeStop(source);
        this.safeStop(tone);
        source.disconnect();
        tone.disconnect();
        toneGain.disconnect();
        gain.disconnect();
      }
    };
  }

  createPinkNoiseSynthesizer(dest) {
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = this.createNoiseBuffer("pink", 5);
    noiseSource.loop = true;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(1, this.ctx.currentTime);

    noiseSource.connect(gain);
    gain.connect(dest || this.masterGain);
    noiseSource.start();

    return {
      gainNode: gain,
      stop: () => {
        this.safeStop(noiseSource);
        noiseSource.disconnect();
        gain.disconnect();
      }
    };
  }

  /**
   * E1 - Vinyl: surface noise with sparse crackle.
   *
   * The continuous part is a high band on white noise; the crackle is the same
   * technique the fire layer uses, at a much lower rate. Looping the same
   * buffer would give a periodic hiss, which is the giveaway.
   */
  createVinylSynthesizer(dest) {
    const t0 = this.ctx.currentTime;

    const surface = this.ctx.createBufferSource();
    surface.buffer = this.createNoiseBuffer("white", 6);
    surface.loop = true;

    const hiss = this.ctx.createBiquadFilter();
    hiss.type = "highpass";
    hiss.frequency.setValueAtTime(2200, t0);

    // A low hum under it, which is what a turntable's motor contributes.
    const hum = this.ctx.createOscillator();
    hum.type = "sine";
    hum.frequency.setValueAtTime(50, t0); // 50 Hz mains, and its 100 Hz harmonic
    const humGain = this.ctx.createGain();
    humGain.gain.setValueAtTime(0.08, t0);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, t0);

    surface.connect(hiss);
    hiss.connect(gain);
    hum.connect(humGain);
    humGain.connect(gain);
    gain.connect(dest);

    surface.start();
    hum.start();

    const pops = [];
    const pop = () => {
      if (this._disposed) return;
      const start = this.ctx.currentTime + Math.random() * 0.8;
      const burst = this.ctx.createBufferSource();
      burst.buffer = this.createNoiseBuffer("white", 0.02);
      const pg = this.ctx.createGain();
      pg.gain.setValueAtTime(0, start);
      pg.gain.linearRampToValueAtTime(0.2 + Math.random() * 0.25, start + 0.004);
      pg.gain.exponentialRampToValueAtTime(0.0001, start + 0.03);
      burst.connect(pg);
      pg.connect(dest);
      burst.start(start);
      burst.stop(start + 0.04);
      pops.push(burst);
      if (pops.length > 40) pops.splice(0, 20);
    };

    const popTimer = setInterval(pop, 900 + Math.random() * 1400);
    pop();

    return {
      gainNode: gain,
      stop: () => {
        clearInterval(popTimer);
        this._disposed = true;
        for (const burst of pops) this.safeStop(burst);
        this.safeStop(surface);
        this.safeStop(hum);
        surface.disconnect();
        hiss.disconnect();
        hum.disconnect();
        humGain.disconnect();
        gain.disconnect();
      }
    };
  }

  createBinauralSynthesizer(dest) {
    const oscLeft = this.ctx.createOscillator();
    const oscRight = this.ctx.createOscillator();
    const merger = this.ctx.createChannelMerger(2);
    const gain = this.ctx.createGain();

    oscLeft.type = "sine";
    oscLeft.frequency.setValueAtTime(216, this.ctx.currentTime);

    oscRight.type = "sine";
    oscRight.frequency.setValueAtTime(222, this.ctx.currentTime);

    gain.gain.setValueAtTime(0.6, this.ctx.currentTime);

    oscLeft.connect(merger, 0, 0);
    oscRight.connect(merger, 0, 1);
    merger.connect(gain);
    gain.connect(dest || this.masterGain);

    oscLeft.start();
    oscRight.start();

    return {
      gainNode: gain,
      stop: () => {
        this.safeStop(oscLeft);
        this.safeStop(oscRight);
        oscLeft.disconnect();
        oscRight.disconnect();
        merger.disconnect();
        gain.disconnect();
      }
    };
  }

  /**
   * Stops an AudioScheduledSourceNode without throwing.
   *
   * Calling stop() twice throws InvalidStateError, and a layer can easily be
   * stopped twice: once by stopAmbient() and once by a pending fade timer.
   * That end state is what we want, so the error is not interesting.
   */
  safeStop(node) {
    try {
      if (node && typeof node.stop === "function") node.stop();
    } catch (err) {
      /* already stopped - the desired end state */
    }
  }

  // ------------------------------------------------- E4: analyser for visuals

  /**
   * The master-bus analyser, created on first use (E4).
   *
   * Deliberately created lazily and NOT wired into the permanent graph: an
   * AnalyserNode costs an FFT per sample, and paying that for a display with
   * no visualizer selected would be spending CPU on nothing.
   *
   * @returns {AnalyserNode|null}
   */
  getAnalyser() {
    const ctx = this.initContext();
    if (!ctx) return null;
    if (this._analyser) return this._analyser;

    try {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      // Light smoothing. Without it the bars jitter at frame rate and read as
      // noise rather than as a response to the sound.
      analyser.smoothingTimeConstant = 0.8;
      this.masterGain.connect(analyser);
      this._analyser = analyser;
      this._freqData = new Uint8Array(analyser.frequencyBinCount);
      return analyser;
    } catch (err) {
      console.warn("[soundEngine] analyser unavailable:", err);
      return null;
    }
  }

  /**
   * Energy bands for the beat-reactive visualiser (E4).
   *
   * NOT a beat detector. The plan is explicit that this must be driven by the
   * AnalyserNode's energy bands, because the app's audio is synthesised noise
   * and tone with no defined beat - a BPM detector on a noise bed returns
   * confident nonsense.
   *
   * @returns {{ bass: number, mid: number, treble: number, level: number }}
   *   Each 0..1. All zeros when no audio is playing or the analyser is
   *   unavailable, so the visualiser renders a flat line rather than NaN.
   */
  readEnergyBands() {
    const analyser = this.getAnalyser();
    if (!analyser || !this._freqData) {
      return { bass: 0, mid: 0, treble: 0, level: 0 };
    }
    if (Object.keys(this.activeNodes).length === 0 && !this.masterGain) {
      return { bass: 0, mid: 0, treble: 0, level: 0 };
    }

    try {
      analyser.getByteFrequencyData(this._freqData);
      const data = this._freqData;
      const n = data.length;
      if (!n) return { bass: 0, mid: 0, treble: 0, level: 0 };

      // Bin ranges chosen for the 0..~11 kHz span of a 256-point FFT at
      // 48 kHz. Sub-bass is where noise beds have their energy, which is what
      // the visualiser should be reacting to.
      const bassEnd = Math.max(1, Math.floor(n * 0.06));
      const midEnd = Math.max(bassEnd + 1, Math.floor(n * 0.25));

      let bass = 0;
      for (let i = 0; i < bassEnd; i++) bass += data[i];
      let mid = 0;
      for (let i = bassEnd; i < midEnd; i++) mid += data[i];
      let treble = 0;
      for (let i = midEnd; i < n; i++) treble += data[i];

      bass /= bassEnd * 255;
      mid /= (midEnd - bassEnd) * 255;
      treble /= (n - midEnd) * 255;

      let total = 0;
      for (let i = 0; i < n; i++) total += data[i];
      const level = total / (n * 255);

      return {
        bass: Math.max(0, Math.min(1, bass)),
        mid: Math.max(0, Math.min(1, mid)),
        treble: Math.max(0, Math.min(1, treble)),
        level: Math.max(0, Math.min(1, level))
      };
    } catch (err) {
      return { bass: 0, mid: 0, treble: 0, level: 0 };
    }
  }

  /** Releases the analyser connection. */
  disposeAnalyser() {
    if (this._analyser) {
      try { this.masterGain?.disconnect(this._analyser); } catch (err) { /* gone */ }
      try { this._analyser.disconnect(); } catch (err) { /* gone */ }
    }
    this._analyser = null;
    this._freqData = null;
  }
}

export const soundEngine = new SoundEngine();

