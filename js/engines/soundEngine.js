/* StandBy Mode Pro - Web Audio API Procedural Sound Synthesizer */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.activeNodes = {};
    this.masterGain = null;
    this.isMuted = false;
    this.tickVolume = 0.75; // Default crisp audible volume (75%)
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
  playAmbient(type) {
    this.stopAmbient();
    if (!type || type === "none") return;

    this.initContext();

    if (type === "rain") {
      this.activeNodes.rain = this.createRainSynthesizer();
    } else if (type === "waves") {
      this.activeNodes.waves = this.createWavesSynthesizer();
    } else if (type === "fire") {
      this.activeNodes.fire = this.createFireSynthesizer();
    } else if (type === "binaural") {
      this.activeNodes.binaural = this.createBinauralSynthesizer();
    } else if (type === "noise") {
      this.activeNodes.noise = this.createPinkNoiseSynthesizer();
    }
  }

  stopAmbient() {
    Object.keys(this.activeNodes).forEach(key => {
      try {
        if (this.activeNodes[key].stop) this.activeNodes[key].stop();
        if (this.activeNodes[key].disconnect) this.activeNodes[key].disconnect();
      } catch (e) {}
    });
    this.activeNodes = {};
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

  createRainSynthesizer() {
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = this.createNoiseBuffer("pink", 5);
    noiseSource.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(800, this.ctx.currentTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, this.ctx.currentTime);

    noiseSource.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noiseSource.start();

    return {
      stop: () => {
        noiseSource.stop();
        noiseSource.disconnect();
      }
    };
  }

  createWavesSynthesizer() {
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = this.createNoiseBuffer("pink", 6);
    noiseSource.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(450, this.ctx.currentTime);

    const lfo = this.ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.12, this.ctx.currentTime);

    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(0.35, this.ctx.currentTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);

    lfo.connect(gain.gain);
    noiseSource.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noiseSource.start();
    lfo.start();

    return {
      stop: () => {
        noiseSource.stop();
        lfo.stop();
      }
    };
  }

  createFireSynthesizer() {
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = this.createNoiseBuffer("brown", 5);
    noiseSource.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(500, this.ctx.currentTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, this.ctx.currentTime);

    noiseSource.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noiseSource.start();

    return {
      stop: () => {
        noiseSource.stop();
      }
    };
  }

  createBinauralSynthesizer() {
    const oscLeft = this.ctx.createOscillator();
    const oscRight = this.ctx.createOscillator();
    const merger = this.ctx.createChannelMerger(2);
    const gain = this.ctx.createGain();

    oscLeft.type = "sine";
    oscLeft.frequency.setValueAtTime(216, this.ctx.currentTime);

    oscRight.type = "sine";
    oscRight.frequency.setValueAtTime(222, this.ctx.currentTime);

    gain.gain.setValueAtTime(0.25, this.ctx.currentTime);

    oscLeft.connect(merger, 0, 0);
    oscRight.connect(merger, 0, 1);
    merger.connect(gain);
    gain.connect(this.masterGain);

    oscLeft.start();
    oscRight.start();

    return {
      stop: () => {
        oscLeft.stop();
        oscRight.stop();
      }
    };
  }

  createPinkNoiseSynthesizer() {
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = this.createNoiseBuffer("pink", 5);
    noiseSource.loop = true;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, this.ctx.currentTime);

    noiseSource.connect(gain);
    gain.connect(this.masterGain);
    noiseSource.start();

    return {
      stop: () => {
        noiseSource.stop();
      }
    };
  }
}

export const soundEngine = new SoundEngine();
