/* StandBy Mode Pro - Complete Universal Standalone Application (Compatible with file:// and http://) */

(() => {

// --- store.js ---

const STORAGE_KEY = "standby_mode_pro_v1";

const defaultState = {
  activeSpaceId: "home",
  keepScreenAwake: true,
  spaces: {
    home: {
      id: "home",
      name: "Home",
      icon: "home",
      layout: "standalone",
      clockId: "flip",
      widgets: ["weather", "calendar"],
      quadWidgets: ["weather", "calendar", "media", "timer"],
      vibe: "none",
      themeColor: "#3b82f6"
    },
    work: {
      id: "work",
      name: "Work",
      icon: "briefcase",
      layout: "duo",
      clockId: "day",
      widgets: ["calendar", "todo"],
      quadWidgets: ["day", "calendar", "todo", "tally"],
      vibe: "binaural",
      themeColor: "#10b981"
    },
    focus: {
      id: "focus",
      name: "Focus",
      icon: "target",
      layout: "focus",
      clockId: "flip",
      widgets: ["timer", "quote"],
      quadWidgets: ["flip", "timer", "quote", "todo"],
      vibe: "rain",
      themeColor: "#a855f7"
    },
    night: {
      id: "night",
      name: "Night",
      icon: "moon",
      layout: "standalone",
      clockId: "segmented",
      widgets: ["weather", "timer"],
      quadWidgets: ["segmented", "weather", "timer", "vibes"],
      vibe: "waves",
      themeColor: "#ff3b30"
    }
  },
  clockConfig: {
    is24Hour: false,
    showSeconds: true,
    showDate: true,
    fontFamily: "var(--font-sans)",
    accentColor: "#3b82f6",
    glowIntensity: 1,
    tickSound: true
  },
  pomoState: {
    stage: "focus",
    remainingSeconds: 1500,
    totalSeconds: 1500,
    isRunning: false,
    currentCycle: 1,
    totalCompletedSessions: 0,
    settings: {
      focusDuration: 25,
      shortBreakDuration: 5,
      longBreakDuration: 15,
      longBreakInterval: 4,
      autoStartBreaks: false,
      autoStartPomo: false,
      tickSound: true,
      alarmSound: true
    }
  },
  nightMode: {
    enabled: false,
    tint: "red",
    dimLevel: 0.75
  },
  burnInProtection: {
    enabled: true,
    intervalMinutes: 1
  },
  screensaver: {
    enabled: true,
    idleSeconds: 120,
    style: "clock"
  },
  vibes: {
    activeTrack: "none",
    volume: 0.65,
    visualizer: "stars"
  },
  mediaState: {
    isPlaying: false,
    currentTrackIndex: 0,
    progressPercent: 35,
    volume: 0.8
  },
  todos: [
    { id: "1", text: "Morning Deep Focus Sprint", completed: true },
    { id: "2", text: "Architecture & Code Review", completed: false },
    { id: "3", text: "Pomodoro Milestone 4/4", completed: false },
    { id: "4", text: "Evening Walk & Recharge", completed: false }
  ],
  tallies: {
    focusSessions: 4,
    water: 3
  }
};

class Store {
  constructor() {
    this.listeners = new Set();
    this.state = this.loadState();
  }

  loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...defaultState,
          ...parsed,
          keepScreenAwake: parsed.keepScreenAwake !== undefined ? parsed.keepScreenAwake : true,
          pomoState: {
            ...defaultState.pomoState,
            ...(parsed.pomoState || {}),
            settings: {
              ...defaultState.pomoState.settings,
              ...((parsed.pomoState && parsed.pomoState.settings) || {})
            }
          }
        };
      }
    } catch (e) {
      console.warn("LocalStorage unavailable:", e);
    }
    return defaultState;
  }

  saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {}
  }

  getState() {
    return this.state;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(key, payload) {
    this.saveState();
    for (const listener of this.listeners) {
      try {
        listener(key, payload, this.state);
      } catch (err) {
        console.error("Store listener error:", err);
      }
    }
  }

  toggleScreenWakeLock(force) {
    this.state.keepScreenAwake = force !== undefined ? force : !this.state.keepScreenAwake;
    this.notify("wake_lock_toggled", this.state.keepScreenAwake);
  }

  setActiveSpace(spaceId) {
    if (this.state.spaces[spaceId]) {
      this.state.activeSpaceId = spaceId;
      const space = this.state.spaces[spaceId];
      if (space.vibe && space.vibe !== "none") {
        this.state.vibes.activeTrack = space.vibe;
      }
      this.notify("space_changed", space);
    }
  }

  getActiveSpace() {
    return this.state.spaces[this.state.activeSpaceId] || this.state.spaces.home;
  }

  updateActiveSpace(updates) {
    const spaceId = this.state.activeSpaceId;
    this.state.spaces[spaceId] = { ...this.state.spaces[spaceId], ...updates };
    this.notify("space_updated", this.state.spaces[spaceId]);
  }

  setLayout(layout) {
    this.updateActiveSpace({ layout });
  }

  setClock(clockId) {
    this.updateActiveSpace({ clockId });
  }

  setWidgets(widgets) {
    this.updateActiveSpace({ widgets });
  }

  updateClockConfig(updates) {
    this.state.clockConfig = { ...this.state.clockConfig, ...updates };
    this.notify("clock_config_updated", this.state.clockConfig);
  }

  // --- Pomodoro State Actions ---
  setPomoStage(stage, manualMinutes = null) {
    const s = this.state.pomoState;
    s.stage = stage;
    s.isRunning = false;
    let minutes = manualMinutes;
    if (minutes === null) {
      if (stage === "focus") minutes = s.settings.focusDuration;
      else if (stage === "shortBreak") minutes = s.settings.shortBreakDuration;
      else if (stage === "longBreak") minutes = s.settings.longBreakDuration;
    }
    s.remainingSeconds = minutes * 60;
    s.totalSeconds = minutes * 60;
    this.notify("pomo_updated", s);
  }

  togglePomoRunning(force) {
    const s = this.state.pomoState;
    s.isRunning = force !== undefined ? force : !s.isRunning;
    this.notify("pomo_updated", s);
  }

  tickPomo() {
    const s = this.state.pomoState;
    if (!s.isRunning) return false;
    if (s.remainingSeconds > 0) {
      s.remainingSeconds--;
      this.notify("pomo_tick", s);
      return false;
    } else {
      // Stage finished
      s.isRunning = false;
      if (s.stage === "focus") {
        s.totalCompletedSessions++;
        const isLong = (s.totalCompletedSessions % s.settings.longBreakInterval) === 0;
        s.stage = isLong ? "longBreak" : "shortBreak";
        const nextMin = isLong ? s.settings.longBreakDuration : s.settings.shortBreakDuration;
        s.remainingSeconds = nextMin * 60;
        s.totalSeconds = nextMin * 60;
        if (s.settings.autoStartBreaks) s.isRunning = true;
      } else {
        // Break finished
        s.stage = "focus";
        s.remainingSeconds = s.settings.focusDuration * 60;
        s.totalSeconds = s.settings.focusDuration * 60;
        if (s.settings.autoStartPomo) s.isRunning = true;
      }
      this.notify("pomo_completed", s);
      return true;
    }
  }

  resetPomo() {
    const s = this.state.pomoState;
    s.isRunning = false;
    let minutes = s.settings.focusDuration;
    if (s.stage === "shortBreak") minutes = s.settings.shortBreakDuration;
    else if (s.stage === "longBreak") minutes = s.settings.longBreakDuration;
    s.remainingSeconds = minutes * 60;
    s.totalSeconds = minutes * 60;
    this.notify("pomo_updated", s);
  }

  updatePomoSettings(newSettings) {
    const s = this.state.pomoState;
    s.settings = { ...s.settings, ...newSettings };
    if (!s.isRunning) {
      this.resetPomo();
    }
    this.notify("pomo_settings_updated", s);
  }

  toggleNightMode(forceState) {
    this.state.nightMode.enabled = forceState !== undefined ? forceState : !this.state.nightMode.enabled;
    this.notify("night_mode_toggled", this.state.nightMode);
  }

  setVibe(vibeId) {
    this.state.vibes.activeTrack = vibeId;
    this.updateActiveSpace({ vibe: vibeId });
    this.notify("vibe_changed", this.state.vibes);
  }

  setVisualizer(visId) {
    this.state.vibes.visualizer = visId;
    this.notify("visualizer_changed", visId);
  }

  toggleTodo(id) {
    this.state.todos = this.state.todos.map(t => t.id === id ? { ...t, completed: !t.completed } : t);
    this.notify("todos_updated", this.state.todos);
  }

  addTodo(text) {
    if (!text || !text.trim()) return;
    const newTodo = { id: Date.now().toString(), text: text.trim(), completed: false };
    this.state.todos.push(newTodo);
    this.notify("todos_updated", this.state.todos);
  }

  deleteTodo(id) {
    this.state.todos = this.state.todos.filter(t => t.id !== id);
    this.notify("todos_updated", this.state.todos);
  }

  incrementTally(key, step = 1) {
    this.state.tallies[key] = (this.state.tallies[key] || 0) + step;
    this.notify("tally_updated", this.state.tallies);
  }

  resetTally(key) {
    this.state.tallies[key] = 0;
    this.notify("tally_updated", this.state.tallies);
  }
}

var store = window.standbyStore || (window.standbyStore = new Store());


// --- db.js ---

/* StandBy Mode Pro - IndexedDB Photo Gallery Adapter */

const DB_NAME = "StandByPhotosDB";
const DB_VERSION = 1;
const STORE_NAME = "user_photos";

class PhotoDB {
  constructor() {
    this.db = null;
    this.initPromise = this.init();
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
        }
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };

      request.onerror = (e) => {
        console.error("IndexedDB error:", e);
        reject(e);
      };
    });
  }

  async getAllPhotos() {
    await this.initPromise;
    return new Promise((resolve) => {
      if (!this.db) return resolve([]);
      const tx = this.db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }

  async addPhoto(dataUrl, title = "Custom Photo") {
    await this.initPromise;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const item = { dataUrl, title, timestamp: Date.now() };
      const req = store.add(item);
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e);
    });
  }

  async deletePhoto(id) {
    await this.initPromise;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e);
    });
  }
}

var photoDB = window.standbyPhotoDB || (window.standbyPhotoDB = new PhotoDB());


// --- soundEngine.js ---

/* StandBy Mode Pro - Web Audio API Procedural Sound Synthesizer */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.activeNodes = {};
    this.masterGain = null;
    this.isMuted = false;
  }

  initContext() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.65, this.ctx.currentTime);
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

  // Play subtle mechanical flip click
  playFlipTick() {
    try {
      this.initContext();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      filter.type = "bandpass";
      filter.frequency.setValueAtTime(1400, this.ctx.currentTime);
      filter.Q.setValueAtTime(3.0, this.ctx.currentTime);

      osc.type = "triangle";
      osc.frequency.setValueAtTime(180, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.035);

      gain.gain.setValueAtTime(0.35, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.035);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.04);
    } catch (e) {
      // Audio context might require initial user gesture
    }
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
      gain.gain.linearRampToValueAtTime(0.4, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 1.2);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(startTime);
      osc.stop(startTime + 1.3);
    });
  }

  // Continuous Ambient Atmosphere Synthesizer (Rain, Waves, Fire, Binaural, Noise)
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

  // Procedural Noise Buffer Generator
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

    // LFO for wave modulation
    const lfo = this.ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.12, this.ctx.currentTime); // Wave every 8 seconds

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
    oscLeft.frequency.setValueAtTime(216, this.ctx.currentTime); // 432Hz base octave

    oscRight.type = "sine";
    oscRight.frequency.setValueAtTime(222, this.ctx.currentTime); // 6Hz Theta binaural beat for deep focus

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

var soundEngine = window.standbySoundEngine || (window.standbySoundEngine = new SoundEngine());


// --- visualizerEngine.js ---

/* StandBy Mode Pro - Procedural HTML5 Canvas Visualizer Engine */

class VisualizerEngine {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.currentMode = "stars"; // 'none', 'stars', 'matrix', 'waves', 'aurora'
    this.animationId = null;
    this.particles = [];
    this.matrixColumns = [];
  }

  init(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext("2d");
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.setMode(this.currentMode);
  }

  resize() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.initParticles();
  }

  setMode(mode) {
    this.currentMode = mode || "none";
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    if (this.currentMode === "none") return;

    this.initParticles();
    this.animate();
  }

  initParticles() {
    if (!this.canvas) return;
    const w = this.canvas.width;
    const h = this.canvas.height;

    if (this.currentMode === "stars") {
      this.particles = Array.from({ length: 120 }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        size: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.8 + 0.2,
        speed: Math.random() * 0.2 + 0.05
      }));
    } else if (this.currentMode === "matrix") {
      const fontSize = 16;
      const columns = Math.floor(w / fontSize);
      this.matrixColumns = Array.from({ length: columns }, () => Math.floor(Math.random() * -50));
    } else if (this.currentMode === "waves") {
      this.particles = Array.from({ length: 80 }, (_, i) => ({
        x: (w / 80) * i,
        baseY: h * 0.75,
        speed: 0.02 + Math.random() * 0.02,
        phase: i * 0.1
      }));
    }
  }

  animate() {
    if (!this.ctx || !this.canvas || this.currentMode === "none") return;

    const w = this.canvas.width;
    const h = this.canvas.height;

    if (this.currentMode === "stars") {
      this.ctx.clearRect(0, 0, w, h);
      this.particles.forEach(p => {
        p.y -= p.speed;
        if (p.y < 0) p.y = h;
        this.ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity * Math.sin(Date.now() * 0.002 + p.x)})`;
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        this.ctx.fill();
      });
    } else if (this.currentMode === "matrix") {
      this.ctx.fillStyle = "rgba(10, 10, 12, 0.08)";
      this.ctx.fillRect(0, 0, w, h);
      this.ctx.fillStyle = "#00ff66";
      this.ctx.font = "14px monospace";

      this.matrixColumns.forEach((y, i) => {
        const char = String.fromCharCode(0x30a0 + Math.floor(Math.random() * 96));
        const x = i * 16;
        this.ctx.fillText(char, x, y * 16);

        if (y * 16 > h && Math.random() > 0.975) {
          this.matrixColumns[i] = 0;
        } else {
          this.matrixColumns[i] = y + 1;
        }
      });
    } else if (this.currentMode === "waves") {
      this.ctx.clearRect(0, 0, w, h);
      this.ctx.strokeStyle = "rgba(99, 102, 241, 0.35)";
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();

      const time = Date.now() * 0.002;
      for (let x = 0; x < w; x += 10) {
        const y = h * 0.7 + Math.sin(x * 0.005 + time) * 40 + Math.sin(x * 0.01 + time * 1.5) * 20;
        if (x === 0) this.ctx.moveTo(x, y);
        else this.ctx.lineTo(x, y);
      }
      this.ctx.stroke();
    } else if (this.currentMode === "aurora") {
      this.ctx.clearRect(0, 0, w, h);
      const time = Date.now() * 0.0008;
      const grad = this.ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, `rgba(16, 185, 129, ${0.1 + Math.sin(time) * 0.05})`);
      grad.addColorStop(0.5, `rgba(59, 130, 246, ${0.15 + Math.cos(time) * 0.08})`);
      grad.addColorStop(1, `rgba(168, 85, 247, ${0.1 + Math.sin(time * 0.7) * 0.05})`);

      this.ctx.fillStyle = grad;
      this.ctx.fillRect(0, 0, w, h);
    }

    this.animationId = requestAnimationFrame(() => this.animate());
  }
}

var visualizerEngine = window.standbyVisualizerEngine || (window.standbyVisualizerEngine = new VisualizerEngine());


// --- wakeLockEngine.js ---



class WakeLockEngine {
  constructor() {
    this.wakeLock = null;
    this.isSupported = "wakeLock" in navigator;
    this.init();
  }

  init() {
    if (!this.isSupported) {
      console.warn("Screen Wake Lock API not supported in this browser.");
      return;
    }

    // Auto-acquire lock if enabled in store
    if (store.getState().keepScreenAwake) {
      this.acquire();
    }

    // Re-acquire lock if user switches back to this tab
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && store.getState().keepScreenAwake) {
        this.acquire();
      }
    });

    store.subscribe((event) => {
      if (event === "wake_lock_toggled") {
        if (store.getState().keepScreenAwake) {
          this.acquire();
        } else {
          this.release();
        }
      }
    });
  }

  async acquire() {
    if (!this.isSupported) return false;
    try {
      if (this.wakeLock !== null && !this.wakeLock.released) return true;
      this.wakeLock = await navigator.wakeLock.request("screen");
      this.wakeLock.addEventListener("release", () => {
        this.wakeLock = null;
      });
      return true;
    } catch (err) {
      console.warn("WakeLock request failed:", err);
      return false;
    }
  }

  async release() {
    if (this.wakeLock !== null) {
      try {
        await this.wakeLock.release();
        this.wakeLock = null;
      } catch (err) {}
    }
  }

  isActive() {
    return this.wakeLock !== null && !this.wakeLock.released;
  }
}

var wakeLockEngine = window.standbyWakeLockEngine || (window.standbyWakeLockEngine = new WakeLockEngine());


// --- clockEngine.js ---

/* StandBy Mode Pro - Modular Clock Engine Registry */

class ClockEngine {
  constructor() {
    this.registry = new Map();
    this.activeInstance = null;
    this.activeClockId = null;
    this.container = null;
    this.timerId = null;
  }

  register(id, clockDefinition) {
    this.registry.set(id, clockDefinition);
  }

  getClockList() {
    return Array.from(this.registry.entries()).map(([id, clock]) => ({
      id,
      name: clock.name,
      description: clock.description,
      category: clock.category || "Modern"
    }));
  }

  mount(clockId, containerElement, config) {
    this.unmount();
    this.container = containerElement;
    this.activeClockId = clockId;

    const clock = this.registry.get(clockId) || this.registry.get("flip");
    if (!clock) return;

    this.container.innerHTML = "";
    this.activeInstance = clock.mount(this.container, config);

    // Immediate first tick
    this.tick(config);

    // High accuracy tick interval (every 250ms for snappy seconds)
    this.timerId = setInterval(() => this.tick(config), 250);
  }

  tick(config) {
    if (!this.activeInstance) return;
    const now = new Date();
    const is24 = config ? config.is24Hour : false;

    let hours = now.getHours();
    let ampm = "";
    if (!is24) {
      ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12 || 12;
    }
    const hoursStr = String(hours).padStart(2, "0");
    const minutesStr = String(now.getMinutes()).padStart(2, "0");
    const secondsStr = String(now.getSeconds()).padStart(2, "0");

    this.activeInstance.update({
      now,
      hours: hoursStr,
      minutes: minutesStr,
      seconds: secondsStr,
      ampm,
      is24,
      rawHours: now.getHours(),
      rawMinutes: now.getMinutes(),
      rawSeconds: now.getSeconds()
    });
  }

  unmount() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.activeInstance && this.activeInstance.unmount) {
      this.activeInstance.unmount();
    }
    this.activeInstance = null;
    if (this.container) {
      this.container.innerHTML = "";
    }
  }
}

var clockEngine = window.standbyClockEngine || (window.standbyClockEngine = new ClockEngine());


// --- flipClock.js ---

/* 3D Retro Mechanical Flip Clock */


const flipClock = {
  name: "Retro 3D Flip Clock",
  description: "Authentic mechanical split-flap cards with realistic physics and tick sound",
  category: "Classic",

  mount(container, config) {
    container.innerHTML = `
      <div class="clock-display-wrapper">
        <div class="flip-clock-container">
          <div class="flip-group" id="flip-hours-group">
            <div class="flip-unit" id="flip-h1">
              <div class="flip-card-top"><span>0</span></div>
              <div class="flip-card-bottom"><span>0</span></div>
            </div>
            <div class="flip-unit" id="flip-h2">
              <div class="flip-card-top"><span>0</span></div>
              <div class="flip-card-bottom"><span>0</span></div>
            </div>
          </div>
          <div class="flip-divider">:</div>
          <div class="flip-group" id="flip-minutes-group">
            <div class="flip-unit" id="flip-m1">
              <div class="flip-card-top"><span>0</span></div>
              <div class="flip-card-bottom"><span>0</span></div>
            </div>
            <div class="flip-unit" id="flip-m2">
              <div class="flip-card-top"><span>0</span></div>
              <div class="flip-card-bottom"><span>0</span></div>
            </div>
          </div>
          ${config.showSeconds ? `
            <div class="flip-divider">:</div>
            <div class="flip-group" id="flip-seconds-group">
              <div class="flip-unit" id="flip-s1" style="width: clamp(2.2rem, 7vw, 5.5rem); font-size: clamp(1.8rem, 6vw, 4.5rem);">
                <div class="flip-card-top"><span>0</span></div>
                <div class="flip-card-bottom"><span>0</span></div>
              </div>
              <div class="flip-unit" id="flip-s2" style="width: clamp(2.2rem, 7vw, 5.5rem); font-size: clamp(1.8rem, 6vw, 4.5rem);">
                <div class="flip-card-top"><span>0</span></div>
                <div class="flip-card-bottom"><span>0</span></div>
              </div>
            </div>
          ` : ""}
        </div>
        ${!config.is24Hour ? `<div id="flip-ampm" class="mt-4 font-mono font-bold text-sm tracking-widest text-neutral-400">AM</div>` : ""}
        ${config.showDate ? `<div id="flip-date-display" class="mt-3 font-sans font-semibold text-base tracking-wide text-neutral-400"></div>` : ""}
      </div>
    `;

    const lastValues = { h1: "", h2: "", m1: "", m2: "", s1: "", s2: "" };

    const updateDigit = (unitId, newVal) => {
      const unit = container.querySelector(`#${unitId}`);
      if (!unit || lastValues[unitId] === newVal) return;

      const oldVal = lastValues[unitId] || newVal;
      lastValues[unitId] = newVal;

      // Remove existing leaves
      unit.querySelectorAll(".flip-leaf").forEach(el => el.remove());

      // Create animated leaves
      const frontLeaf = document.createElement("div");
      frontLeaf.className = "flip-leaf leaf-front";
      frontLeaf.innerHTML = `<span>${oldVal}</span>`;

      const backLeaf = document.createElement("div");
      backLeaf.className = "flip-leaf leaf-back";
      backLeaf.innerHTML = `<span>${newVal}</span>`;

      unit.appendChild(frontLeaf);
      unit.appendChild(backLeaf);

      // Base top and bottom
      unit.querySelector(".flip-card-top span").textContent = newVal;
      unit.querySelector(".flip-card-bottom span").textContent = oldVal;

      // Trigger animation
      requestAnimationFrame(() => {
        unit.classList.add("flipping");
        if (config.tickSound && (unitId === "flip-s2" || unitId === "flip-m2")) {
          soundEngine.playFlipTick();
        }
      });

      setTimeout(() => {
        unit.querySelector(".flip-card-bottom span").textContent = newVal;
        unit.classList.remove("flipping");
        frontLeaf.remove();
        backLeaf.remove();
      }, 450);
    };

    return {
      update({ now, hours, minutes, seconds, ampm }) {
        updateDigit("flip-h1", hours[0]);
        updateDigit("flip-h2", hours[1]);
        updateDigit("flip-m1", minutes[0]);
        updateDigit("flip-m2", minutes[1]);

        if (config.showSeconds) {
          updateDigit("flip-s1", seconds[0]);
          updateDigit("flip-s2", seconds[1]);
        }

        const ampmEl = container.querySelector("#flip-ampm");
        if (ampmEl) ampmEl.textContent = ampm;

        const dateEl = container.querySelector("#flip-date-display");
        if (dateEl) {
          dateEl.textContent = now.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
        }
      },
      unmount() {}
    };
  }
};


// --- neonClock.js ---

/* Cyberpunk Neon Glow Clock */
const neonClock = {
  name: "Neon Cyberpunk Glow",
  description: "Vibrant glowing multi-tube neon numerals with animated color pulse",
  category: "Modern",

  mount(container, config) {
    container.innerHTML = `
      <div class="clock-display-wrapper">
        <div class="neon-clock-container">
          <div class="neon-time" id="neon-time-text">00:00</div>
          ${config.showSeconds ? `<div id="neon-seconds-text" class="font-mono text-2xl font-bold tracking-widest text-cyan-400">00</div>` : ""}
          ${config.showDate ? `<div class="neon-date" id="neon-date-text"></div>` : ""}
        </div>
      </div>
    `;

    return {
      update({ now, hours, minutes, seconds, ampm, is24 }) {
        const timeEl = container.querySelector("#neon-time-text");
        if (timeEl) {
          timeEl.textContent = `${hours}:${minutes}${!is24 ? " " + ampm : ""}`;
        }
        const secEl = container.querySelector("#neon-seconds-text");
        if (secEl) secEl.textContent = `${seconds}s`;

        const dateEl = container.querySelector("#neon-date-text");
        if (dateEl) {
          dateEl.textContent = now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
        }
      },
      unmount() {}
    };
  }
};


// --- matrixClock.js ---

/* Matrix Terminal Glyph Clock */
const matrixClock = {
  name: "Matrix Digital Rain",
  description: "Phosphorescent green glyph terminal display",
  category: "Digital",

  mount(container, config) {
    container.innerHTML = `
      <div class="clock-display-wrapper">
        <div class="matrix-clock-container">
          <div class="matrix-sub">SYS_TIME // SECURE_NODE</div>
          <div class="matrix-time" id="matrix-time-text">00:00:00</div>
          ${config.showDate ? `<div class="matrix-sub" id="matrix-date-text"></div>` : ""}
        </div>
      </div>
    `;

    return {
      update({ now, hours, minutes, seconds, ampm, is24 }) {
        const timeEl = container.querySelector("#matrix-time-text");
        if (timeEl) {
          timeEl.textContent = `${hours}:${minutes}${config.showSeconds ? ":" + seconds : ""}${!is24 ? " " + ampm : ""}`;
        }
        const dateEl = container.querySelector("#matrix-date-text");
        if (dateEl) {
          dateEl.textContent = `DATE > ${now.toISOString().split("T")[0]}`;
        }
      },
      unmount() {}
    };
  }
};


// --- solarClock.js ---

/* Celestial Solar Astronomical Clock */
const solarClock = {
  name: "Solar Astronomical Arc",
  description: "Tracks celestial daylight arc, solar noon and twilight positions",
  category: "Astronomical",

  mount(container, config) {
    container.innerHTML = `
      <div class="clock-display-wrapper">
        <div class="solar-clock-container">
          <svg class="solar-orbit-svg" viewBox="0 0 300 300">
            <!-- Background Orbit Ring -->
            <circle cx="150" cy="150" r="120" fill="none" stroke="rgba(255, 215, 0, 0.15)" stroke-width="2" stroke-dasharray="4 4" />
            
            <!-- Horizon line -->
            <line x1="20" y1="150" x2="280" y2="150" stroke="rgba(255, 255, 255, 0.15)" stroke-width="1.5" />
            
            <!-- Sunlight Progress Arc -->
            <circle id="solar-progress-arc" cx="150" cy="150" r="120" fill="none" stroke="#f59e0b" stroke-width="3" stroke-dasharray="754" stroke-dashoffset="377" stroke-linecap="round" />
            
            <!-- Sun Orb Marker -->
            <circle id="solar-orb" cx="150" cy="30" r="8" fill="#ffd166" filter="drop-shadow(0 0 8px #ffb703)" />
          </svg>

          <div class="solar-time-center">
            <div class="solar-time" id="solar-time-text">12:00</div>
            <div class="solar-period" id="solar-period-text">SOLAR DAY</div>
            ${config.showDate ? `<div class="text-xs font-mono text-amber-200/60 mt-1" id="solar-date-text"></div>` : ""}
          </div>
        </div>
      </div>
    `;

    return {
      update({ now, hours, minutes, seconds, ampm, is24, rawHours, rawMinutes }) {
        const timeEl = container.querySelector("#solar-time-text");
        if (timeEl) {
          timeEl.textContent = `${hours}:${minutes}${!is24 ? " " + ampm : ""}`;
        }

        const dateEl = container.querySelector("#solar-date-text");
        if (dateEl) {
          dateEl.textContent = now.toLocaleDateString(undefined, { month: "short", day: "numeric" });
        }

        // Calculate solar day progress (0 to 1 over 24h)
        const dayFraction = (rawHours * 3600 + rawMinutes * 60 + now.getSeconds()) / 86400;
        const angle = dayFraction * 2 * Math.PI - Math.PI / 2;
        const sunX = 150 + 120 * Math.cos(angle);
        const sunY = 150 + 120 * Math.sin(angle);

        const orb = container.querySelector("#solar-orb");
        if (orb) {
          orb.setAttribute("cx", sunX);
          orb.setAttribute("cy", sunY);
        }

        const arc = container.querySelector("#solar-progress-arc");
        if (arc) {
          const totalCircumference = 2 * Math.PI * 120;
          arc.setAttribute("stroke-dashoffset", totalCircumference * (1 - dayFraction));
        }

        const periodEl = container.querySelector("#solar-period-text");
        if (periodEl) {
          if (rawHours >= 6 && rawHours < 12) periodEl.textContent = "MORNING SUN";
          else if (rawHours >= 12 && rawHours < 17) periodEl.textContent = "SOLAR AFTERNOON";
          else if (rawHours >= 17 && rawHours < 20) periodEl.textContent = "GOLDEN HOUR";
          else periodEl.textContent = "NIGHT SKY";
        }
      },
      unmount() {}
    };
  }
};


// --- bigCropClock.js ---

/* Big Crop Pixel Style Clock */
const bigCropClock = {
  name: "Big Crop Typographic",
  description: "Oversized bold cropped numerals with high-contrast edge impact",
  category: "Modern",

  mount(container, config) {
    container.innerHTML = `
      <div class="clock-display-wrapper">
        <div class="big-crop-container">
          <div class="big-crop-time" id="big-crop-text">00:00</div>
          ${config.showSeconds ? `<div class="big-crop-seconds" id="big-crop-sec">00</div>` : ""}
        </div>
      </div>
    `;

    return {
      update({ hours, minutes, seconds }) {
        const textEl = container.querySelector("#big-crop-text");
        if (textEl) textEl.textContent = `${hours}:${minutes}`;

        const secEl = container.querySelector("#big-crop-sec");
        if (secEl) secEl.textContent = `${seconds}s`;
      },
      unmount() {}
    };
  }
};


// --- radialClock.js ---

/* Radial Sweep Gauge Clock */
const radialClock = {
  name: "Radial Sweep Gauge",
  description: "Dual concentric circular gauge meters for seconds and minutes",
  category: "Modern",

  mount(container, config) {
    container.innerHTML = `
      <div class="clock-display-wrapper">
        <div class="radial-clock-container">
          <svg class="absolute inset-0 w-full height-full" viewBox="0 0 300 300">
            <!-- Outer Minutes Track -->
            <circle cx="150" cy="150" r="130" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="8" />
            <circle id="radial-min-arc" cx="150" cy="150" r="130" fill="none" stroke="#3b82f6" stroke-width="8" stroke-dasharray="816" stroke-dashoffset="400" stroke-linecap="round" transform="rotate(-90 150 150)" />

            <!-- Inner Seconds Track -->
            <circle cx="150" cy="150" r="110" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="6" />
            <circle id="radial-sec-arc" cx="150" cy="150" r="110" fill="none" stroke="#10b981" stroke-width="6" stroke-dasharray="691" stroke-dashoffset="300" stroke-linecap="round" transform="rotate(-90 150 150)" />
          </svg>

          <div class="radial-center-content">
            <div class="radial-time" id="radial-time-text">00:00</div>
            <div class="radial-date" id="radial-date-text"></div>
          </div>
        </div>
      </div>
    `;

    return {
      update({ now, hours, minutes, seconds, ampm, is24, rawMinutes, rawSeconds }) {
        const timeEl = container.querySelector("#radial-time-text");
        if (timeEl) timeEl.textContent = `${hours}:${minutes}`;

        const dateEl = container.querySelector("#radial-date-text");
        if (dateEl) {
          dateEl.textContent = `${now.toLocaleDateString(undefined, { weekday: "short" })}, ${now.getDate()} ${now.toLocaleDateString(undefined, { month: "short" })}`;
        }

        const minArc = container.querySelector("#radial-min-arc");
        if (minArc) {
          const minCircumference = 2 * Math.PI * 130;
          const minFraction = (rawMinutes * 60 + rawSeconds) / 3600;
          minArc.setAttribute("stroke-dashoffset", minCircumference * (1 - minFraction));
        }

        const secArc = container.querySelector("#radial-sec-arc");
        if (secArc) {
          const secCircumference = 2 * Math.PI * 110;
          const secFraction = rawSeconds / 60;
          secArc.setAttribute("stroke-dashoffset", secCircumference * (1 - secFraction));
        }
      },
      unmount() {}
    };
  }
};


// --- dayClock.js ---

/* Day / Dementia / Senior-Friendly High Legibility Clock */
const dayClock = {
  name: "Day & Senior Friendly",
  description: "Ultra-legible high-contrast day name, period, and large date",
  category: "Accessibility",

  mount(container, config) {
    container.innerHTML = `
      <div class="clock-display-wrapper">
        <div class="day-clock-container">
          <div class="day-name" id="day-name-text">SATURDAY</div>
          <div class="day-period-pill" id="day-period-text">MORNING</div>
          <div class="day-time" id="day-time-text">09:41</div>
          <div class="day-full-date" id="day-full-date-text">August 22, 2026</div>
        </div>
      </div>
    `;

    return {
      update({ now, hours, minutes, seconds, ampm, is24, rawHours }) {
        const dayEl = container.querySelector("#day-name-text");
        if (dayEl) {
          dayEl.textContent = now.toLocaleDateString(undefined, { weekday: "long" }).toUpperCase();
        }

        const periodEl = container.querySelector("#day-period-text");
        if (periodEl) {
          if (rawHours >= 5 && rawHours < 12) periodEl.textContent = "MORNING";
          else if (rawHours >= 12 && rawHours < 17) periodEl.textContent = "AFTERNOON";
          else if (rawHours >= 17 && rawHours < 21) periodEl.textContent = "EVENING";
          else periodEl.textContent = "NIGHT TIME";
        }

        const timeEl = container.querySelector("#day-time-text");
        if (timeEl) {
          timeEl.textContent = `${hours}:${minutes}${!is24 ? " " + ampm : ""}`;
        }

        const dateEl = container.querySelector("#day-full-date-text");
        if (dateEl) {
          dateEl.textContent = now.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
        }
      },
      unmount() {}
    };
  }
};


// --- segmentedClock.js ---

/* 7-Segment LED Digital Alarm Clock */
const segmentedClock = {
  name: "7-Segment Retro LED",
  description: "Classic bedside alarm clock digital phosphor display",
  category: "Digital",

  mount(container, config) {
    container.innerHTML = `
      <div class="clock-display-wrapper">
        <div class="segmented-clock-container">
          <div class="seg-digit-group" id="seg-hours">00</div>
          <div class="seg-digit-group animate-pulse">:</div>
          <div class="seg-digit-group" id="seg-minutes">00</div>
          ${config.showSeconds ? `
            <div class="seg-digit-group text-3xl md:text-5xl self-end mb-2 text-red-500/80" id="seg-seconds">00</div>
          ` : ""}
        </div>
        ${!config.is24Hour ? `<div id="seg-ampm" class="mt-3 font-mono font-bold text-red-400/80 tracking-widest">AM</div>` : ""}
      </div>
    `;

    return {
      update({ hours, minutes, seconds, ampm }) {
        const hEl = container.querySelector("#seg-hours");
        if (hEl) hEl.textContent = hours;

        const mEl = container.querySelector("#seg-minutes");
        if (mEl) mEl.textContent = minutes;

        const sEl = container.querySelector("#seg-seconds");
        if (sEl) sEl.textContent = seconds;

        const ampmEl = container.querySelector("#seg-ampm");
        if (ampmEl) ampmEl.textContent = ampm;
      },
      unmount() {}
    };
  }
};


// --- analogDigitalClock.js ---

/* Bauhaus Minimalist Analog + Digital Clock */
const analogDigitalClock = {
  name: "Bauhaus Analog & Digital",
  description: "Swiss railway minimalist analog dial paired with digital companion",
  category: "Classic",

  mount(container, config) {
    container.innerHTML = `
      <div class="clock-display-wrapper">
        <div class="analog-digital-container">
          <div class="analog-dial">
            <div class="analog-hand hand-hour" id="analog-hour-hand"></div>
            <div class="analog-hand hand-minute" id="analog-minute-hand"></div>
            <div class="analog-hand hand-second" id="analog-second-hand"></div>
            <div class="analog-center-dot"></div>
          </div>
          <div class="digital-companion">
            <div class="digital-companion-time" id="analog-digital-time">12:00</div>
            <div class="digital-companion-date" id="analog-digital-date">Aug 22, Sat</div>
          </div>
        </div>
      </div>
    `;

    return {
      update({ now, hours, minutes, seconds, ampm, is24, rawHours, rawMinutes, rawSeconds }) {
        const hourDeg = (rawHours % 12 + rawMinutes / 60) * 30;
        const minDeg = (rawMinutes + rawSeconds / 60) * 6;
        const secDeg = rawSeconds * 6;

        const hHand = container.querySelector("#analog-hour-hand");
        if (hHand) hHand.style.transform = `rotate(${hourDeg}deg)`;

        const mHand = container.querySelector("#analog-minute-hand");
        if (mHand) mHand.style.transform = `rotate(${minDeg}deg)`;

        const sHand = container.querySelector("#analog-second-hand");
        if (sHand) sHand.style.transform = `rotate(${secDeg}deg)`;

        const dTime = container.querySelector("#analog-digital-time");
        if (dTime) dTime.textContent = `${hours}:${minutes}${!is24 ? " " + ampm : ""}`;

        const dDate = container.querySelector("#analog-digital-date");
        if (dDate) {
          dDate.textContent = now.toLocaleDateString(undefined, { month: "short", day: "numeric", weekday: "short" });
        }
      },
      unmount() {}
    };
  }
};


// --- amoledClock.js ---

/* AMOLED Ultra-Minimal Pure Black Clock */
const amoledClock = {
  name: "AMOLED Deep Black",
  description: "Zero-power pure black aesthetic designed for OLED bedtime display",
  category: "Minimal",

  mount(container, config) {
    container.innerHTML = `
      <div class="clock-display-wrapper bg-black">
        <div class="amoled-clock-container">
          <div class="amoled-time" id="amoled-time-text">00:00</div>
          ${config.showSeconds ? `<div id="amoled-sec-text" class="text-xs font-mono tracking-widest text-neutral-600">00 SEC</div>` : ""}
          ${config.showDate ? `<div id="amoled-date-text" class="text-xs font-mono tracking-widest text-neutral-600 mt-2"></div>` : ""}
        </div>
      </div>
    `;

    return {
      update({ now, hours, minutes, seconds, ampm, is24 }) {
        const timeEl = container.querySelector("#amoled-time-text");
        if (timeEl) timeEl.textContent = `${hours}:${minutes}${!is24 ? " " + ampm : ""}`;

        const secEl = container.querySelector("#amoled-sec-text");
        if (secEl) secEl.textContent = `${seconds} SEC`;

        const dateEl = container.querySelector("#amoled-date-text");
        if (dateEl) {
          dateEl.textContent = now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
        }
      },
      unmount() {}
    };
  }
};


// --- lcarsClock.js ---

/* Star Trek LCARS Sci-Fi Tactical Clock */
const lcarsClock = {
  name: "Star Trek LCARS",
  description: "Futuristic tactical interface with diagnostics telemetry",
  category: "Sci-Fi",

  mount(container, config) {
    container.innerHTML = `
      <div class="clock-display-wrapper">
        <div class="lcars-clock-container">
          <div class="lcars-elbow">
            <span class="lcars-text-id">LCARS-47</span>
            <span class="text-[10px] font-bold text-black">STANDBY</span>
          </div>
          <div class="lcars-body">
            <div class="text-xs font-mono text-amber-400 tracking-wider">STARDATE <span id="lcars-stardate">84920.4</span></div>
            <div class="lcars-time" id="lcars-time-text">22:04</div>
            <div class="lcars-bar"></div>
            <div class="flex justify-between text-xs font-mono text-indigo-300">
              <span>STATUS: NOMINAL</span>
              <span id="lcars-seconds-text">SEC: 00</span>
            </div>
          </div>
        </div>
      </div>
    `;

    return {
      update({ now, hours, minutes, seconds }) {
        const timeEl = container.querySelector("#lcars-time-text");
        if (timeEl) timeEl.textContent = `${hours}:${minutes}`;

        const secEl = container.querySelector("#lcars-seconds-text");
        if (secEl) secEl.textContent = `SEC: ${seconds}`;

        const stardateEl = container.querySelector("#lcars-stardate");
        if (stardateEl) {
          const stardate = (now.getFullYear() - 1900) * 1000 + (now.getMonth() * 30 + now.getDate()) * 2.7;
          stardateEl.textContent = stardate.toFixed(1);
        }
      },
      unmount() {}
    };
  }
};


// --- widgetEngine.js ---

/* StandBy Mode Pro - Modular Widget Engine Registry */

class WidgetEngine {
  constructor() {
    this.registry = new Map();
    this.activeInstances = new Map(); // key: slotId -> instance
  }

  register(id, widgetDefinition) {
    this.registry.set(id, widgetDefinition);
  }

  getWidgetList() {
    return Array.from(this.registry.entries()).map(([id, widget]) => ({
      id,
      name: widget.name,
      icon: widget.icon || "box"
    }));
  }

  mount(widgetId, containerElement, slotId = "default", options = {}) {
    this.unmount(slotId);

    const widget = this.registry.get(widgetId) || this.registry.get("weather");
    if (!widget) return;

    containerElement.innerHTML = "";
    const instance = widget.mount(containerElement, options);
    this.activeInstances.set(slotId, { instance, container: containerElement, widgetId });
  }

  unmount(slotId) {
    const existing = this.activeInstances.get(slotId);
    if (existing) {
      if (existing.instance && existing.instance.unmount) {
        existing.instance.unmount();
      }
      if (existing.container) {
        existing.container.innerHTML = "";
      }
      this.activeInstances.delete(slotId);
    }
  }

  unmountAll() {
    Array.from(this.activeInstances.keys()).forEach(slotId => this.unmount(slotId));
  }
}

var widgetEngine = window.standbyWidgetEngine || (window.standbyWidgetEngine = new WidgetEngine());


// --- weatherWidget.js ---

const weatherWidget = {
  name: "Weather & Forecast",
  icon: "cloud-sun",
  mount(container) {
    const sunSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`;
    const miniSunSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M2 12h2"/><path d="M20 12h2"/></svg>`;
    const miniCloudSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>`;
    const miniRainSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/></svg>`;

    container.innerHTML = `
      <div class="weather-container">
        <div class="flex items-center gap-2 text-xs font-semibold text-neutral-400">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          <span id="weather-location">Local Forecast</span>
        </div>
        <div class="flex items-center justify-center gap-4 my-2">
          <div id="weather-icon">${sunSvg}</div>
          <div class="weather-temp-main" id="weather-temp">24°</div>
        </div>
        <div class="weather-condition" id="weather-desc">Clear Sky</div>
        <div class="weather-forecast-row">
          <div class="weather-mini-day"><span>Today</span><span class="my-1">${miniSunSvg}</span><span class="font-bold text-white">26° / 18°</span></div>
          <div class="weather-mini-day"><span>Tomorrow</span><span class="my-1">${miniCloudSvg}</span><span class="font-bold text-white">25° / 17°</span></div>
          <div class="weather-mini-day"><span>Mon</span><span class="my-1">${miniRainSvg}</span><span class="font-bold text-white">22° / 16°</span></div>
        </div>
      </div>
    `;

    const fetchWeather = async () => {
      try {
        const res = await fetch("https://api.open-meteo.com/v1/forecast?latitude=51.5074&longitude=-0.1278&current=temperature_2m,weather_code&timezone=auto");
        if (res.ok) {
          const data = await res.json();
          const tempEl = container.querySelector("#weather-temp");
          if (tempEl) tempEl.textContent = `${Math.round(data.current.temperature_2m)}°`;
        }
      } catch (e) {}
    };

    fetchWeather();
    return { unmount() {} };
  }
};


// --- calendarWidget.js ---

/* Interactive Calendar & Agenda Widget */
const calendarWidget = {
  name: "Calendar & Schedule",
  icon: "calendar",

  mount(container) {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const todayDate = now.getDate();

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
    const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();

    let gridHtml = "";
    ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].forEach(d => {
      gridHtml += `<div class="calendar-day-header">${d}</div>`;
    });

    for (let i = 0; i < firstDayIndex; i++) {
      gridHtml += `<div></div>`;
    }

    for (let day = 1; day <= totalDays; day++) {
      const isToday = day === todayDate;
      gridHtml += `<div class="calendar-day-cell ${isToday ? "today" : ""}">${day}</div>`;
    }

    container.innerHTML = `
      <div class="flex flex-col w-full h-full justify-between">
        <div class="flex items-center justify-between mb-2">
          <span class="font-bold text-sm text-neutral-200">${monthNames[currentMonth]} ${currentYear}</span>
          <span class="text-xs font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">Week ${Math.ceil(todayDate / 7)}</span>
        </div>

        <div class="calendar-widget-grid">
          ${gridHtml}
        </div>

        <div class="mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-xs text-neutral-400">
          <div class="flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-blue-500"></span>
            <span>StandBy Deep Focus</span>
          </div>
          <span class="font-mono">10:30 AM</span>
        </div>
      </div>
    `;

    return {
      unmount() {}
    };
  }
};


// --- mediaWidget.js ---

/* Universal Media Player Widget with Real-Time Lyrics */



const demoTracks = [
  {
    title: "Midnight Lo-Fi Chill",
    artist: "Aura Ambient",
    coverGradient: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
    lyrics: [
      "Soft raindrops hitting the glass...",
      "Late night thoughts drifting away...",
      "Focus mode engaged, time slows down...",
      "Calm melodies flowing through the night..."
    ]
  },
  {
    title: "Cosmic Horizon",
    artist: "Solaris Dream",
    coverGradient: "linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)",
    lyrics: [
      "Floating above the atmosphere...",
      "Stars illuminating the distant dark...",
      "Endless horizons ahead...",
      "Peace within the silence..."
    ]
  }
];

const mediaWidget = {
  name: "Universal Media Player",
  icon: "music",

  mount(container) {
    let trackIndex = store.getState().mediaState.currentTrackIndex || 0;
    let isPlaying = store.getState().mediaState.isPlaying || false;
    let lyricLine = 0;
    let lyricInterval = null;

    const render = () => {
      const track = demoTracks[trackIndex];
      container.innerHTML = `
        <div class="media-container">
          <div class="media-track-info">
            <div class="media-artwork" style="background: ${track.coverGradient}">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            </div>
            <div class="media-text">
              <h4>${track.title}</h4>
              <p>${track.artist}</p>
            </div>
          </div>

          <div class="media-lyrics-box">
            <div class="lyrics-active-line" id="lyrics-active">${track.lyrics[lyricLine]}</div>
            <div class="lyrics-next-line" id="lyrics-next">${track.lyrics[(lyricLine + 1) % track.lyrics.length]}</div>
          </div>

          <div class="media-controls">
            <button class="btn-icon" id="media-prev" aria-label="Previous Track">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>
            </button>

            <button class="btn-icon bg-blue-600 hover:bg-blue-500 text-white w-12 h-12" id="media-play" aria-label="Play/Pause">
              ${isPlaying ? `
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              ` : `
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              `}
            </button>

            <button class="btn-icon" id="media-next" aria-label="Next Track">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
            </button>
          </div>
        </div>
      `;

      // Event handlers
      container.querySelector("#media-play").addEventListener("click", () => {
        isPlaying = !isPlaying;
        store.getState().mediaState.isPlaying = isPlaying;
        if (isPlaying) {
          soundEngine.playAmbient("binaural");
          startLyrics();
        } else {
          soundEngine.stopAmbient();
          stopLyrics();
        }
        render();
      });

      container.querySelector("#media-next").addEventListener("click", () => {
        trackIndex = (trackIndex + 1) % demoTracks.length;
        lyricLine = 0;
        store.getState().mediaState.currentTrackIndex = trackIndex;
        render();
      });

      container.querySelector("#media-prev").addEventListener("click", () => {
        trackIndex = (trackIndex - 1 + demoTracks.length) % demoTracks.length;
        lyricLine = 0;
        store.getState().mediaState.currentTrackIndex = trackIndex;
        render();
      });
    };

    const startLyrics = () => {
      stopLyrics();
      lyricInterval = setInterval(() => {
        const track = demoTracks[trackIndex];
        lyricLine = (lyricLine + 1) % track.lyrics.length;
        const actEl = container.querySelector("#lyrics-active");
        const nextEl = container.querySelector("#lyrics-next");
        if (actEl) actEl.textContent = track.lyrics[lyricLine];
        if (nextEl) nextEl.textContent = track.lyrics[(lyricLine + 1) % track.lyrics.length];
      }, 4000);
    };

    const stopLyrics = () => {
      if (lyricInterval) {
        clearInterval(lyricInterval);
        lyricInterval = null;
      }
    };

    render();

    return {
      unmount() {
        stopLyrics();
      }
    };
  }
};


// --- timerWidget.js ---

/* Fullscreen Timer & Stopwatch Widget */


const timerWidget = {
  name: "Timer & Stopwatch",
  icon: "timer",

  mount(container) {
    let mode = "timer"; // 'timer' or 'stopwatch'
    let timerDuration = 1500; // 25 min default pomodoro
    let remaining = 1500;
    let isRunning = false;
    let timerInterval = null;

    let swElapsed = 0;
    let swInterval = null;

    const render = () => {
      const formatTime = (secs) => {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      };

      const formatStopwatch = (ms) => {
        const totalSecs = Math.floor(ms / 1000);
        const m = Math.floor(totalSecs / 60);
        const s = totalSecs % 60;
        const cs = Math.floor((ms % 1000) / 10);
        return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
      };

      container.innerHTML = `
        <div class="timer-container">
          <div class="flex items-center gap-2 p-1 bg-white/5 rounded-full mb-1">
            <button id="tab-timer" class="px-3 py-1 text-xs font-semibold rounded-full transition-all ${mode === "timer" ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-white"}">Pomodoro</button>
            <button id="tab-sw" class="px-3 py-1 text-xs font-semibold rounded-full transition-all ${mode === "stopwatch" ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-white"}">Stopwatch</button>
          </div>

          <div class="timer-digits" id="timer-digits-display">
            ${mode === "timer" ? formatTime(remaining) : formatStopwatch(swElapsed)}
          </div>

          <div class="timer-btn-row">
            <button class="btn-icon" id="timer-reset" data-tooltip="Reset">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            </button>

            <button class="btn-primary flex items-center gap-2" id="timer-toggle">
              ${isRunning ? `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                Pause
              ` : `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Start
              `}
            </button>

            ${mode === "timer" ? `
              <button class="btn-icon" id="timer-preset-btn" data-tooltip="+5 Min">
                <span class="text-xs font-bold font-mono">+5m</span>
              </button>
            ` : ""}
          </div>
        </div>
      `;

      // Events
      container.querySelector("#tab-timer").addEventListener("click", () => {
        if (mode !== "timer") {
          stopTimer();
          stopSW();
          mode = "timer";
          isRunning = false;
          render();
        }
      });

      container.querySelector("#tab-sw").addEventListener("click", () => {
        if (mode !== "stopwatch") {
          stopTimer();
          stopSW();
          mode = "stopwatch";
          isRunning = false;
          render();
        }
      });

      container.querySelector("#timer-toggle").addEventListener("click", () => {
        isRunning = !isRunning;
        if (mode === "timer") {
          if (isRunning) startTimer();
          else stopTimer();
        } else {
          if (isRunning) startSW();
          else stopSW();
        }
        render();
      });

      container.querySelector("#timer-reset").addEventListener("click", () => {
        isRunning = false;
        if (mode === "timer") {
          stopTimer();
          remaining = timerDuration;
        } else {
          stopSW();
          swElapsed = 0;
        }
        render();
      });

      const presetBtn = container.querySelector("#timer-preset-btn");
      if (presetBtn) {
        presetBtn.addEventListener("click", () => {
          remaining += 300;
          timerDuration = remaining;
          render();
        });
      }
    };

    const startTimer = () => {
      stopTimer();
      timerInterval = setInterval(() => {
        if (remaining > 0) {
          remaining--;
          const el = container.querySelector("#timer-digits-display");
          if (el) {
            const m = Math.floor(remaining / 60);
            const s = remaining % 60;
            el.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
          }
        } else {
          stopTimer();
          isRunning = false;
          soundEngine.playAlarmChime();
          render();
        }
      }, 1000);
    };

    const stopTimer = () => {
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
    };

    const startSW = () => {
      stopSW();
      const startTime = Date.now() - swElapsed;
      swInterval = setInterval(() => {
        swElapsed = Date.now() - startTime;
        const el = container.querySelector("#timer-digits-display");
        if (el) {
          const totalSecs = Math.floor(swElapsed / 1000);
          const m = Math.floor(totalSecs / 60);
          const s = totalSecs % 60;
          const cs = Math.floor((swElapsed % 1000) / 10);
          el.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
        }
      }, 40);
    };

    const stopSW = () => {
      if (swInterval) {
        clearInterval(swInterval);
        swInterval = null;
      }
    };

    render();

    return {
      unmount() {
        stopTimer();
        stopSW();
      }
    };
  }
};


// --- todoWidget.js ---

/* TODO Checklist & Protocol Habits Widget */


const todoWidget = {
  name: "TODO & Protocols",
  icon: "check-square",

  mount(container) {
    const render = () => {
      const todos = store.getState().todos || [];

      container.innerHTML = `
        <div class="flex flex-col w-full h-full justify-between">
          <div class="todo-list-box" id="todo-items-container">
            ${todos.map(t => `
              <div class="todo-item-row ${t.completed ? "completed" : ""}" data-id="${t.id}">
                <input type="checkbox" ${t.completed ? "checked" : ""} class="rounded border-neutral-700 text-blue-600 focus:ring-0 cursor-pointer pointer-events-none" />
                <span class="text-sm font-medium text-neutral-200 flex-1">${t.text}</span>
              </div>
            `).join("")}
          </div>

          <form id="todo-add-form" class="mt-2 flex gap-2">
            <input type="text" id="todo-input" placeholder="New Protocol item..." class="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500" />
            <button type="submit" class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded-lg text-xs font-semibold">+</button>
          </form>
        </div>
      `;

      container.querySelectorAll(".todo-item-row").forEach(row => {
        row.addEventListener("click", () => {
          const id = row.getAttribute("data-id");
          store.toggleTodo(id);
          render();
        });
      });

      const form = container.querySelector("#todo-add-form");
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const input = container.querySelector("#todo-input");
        if (input && input.value) {
          store.addTodo(input.value);
          render();
        }
      });
    };

    render();

    return {
      unmount() {}
    };
  }
};


// --- tallyWidget.js ---

/* Tally Counter Widget */



const tallyWidget = {
  name: "Tally Counter",
  icon: "hash",

  mount(container) {
    let key = "focusSessions";

    const render = () => {
      const tallies = store.getState().tallies || {};
      const count = tallies[key] || 0;

      container.innerHTML = `
        <div class="tally-container">
          <div class="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Session Reps / Count</div>
          <div class="tally-number" id="tally-val">${count}</div>

          <div class="flex items-center gap-3">
            <button class="btn-icon" id="tally-dec" aria-label="Decrease">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>

            <button class="btn-primary flex items-center justify-center w-14 h-14 rounded-2xl text-2xl font-bold" id="tally-inc" aria-label="Count +1">
              +1
            </button>

            <button class="btn-icon" id="tally-res" aria-label="Reset">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            </button>
          </div>
        </div>
      `;

      container.querySelector("#tally-inc").addEventListener("click", () => {
        store.incrementTally(key, 1);
        soundEngine.playFlipTick();
        render();
      });

      container.querySelector("#tally-dec").addEventListener("click", () => {
        if (count > 0) {
          store.incrementTally(key, -1);
          render();
        }
      });

      container.querySelector("#tally-res").addEventListener("click", () => {
        store.resetTally(key);
        render();
      });
    };

    render();

    return {
      unmount() {}
    };
  }
};


// --- quoteWidget.js ---

/* Curated Daily Protocol & Wisdom Quote Widget */
const quotes = [
  { text: "Simplicity is the prerequisite for reliability.", author: "Edsger W. Dijkstra" },
  { text: "Focus is a muscle. Practice turning distraction into stillness.", author: "Marcus Aurelius" },
  { text: "Make it work, make it right, make it fast.", author: "Kent Beck" },
  { text: "Deep work is the ability to focus without distraction on a cognitively demanding task.", author: "Cal Newport" },
  { text: "The details are not the details. They make the design.", author: "Charles Eames" }
];

const quoteWidget = {
  name: "Daily Wisdom & Quotes",
  icon: "quote",

  mount(container) {
    let quoteIndex = Math.floor(Math.random() * quotes.length);

    const render = () => {
      const q = quotes[quoteIndex];
      container.innerHTML = `
        <div class="flex flex-col justify-between w-full h-full p-2 text-center">
          <div class="text-neutral-500 text-3xl font-serif"></div>
          <p class="font-serif italic text-lg md:text-xl text-neutral-200 leading-relaxed px-2">
            ${q.text}
          </p>
          <div class="text-xs font-mono text-neutral-400 mt-2">
             ${q.author}
          </div>
          <button class="mt-2 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors" id="next-quote-btn">
            Next Wisdom ?
          </button>
        </div>
      `;

      container.querySelector("#next-quote-btn").addEventListener("click", () => {
        quoteIndex = (quoteIndex + 1) % quotes.length;
        render();
      });
    };

    render();

    return {
      unmount() {}
    };
  }
};


// --- photoWidget.js ---

/* Smart Photo Frame Widget with Face/Center Aware Cropping */


const defaultPresetPhotos = [
  { url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80", title: "Tropical Coast" },
  { url: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&q=80", title: "Starry Alpine" },
  { url: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&q=80", title: "Misty Forest" }
];

const photoWidget = {
  name: "Smart Photo Frame",
  icon: "image",

  mount(container) {
    let photos = [...defaultPresetPhotos];
    let currentIndex = 0;
    let slideTimer = null;

    const loadUserPhotos = async () => {
      try {
        const userPhotos = await photoDB.getAllPhotos();
        if (userPhotos && userPhotos.length > 0) {
          photos = userPhotos.map(p => ({ url: p.dataUrl, title: p.title }));
        }
        render();
      } catch (e) {
        render();
      }
    };

    const render = () => {
      const current = photos[currentIndex] || defaultPresetPhotos[0];
      container.innerHTML = `
        <div class="photo-frame-container">
          <img src="${current.url}" alt="${current.title}" class="photo-frame-img" id="photo-frame-element" />
          <div class="photo-frame-overlay">
            <span class="text-xs font-semibold text-white/90 drop-shadow-md">${current.title}</span>
            <span class="text-[10px] text-white/60">Smart AI Frame  Auto Slide</span>
          </div>
        </div>
      `;
    };

    const startSlideshow = () => {
      slideTimer = setInterval(() => {
        currentIndex = (currentIndex + 1) % photos.length;
        const img = container.querySelector("#photo-frame-element");
        if (img) {
          img.style.opacity = "0";
          setTimeout(() => {
            render();
          }, 600);
        }
      }, 10000);
    };

    loadUserPhotos();
    startSlideshow();

    return {
      unmount() {
        if (slideTimer) clearInterval(slideTimer);
      }
    };
  }
};


// --- vibesWidget.js ---

const vibesWidget = {
  name: "Vibes & Atmosphere",
  icon: "sparkles",
  mount(container) {
    const vibesList = [
      { id: "rain", name: "Rain & Thunder", svg: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/></svg>` },
      { id: "waves", name: "Ocean Waves", svg: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/></svg>` },
      { id: "fire", name: "Campfire Glow", svg: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>` },
      { id: "binaural", name: "Binaural Lo-Fi", svg: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>` },
      { id: "none", name: "Mute Ambience", svg: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>` }
    ];

    const render = () => {
      const active = store.getState().vibes.activeTrack;
      container.innerHTML = `
        <div class="flex flex-col w-full h-full justify-between">
          <div class="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Select Focus Atmosphere</div>
          <div class="grid grid-cols-2 gap-2 flex-1">
            ${vibesList.map(v => `
              <button class="flex items-center gap-2.5 p-2.5 rounded-xl border text-xs font-semibold transition-all ${active === v.id ? "bg-blue-600/30 border-blue-500 text-white" : "bg-white/5 border-white/5 text-neutral-300 hover:bg-white/10"}" data-vibe="${v.id}">
                <span class="text-blue-400">${v.svg}</span>
                <span>${v.name}</span>
              </button>
            `).join("")}
          </div>
        </div>
      `;

      container.querySelectorAll("[data-vibe]").forEach(btn => {
        btn.addEventListener("click", () => {
          const vid = btn.getAttribute("data-vibe");
          store.setVibe(vid);
          soundEngine.playAmbient(vid);
          render();
        });
      });
    };

    render();
    return { unmount() {} };
  }
};


// --- spacesNav.js ---

class SpacesNav {
  constructor(containerElement) {
    this.container = containerElement;
    if (!this.container) return;
    this.render();
    store.subscribe((event) => {
      if (event === "space_changed" || event === "space_updated") {
        this.render();
      }
    });
  }

  getIconSvg(iconName) {
    if (iconName === "home") {
      return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;
    }
    if (iconName === "briefcase") {
      return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`;
    }
    if (iconName === "target") {
      return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`;
  }

  render() {
    const state = store.getState();
    const activeSpaceId = state.activeSpaceId;
    const spaces = Object.values(state.spaces);

    this.container.innerHTML = `
      <div class="flex items-center gap-1.5 p-1 bg-black/40 backdrop-blur-xl border border-white/10 rounded-full shadow-2xl">
        ${spaces.map(s => `
          <button class="glass-pill px-3.5 py-1.5 text-xs font-semibold flex items-center gap-2 transition-all ${s.id === activeSpaceId ? "active text-white font-bold" : "text-neutral-400 hover:text-white"}" data-space-id="${s.id}">
            <span class="opacity-80">${this.getIconSvg(s.icon)}</span>
            <span>${s.name}</span>
          </button>
        `).join("")}
      </div>
    `;

    this.container.querySelectorAll("[data-space-id]").forEach(btn => {
      btn.addEventListener("click", () => {
        const spaceId = btn.getAttribute("data-space-id");
        store.setActiveSpace(spaceId);
        soundEngine.playFlipTick();
      });
    });
  }
}


// --- customizeModal.js ---






class CustomizeModal {
  constructor() {
    this.modalEl = document.getElementById("customize-modal");
    this.contentEl = document.getElementById("customize-modal-content");
    this.openBtn = document.getElementById("btn-customize");
    this.closeBtn = document.getElementById("btn-close-customize");

    this.initEvents();
  }

  initEvents() {
    if (this.openBtn) this.openBtn.addEventListener("click", () => this.open());
    if (this.closeBtn) this.closeBtn.addEventListener("click", () => this.close());
    if (this.modalEl) {
      this.modalEl.addEventListener("click", (e) => {
        if (e.target === this.modalEl) this.close();
      });
    }
  }

  open() {
    this.render();
    if (this.modalEl) this.modalEl.classList.add("open");
  }

  close() {
    if (this.modalEl) this.modalEl.classList.remove("open");
  }

  render() {
    if (!this.contentEl) return;
    const state = store.getState();
    const activeSpace = store.getActiveSpace();
    const pomo = state.pomoState;
    const clockList = clockEngine.getClockList();
    const widgetList = widgetEngine.getWidgetList();
    const isWakeLocked = state.keepScreenAwake;

    this.contentEl.innerHTML = `
      <div class="space-y-6 text-sm text-neutral-200">
        
        <!-- Screen Wake Lock (Always Screen On) -->
        <div class="p-3.5 bg-gradient-to-r from-blue-950/40 to-indigo-950/40 rounded-2xl border border-blue-500/25 flex items-center justify-between shadow-lg">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            </div>
            <div>
              <div class="font-bold text-xs text-white flex items-center gap-2">
                <span>Always Keep Screen Awake</span>
                <span class="text-[10px] font-mono px-2 py-0.5 rounded-full ${isWakeLocked ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-white/10 text-neutral-400'}">
                  ${isWakeLocked ? 'Active ⚡' : 'Off'}
                </span>
              </div>
              <div class="text-[11px] text-neutral-400 mt-0.5">Prevents display timeout & sleep during clock sessions</div>
            </div>
          </div>
          <label class="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" id="chk-wake-lock" ${isWakeLocked ? "checked" : ""} class="sr-only peer" />
            <div class="w-11 h-6 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>

        <!-- Layout Selection -->
        <div>
          <label class="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2.5">Dashboard Layout</label>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <button class="p-3 rounded-xl border text-center font-semibold transition-all flex flex-col items-center gap-1.5 ${activeSpace.layout === "standalone" ? "bg-blue-600/30 border-blue-500 text-white" : "bg-white/5 border-white/10 text-neutral-400 hover:bg-white/10"}" data-set-layout="standalone">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="3"/><circle cx="12" cy="12" r="4"/></svg>
              <span class="text-xs">Clock Only</span>
            </button>
            <button class="p-3 rounded-xl border text-center font-semibold transition-all flex flex-col items-center gap-1.5 ${activeSpace.layout === "focus" ? "bg-blue-600/30 border-blue-500 text-white" : "bg-white/5 border-white/10 text-neutral-400 hover:bg-white/10"}" data-set-layout="focus">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
              <span class="text-xs">Pomodoro Focus</span>
            </button>
            <button class="p-3 rounded-xl border text-center font-semibold transition-all flex flex-col items-center gap-1.5 ${activeSpace.layout === "duo" ? "bg-blue-600/30 border-blue-500 text-white" : "bg-white/5 border-white/10 text-neutral-400 hover:bg-white/10"}" data-set-layout="duo">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="3"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
              <span class="text-xs">Duo Split</span>
            </button>
            <button class="p-3 rounded-xl border text-center font-semibold transition-all flex flex-col items-center gap-1.5 ${activeSpace.layout === "quad" ? "bg-blue-600/30 border-blue-500 text-white" : "bg-white/5 border-white/10 text-neutral-400 hover:bg-white/10"}" data-set-layout="quad">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="3"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="3" y1="12" x2="21" y2="12"/></svg>
              <span class="text-xs">Quad Grid</span>
            </button>
          </div>
        </div>

        <!-- Clock Face Theme -->
        <div>
          <div class="flex items-center justify-between mb-2.5">
            <label class="block text-xs font-bold text-neutral-400 uppercase tracking-wider">Clock & Pomodoro Theme</label>
            <span class="text-[10px] text-blue-400 font-mono">Syncs with Live Corner Clock</span>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-48 overflow-y-auto pr-1">
            ${clockList.map(c => `
              <button class="p-2.5 rounded-xl border text-left transition-all ${activeSpace.clockId === c.id ? "bg-blue-600/30 border-blue-500 text-white shadow-md" : "bg-white/5 border-white/5 text-neutral-400 hover:bg-white/10"}" data-set-clock="${c.id}">
                <div class="font-bold text-xs text-white">${c.name}</div>
                <div class="text-[10px] text-neutral-400 truncate mt-0.5">${c.category}</div>
              </button>
            `).join("")}
          </div>
        </div>

        <!-- Pomodoro Configuration -->
        <div class="pt-4 border-t border-white/10">
          <label class="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2.5">Pomodoro Timers & Intervals</label>
          <div class="grid grid-cols-3 gap-3 mb-3">
            <div class="p-3 bg-white/5 rounded-xl border border-white/5">
              <label class="text-[11px] text-neutral-400 block mb-1">Focus (min)</label>
              <input type="number" min="5" max="120" id="input-pomo-focus" value="${pomo.settings.focusDuration}" class="w-full bg-neutral-900 border border-white/10 rounded-lg p-2 text-sm text-white font-mono text-center font-bold" />
            </div>
            <div class="p-3 bg-white/5 rounded-xl border border-white/5">
              <label class="text-[11px] text-neutral-400 block mb-1">Short Break</label>
              <input type="number" min="1" max="30" id="input-pomo-short" value="${pomo.settings.shortBreakDuration}" class="w-full bg-neutral-900 border border-white/10 rounded-lg p-2 text-sm text-white font-mono text-center font-bold" />
            </div>
            <div class="p-3 bg-white/5 rounded-xl border border-white/5">
              <label class="text-[11px] text-neutral-400 block mb-1">Long Break</label>
              <input type="number" min="5" max="60" id="input-pomo-long" value="${pomo.settings.longBreakDuration}" class="w-full bg-neutral-900 border border-white/10 rounded-lg p-2 text-sm text-white font-mono text-center font-bold" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <label class="flex items-center gap-2 p-2.5 bg-white/5 rounded-xl border border-white/5 cursor-pointer">
              <input type="checkbox" id="chk-auto-breaks" ${pomo.settings.autoStartBreaks ? "checked" : ""} class="rounded" />
              <span class="text-xs font-medium">Auto-start Breaks</span>
            </label>
            <label class="flex items-center gap-2 p-2.5 bg-white/5 rounded-xl border border-white/5 cursor-pointer">
              <input type="checkbox" id="chk-auto-pomo" ${pomo.settings.autoStartPomo ? "checked" : ""} class="rounded" />
              <span class="text-xs font-medium">Auto-start Focus</span>
            </label>
          </div>
        </div>

        <!-- Clock Behavior -->
        <div class="pt-4 border-t border-white/10">
          <label class="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2.5">Clock & Sound Behavior</label>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <label class="flex items-center gap-2 p-2 bg-white/5 rounded-xl border border-white/5 cursor-pointer">
              <input type="checkbox" id="chk-24h" ${state.clockConfig.is24Hour ? "checked" : ""} class="rounded" />
              <span class="text-xs font-medium">24-Hour Format</span>
            </label>
            <label class="flex items-center gap-2 p-2 bg-white/5 rounded-xl border border-white/5 cursor-pointer">
              <input type="checkbox" id="chk-seconds" ${state.clockConfig.showSeconds ? "checked" : ""} class="rounded" />
              <span class="text-xs font-medium">Show Seconds</span>
            </label>
            <label class="flex items-center gap-2 p-2 bg-white/5 rounded-xl border border-white/5 cursor-pointer">
              <input type="checkbox" id="chk-tick" ${state.clockConfig.tickSound ? "checked" : ""} class="rounded" />
              <span class="text-xs font-medium">Tick Audio</span>
            </label>
          </div>
        </div>

        <!-- Duo Mode Widgets -->
        ${activeSpace.layout === "duo" ? `
          <div class="pt-4 border-t border-white/10">
            <label class="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2.5">Duo Mode Widgets</label>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <span class="text-[11px] text-neutral-400 block mb-1">Left Panel</span>
                <select id="select-duo-w1" class="w-full bg-neutral-900 border border-white/10 rounded-lg p-2 text-xs text-white">
                  <option value="clock" ${activeSpace.widgets[0] === "clock" ? "selected" : ""}>Main Clock</option>
                  ${widgetList.map(w => `<option value="${w.id}" ${activeSpace.widgets[0] === w.id ? "selected" : ""}>${w.name}</option>`).join("")}
                </select>
              </div>
              <div>
                <span class="text-[11px] text-neutral-400 block mb-1">Right Panel</span>
                <select id="select-duo-w2" class="w-full bg-neutral-900 border border-white/10 rounded-lg p-2 text-xs text-white">
                  ${widgetList.map(w => `<option value="${w.id}" ${activeSpace.widgets[1] === w.id ? "selected" : ""}>${w.name}</option>`).join("")}
                  <option value="clock" ${activeSpace.widgets[1] === "clock" ? "selected" : ""}>Main Clock</option>
                </select>
              </div>
            </div>
          </div>
        ` : ""}

      </div>
    `;

    // Event Listeners
    const chkWakeLock = this.contentEl.querySelector("#chk-wake-lock");
    if (chkWakeLock) {
      chkWakeLock.addEventListener("change", (e) => {
        store.toggleScreenWakeLock(e.target.checked);
        this.render();
      });
    }

    this.contentEl.querySelectorAll("[data-set-layout]").forEach(btn => {
      btn.addEventListener("click", () => {
        store.setLayout(btn.getAttribute("data-set-layout"));
        this.render();
      });
    });

    this.contentEl.querySelectorAll("[data-set-clock]").forEach(btn => {
      btn.addEventListener("click", () => {
        store.setClock(btn.getAttribute("data-set-clock"));
        this.render();
      });
    });

    // Pomo inputs
    const inFocus = this.contentEl.querySelector("#input-pomo-focus");
    const inShort = this.contentEl.querySelector("#input-pomo-short");
    const inLong = this.contentEl.querySelector("#input-pomo-long");
    const chkAutoBreaks = this.contentEl.querySelector("#chk-auto-breaks");
    const chkAutoPomo = this.contentEl.querySelector("#chk-auto-pomo");

    const savePomo = () => {
      store.updatePomoSettings({
        focusDuration: parseInt(inFocus.value, 10) || 25,
        shortBreakDuration: parseInt(inShort.value, 10) || 5,
        longBreakDuration: parseInt(inLong.value, 10) || 15,
        autoStartBreaks: chkAutoBreaks.checked,
        autoStartPomo: chkAutoPomo.checked
      });
    };

    if (inFocus) inFocus.addEventListener("change", savePomo);
    if (inShort) inShort.addEventListener("change", savePomo);
    if (inLong) inLong.addEventListener("change", savePomo);
    if (chkAutoBreaks) chkAutoBreaks.addEventListener("change", savePomo);
    if (chkAutoPomo) chkAutoPomo.addEventListener("change", savePomo);

    const chk24 = this.contentEl.querySelector("#chk-24h");
    if (chk24) chk24.addEventListener("change", (e) => store.updateClockConfig({ is24Hour: e.target.checked }));
    const chkSec = this.contentEl.querySelector("#chk-seconds");
    if (chkSec) chkSec.addEventListener("change", (e) => store.updateClockConfig({ showSeconds: e.target.checked }));
    const chkTick = this.contentEl.querySelector("#chk-tick");
    if (chkTick) chkTick.addEventListener("change", (e) => store.updateClockConfig({ tickSound: e.target.checked }));

    const selW1 = this.contentEl.querySelector("#select-duo-w1");
    const selW2 = this.contentEl.querySelector("#select-duo-w2");
    if (selW1 && selW2) {
      const upd = () => store.setWidgets([selW1.value, selW2.value]);
      selW1.addEventListener("change", upd);
      selW2.addEventListener("change", upd);
    }
  }
}


// --- photoModal.js ---

/* Smart Photo Frame Upload & Gallery Modal */


class PhotoModal {
  constructor() {
    this.modalEl = document.getElementById("photo-modal");
    this.init();
  }

  init() {
    const openBtn = document.getElementById("btn-photos");
    const closeBtn = document.getElementById("btn-close-photo-modal");

    if (openBtn) openBtn.addEventListener("click", () => this.open());
    if (closeBtn) closeBtn.addEventListener("click", () => this.close());

    if (this.modalEl) {
      this.modalEl.addEventListener("click", (e) => {
        if (e.target === this.modalEl) this.close();
      });
    }
  }

  open() {
    this.render();
    if (this.modalEl) this.modalEl.classList.add("open");
  }

  close() {
    if (this.modalEl) this.modalEl.classList.remove("open");
  }

  async render() {
    const content = document.getElementById("photo-modal-content");
    if (!content) return;

    const photos = await photoDB.getAllPhotos();

    content.innerHTML = `
      <div class="space-y-4 text-sm text-neutral-200">
        <div>
          <label class="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Upload Custom Image</label>
          <input type="file" id="photo-file-input" accept="image/*" class="w-full text-xs text-neutral-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-500 cursor-pointer" />
        </div>

        <div class="pt-4 border-t border-white/10">
          <label class="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Your Photo Gallery (${photos.length})</label>
          <div class="grid grid-cols-3 gap-2.5 max-h-56 overflow-y-auto">
            ${photos.length === 0 ? `
              <div class="col-span-3 text-center py-6 text-neutral-500 text-xs">No custom photos yet. Using preset scenery.</div>
            ` : photos.map(p => `
              <div class="relative group rounded-xl overflow-hidden aspect-video border border-white/10">
                <img src="${p.dataUrl}" alt="${p.title}" class="w-full h-full object-cover" />
                <button class="absolute top-1 right-1 bg-red-600/80 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity" data-del-photo="${p.id}">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    `;

    // File upload
    const input = content.querySelector("#photo-file-input");
    if (input) {
      input.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = async () => {
            await photoDB.addPhoto(reader.result, file.name);
            this.render();
          };
          reader.readAsDataURL(file);
        }
      });
    }

    // Delete photo
    content.querySelectorAll("[data-del-photo]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = Number(btn.getAttribute("data-del-photo"));
        await photoDB.deletePhoto(id);
        this.render();
      });
    });
  }
}


// --- nightModeController.js ---

/* StandBy Mode Pro - Night Mode & Screen Dimming Controller */



class NightModeController {
  constructor() {
    this.toggleBtn = document.getElementById("btn-night-mode");
    this.init();
  }

  init() {
    if (this.toggleBtn) {
      this.toggleBtn.addEventListener("click", () => {
        store.toggleNightMode();
        soundEngine.playFlipTick();
      });
    }

    store.subscribe((event, payload) => {
      if (event === "night_mode_toggled") {
        this.applyNightMode(payload.enabled);
      }
    });

    this.applyNightMode(store.getState().nightMode.enabled);
  }

  applyNightMode(enabled) {
    if (enabled) {
      document.body.classList.add("night-mode");
      if (this.toggleBtn) this.toggleBtn.classList.add("active", "text-red-500");
    } else {
      document.body.classList.remove("night-mode");
      if (this.toggleBtn) this.toggleBtn.classList.remove("active", "text-red-500");
    }
  }
}


// --- screensaver.js ---

/* StandBy Mode Pro - Idle Screensaver Engine */


class Screensaver {
  constructor() {
    this.layer = document.getElementById("screensaver-layer");
    this.idleTimer = null;
    this.idleSeconds = 120; // 2 min idle default
    this.isActive = false;
    this.init();
  }

  init() {
    this.resetTimer();
    ["mousemove", "mousedown", "keydown", "touchstart", "scroll"].forEach(evt => {
      window.addEventListener(evt, () => this.onUserActivity(), { passive: true });
    });

    if (this.layer) {
      this.layer.addEventListener("click", () => this.exitScreensaver());
    }
  }

  onUserActivity() {
    if (this.isActive) {
      this.exitScreensaver();
    }
    this.resetTimer();
    document.body.classList.remove("idle-dim");
  }

  resetTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.triggerScreensaver();
    }, this.idleSeconds * 1000);
  }

  triggerScreensaver() {
    const config = store.getState().screensaver;
    if (!config.enabled) return;

    this.isActive = true;
    if (this.layer) {
      this.layer.classList.add("active");
      this.renderScreensaverContent();
    }
  }

  exitScreensaver() {
    this.isActive = false;
    if (this.layer) {
      this.layer.classList.remove("active");
    }
    this.resetTimer();
  }

  renderScreensaverContent() {
    if (!this.layer) return;
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    this.layer.innerHTML = `
      <div class="screensaver-float-content text-center">
        <div class="font-sans font-extralight text-7xl md:text-9xl text-white/40 tracking-tighter">${timeStr}</div>
        <div class="text-xs font-mono text-white/20 tracking-widest mt-3">TAP ANYWHERE TO WAKE</div>
      </div>
    `;
  }
}


// --- pomoFocusView.js ---





class PomoFocusView {
  constructor(containerElement) {
    this.container = containerElement;
    this.appShell = document.getElementById('app-shell');
    this.timerInterval = null;
    this.cornerClockInterval = null;
    this.peekTimeout = null;
    this.init();
  }

  init() {
    this.render();

    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      const finished = store.tickPomo();
      if (finished) {
        soundEngine.playAlarmChime();
        this.render();
      } else {
        this.updateTimeOnly();
      }
    }, 1000);

    store.subscribe((event) => {
      if (
        event === 'pomo_updated' ||
        event === 'pomo_settings_updated' ||
        event === 'space_updated' ||
        event === 'clock_config_updated'
      ) {
        this.syncZenState();
        this.render();
      }
    });

    this.syncZenState();
  }

  syncZenState() {
    const isRunning = store.getState().pomoState.isRunning;
    if (this.appShell) {
      if (isRunning) {
        this.appShell.classList.add('zen-focus-active');
      } else {
        this.appShell.classList.remove('zen-focus-active');
        this.appShell.classList.remove('zen-peek-active');
        if (this.peekTimeout) clearTimeout(this.peekTimeout);
      }
    }
  }

  triggerZenPeek() {
    if (!this.appShell || !this.appShell.classList.contains('zen-focus-active')) return;
    this.appShell.classList.add('zen-peek-active');
    if (this.peekTimeout) clearTimeout(this.peekTimeout);
    this.peekTimeout = setTimeout(() => {
      if (this.appShell) this.appShell.classList.remove('zen-peek-active');
    }, 4000);
  }

  formatTime(totalSecs) {
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return {
      minutes: String(m).padStart(2, '0'),
      seconds: String(s).padStart(2, '0')
    };
  }

  renderThemedTimer(clockId, minutes, seconds) {
    // 1. Retro 3D Flip Clock
    if (clockId === 'flip') {
      return `
        <div class="flip-clock-container" style="gap: 0.4rem;">
          <div class="flip-group">
            <div class="flip-unit" style="width: 2.8rem; height: 3.8rem; font-size: 2.2rem;"><div class="flip-card-top"><span>${minutes[0]}</span></div><div class="flip-card-bottom"><span>${minutes[0]}</span></div></div>
            <div class="flip-unit" style="width: 2.8rem; height: 3.8rem; font-size: 2.2rem;"><div class="flip-card-top"><span>${minutes[1]}</span></div><div class="flip-card-bottom"><span>${minutes[1]}</span></div></div>
          </div>
          <div class="flip-divider text-2xl">:</div>
          <div class="flip-group">
            <div class="flip-unit" style="width: 2.8rem; height: 3.8rem; font-size: 2.2rem;"><div class="flip-card-top"><span>${seconds[0]}</span></div><div class="flip-card-bottom"><span>${seconds[0]}</span></div></div>
            <div class="flip-unit" style="width: 2.8rem; height: 3.8rem; font-size: 2.2rem;"><div class="flip-card-top"><span>${seconds[1]}</span></div><div class="flip-card-bottom"><span>${seconds[1]}</span></div></div>
          </div>
        </div>
      `;
    }
    // 2. Neon Glow
    if (clockId === 'neon') {
      return `<div class="neon-time text-5xl md:text-6xl font-bold tracking-tight">${minutes}:${seconds}</div>`;
    }
    // 3. Matrix Digital
    if (clockId === 'matrix') {
      return `
        <div class="matrix-clock-container py-0">
          <div class="matrix-time text-5xl font-mono">${minutes}:${seconds}</div>
        </div>
      `;
    }
    // 4. 7-Segment LED
    if (clockId === 'segmented') {
      return `
        <div class="segmented-clock-container text-6xl tracking-wider">
          <div class="seg-digit-group">${minutes}</div>
          <div class="seg-digit-group animate-pulse">:</div>
          <div class="seg-digit-group">${seconds}</div>
        </div>
      `;
    }
    // 5. AMOLED Minimal
    if (clockId === 'minimal') {
      return `<div class="amoled-time text-6xl md:text-7xl font-sans tracking-tight">${minutes}:${seconds}</div>`;
    }
    // 6. Star Trek LCARS
    if (clockId === 'lcars') {
      return `
        <div class="text-center font-mono">
          <div class="text-[10px] text-amber-400 tracking-widest uppercase">LCARS POMO</div>
          <div class="lcars-time text-5xl">${minutes}:${seconds}</div>
        </div>
      `;
    }
    // Default Clean Modern Display
    return `<div class="pomo-primary-time">${minutes}:${seconds}</div>`;
  }

  render() {
    if (!this.container) return;
    const state = store.getState();
    const pomo = state.pomoState;
    const activeSpace = store.getActiveSpace();
    const clockId = activeSpace.clockId || 'flip';
    const { minutes, seconds } = this.formatTime(pomo.remainingSeconds);

    const radius = 118;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference * (1 - pomo.remainingSeconds / (pomo.totalSeconds || 1));

    const totalSessionsInCycle = pomo.settings.longBreakInterval || 4;
    const currentInCycle = (pomo.totalCompletedSessions % totalSessionsInCycle) + 1;

    let cycleDotsHtml = '';
    for (let i = 1; i <= totalSessionsInCycle; i++) {
      if (i < currentInCycle) {
        cycleDotsHtml += `<span class="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-sm"></span>`;
      } else if (i === currentInCycle) {
        cycleDotsHtml += `<span class="w-3 h-3 rounded-full bg-blue-400 ring-4 ring-blue-500/25 animate-pulse"></span>`;
      } else {
        cycleDotsHtml += `<span class="w-2.5 h-2.5 rounded-full bg-white/20"></span>`;
      }
    }

    const stageLabel = pomo.stage === 'focus' ? 'Deep Work Sprint' : pomo.stage === 'shortBreak' ? 'Short Recharge' : 'Long Recovery';
    const ringColor = pomo.stage === 'focus' ? '#3b82f6' : pomo.stage === 'shortBreak' ? '#10b981' : '#a855f7';
    const btnBg = pomo.isRunning ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-900/40' : pomo.stage === 'focus' ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/40' : pomo.stage === 'shortBreak' ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/40' : 'bg-purple-600 hover:bg-purple-500 shadow-purple-900/40';

    this.container.innerHTML = `
      <div class="pomo-focus-stage" id="pomo-stage-outer">
        
        <!-- Sleek Corner Live Clock Pill -->
        <div class="pomo-corner-clock" id="pomo-corner-clock-box">
          <div class="flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span class="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Clock</span>
          </div>
          <span class="pomo-corner-time" id="pomo-corner-live-time">12:00:00</span>
          <span class="pomo-corner-date" id="pomo-corner-live-date">Sat, Aug 22</span>
        </div>

        <!-- Center Focus Dashboard Card -->
        <div class="pomo-center-card" id="pomo-card-main">
          
          <!-- Stage Selector Nav (Auto-fades in Zen mode) -->
          <div class="pomo-stage-nav">
            <button class="pomo-stage-btn ${pomo.stage === 'focus' ? 'active-focus' : ''}" data-pomo-stage="focus">
              Focus (${pomo.settings.focusDuration}m)
            </button>
            <button class="pomo-stage-btn ${pomo.stage === 'shortBreak' ? 'active-short' : ''}" data-pomo-stage="shortBreak">
              Short Break (${pomo.settings.shortBreakDuration}m)
            </button>
            <button class="pomo-stage-btn ${pomo.stage === 'longBreak' ? 'active-long' : ''}" data-pomo-stage="longBreak">
              Long Break (${pomo.settings.longBreakDuration}m)
            </button>
          </div>

          <!-- Session Cycle Dots (Auto-fades in Zen mode) -->
          <div class="pomo-cycle-row">
            <div class="flex items-center gap-1.5">${cycleDotsHtml}</div>
            <span class="text-[11px] font-mono font-medium text-neutral-400">Session ${currentInCycle} of ${totalSessionsInCycle}</span>
          </div>

          <!-- Circular Ring & Timer Viewport (Always visible in Zen mode) -->
          <div class="pomo-circle-wrapper">
            <svg class="pomo-svg-ring" viewBox="0 0 260 260">
              <!-- Background Track -->
              <circle cx="130" cy="130" r="${radius}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="7" />
              <!-- Progress Arc -->
              <circle id="pomo-progress-arc" cx="130" cy="130" r="${radius}" fill="none" stroke="${ringColor}" stroke-width="7" stroke-dasharray="${circumference}" stroke-dashoffset="${strokeDashoffset}" stroke-linecap="round" class="transition-all duration-1000 ease-linear" />
            </svg>
            <div id="pomo-digits-box" class="pomo-digits-box">
              ${this.renderThemedTimer(clockId, minutes, seconds)}
              <div class="pomo-stage-subtitle" id="pomo-stage-subtitle-text">${stageLabel}</div>
            </div>
          </div>

          <!-- Quick Duration Presets (Auto-fades in Zen mode) -->
          <div class="pomo-presets-bar">
            <button class="pomo-preset-chip" data-preset="25">25 / 5m</button>
            <button class="pomo-preset-chip" data-preset="50">50 / 10m</button>
            <button class="pomo-preset-chip" data-preset="90">90 / 20m</button>
          </div>

          <!-- Action Controls Bar (Essential controls remain visible) -->
          <div class="pomo-controls-bar">
            <button class="btn-icon" id="pomo-btn-reset" title="Reset Session">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            </button>
            
            <button class="pomo-btn-main shadow-xl ${btnBg}" id="pomo-btn-toggle">
              ${pomo.isRunning ? `
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                <span>Pause</span>
              ` : `
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                <span>${pomo.stage === 'focus' ? 'Start Focus' : 'Start Break'}</span>
              `}
            </button>

            <button class="btn-icon" id="pomo-btn-skip" title="Skip Stage">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
            </button>

            <button class="btn-icon" id="pomo-btn-settings" title="Customize Settings">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
          </div>

        </div>

      </div>
    `;

    this.initListeners();
    this.startCornerClock();
  }

  updateTimeOnly() {
    const pomo = store.getState().pomoState;
    const { minutes, seconds } = this.formatTime(pomo.remainingSeconds);
    const box = this.container.querySelector('#pomo-digits-box');
    const clockId = store.getActiveSpace().clockId || 'flip';
    if (box) {
      box.innerHTML = `
        ${this.renderThemedTimer(clockId, minutes, seconds)}
        <div class="pomo-stage-subtitle" id="pomo-stage-subtitle-text">${pomo.stage === 'focus' ? 'Deep Work Sprint' : pomo.stage === 'shortBreak' ? 'Short Recharge' : 'Long Recovery'}</div>
      `;
    }
    const arc = this.container.querySelector('#pomo-progress-arc');
    if (arc) {
      const radius = 118;
      const circumference = 2 * Math.PI * radius;
      const offset = circumference * (1 - pomo.remainingSeconds / (pomo.totalSeconds || 1));
      arc.setAttribute('stroke-dashoffset', offset);
    }
  }

  startCornerClock() {
    if (this.cornerClockInterval) clearInterval(this.cornerClockInterval);
    const updateCorner = () => {
      const now = new Date();
      const timeEl = this.container.querySelector('#pomo-corner-live-time');
      const dateEl = this.container.querySelector('#pomo-corner-live-date');
      if (timeEl) {
        timeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: !store.getState().clockConfig.is24Hour });
      }
      if (dateEl) {
        dateEl.textContent = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
      }
    };
    updateCorner();
    this.cornerClockInterval = setInterval(updateCorner, 1000);
  }

  initListeners() {
    // Tap sideways / background to peek UI in Zen mode
    const outerStage = this.container.querySelector('#pomo-stage-outer');
    if (outerStage) {
      outerStage.addEventListener('click', (e) => {
        if (!e.target.closest('button') && !e.target.closest('input')) {
          this.triggerZenPeek();
        }
      });
    }

    this.container.querySelectorAll('[data-pomo-stage]').forEach(btn => {
      btn.addEventListener('click', () => {
        const stage = btn.getAttribute('data-pomo-stage');
        store.setPomoStage(stage);
        soundEngine.playFlipTick();
      });
    });

    this.container.querySelectorAll('[data-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = parseInt(btn.getAttribute('data-preset'), 10);
        if (p === 25) store.updatePomoSettings({ focusDuration: 25, shortBreakDuration: 5 });
        else if (p === 50) store.updatePomoSettings({ focusDuration: 50, shortBreakDuration: 10 });
        else if (p === 90) store.updatePomoSettings({ focusDuration: 90, shortBreakDuration: 20 });
        soundEngine.playFlipTick();
      });
    });

    const toggleBtn = this.container.querySelector('#pomo-btn-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        store.togglePomoRunning();
        soundEngine.playFlipTick();
      });
    }

    const resetBtn = this.container.querySelector('#pomo-btn-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        store.resetPomo();
        soundEngine.playFlipTick();
      });
    }

    const skipBtn = this.container.querySelector('#pomo-btn-skip');
    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        const s = store.getState().pomoState;
        if (s.stage === 'focus') store.setPomoStage('shortBreak');
        else store.setPomoStage('focus');
        soundEngine.playFlipTick();
      });
    }

    const setBtn = this.container.querySelector('#pomo-btn-settings');
    if (setBtn) {
      setBtn.addEventListener('click', () => {
        const custBtn = document.getElementById('btn-customize');
        if (custBtn) custBtn.click();
      });
    }
  }

  unmount() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    if (this.cornerClockInterval) clearInterval(this.cornerClockInterval);
    if (this.peekTimeout) clearTimeout(this.peekTimeout);
    if (this.appShell) {
      this.appShell.classList.remove('zen-focus-active');
      this.appShell.classList.remove('zen-peek-active');
    }
    if (this.container) this.container.innerHTML = '';
  }
}


// --- burnInProtector.js ---



class BurnInProtector {
  constructor() {
    this.intervalId = null;
    this.stageEl = null;
  }

  start() {
    this.stageEl = document.getElementById("main-stage");
    if (this.intervalId) clearInterval(this.intervalId);

    // Shift 1-2px every 60 seconds
    this.intervalId = setInterval(() => {
      if (!this.stageEl) this.stageEl = document.getElementById("main-stage");
      if (!this.stageEl) return;
      const config = store.getState().burnInProtection;
      if (!config || !config.enabled) {
        this.stageEl.style.transform = "none";
        return;
      }

      const dx = (Math.random() * 4 - 2).toFixed(1);
      const dy = (Math.random() * 4 - 2).toFixed(1);
      this.stageEl.style.transform = `translate(${dx}px, ${dy}px)`;
      this.stageEl.classList.add("burn-in-shifted");
    }, 60000);
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    if (this.stageEl) this.stageEl.style.transform = "none";
  }
}

var burnInProtector = window.standbyBurnInProtector || (window.standbyBurnInProtector = new BurnInProtector());


// --- app.js ---








// Clocks












// Widgets










// Components







class App {
  constructor() {
    this.stageEl = document.getElementById('main-stage');
    this.currentPomoView = null;
    this.init();
  }

  init() {
    // 1. Register All 11 Clock Faces
    clockEngine.register('flip', flipClock);
    clockEngine.register('neon', neonClock);
    clockEngine.register('matrix', matrixClock);
    clockEngine.register('solar', solarClock);
    clockEngine.register('bigcrop', bigCropClock);
    clockEngine.register('radial', radialClock);
    clockEngine.register('day', dayClock);
    clockEngine.register('segmented', segmentedClock);
    clockEngine.register('analogdigital', analogDigitalClock);
    clockEngine.register('minimal', amoledClock);
    clockEngine.register('lcars', lcarsClock);

    // 2. Register All 9 Widgets
    widgetEngine.register('weather', weatherWidget);
    widgetEngine.register('calendar', calendarWidget);
    widgetEngine.register('media', mediaWidget);
    widgetEngine.register('timer', timerWidget);
    widgetEngine.register('todo', todoWidget);
    widgetEngine.register('tally', tallyWidget);
    widgetEngine.register('quote', quoteWidget);
    widgetEngine.register('photo', photoWidget);
    widgetEngine.register('vibes', vibesWidget);

    // 3. Initialize Visualizer & Ambient Canvas
    const canvas = document.getElementById('ambient-canvas-layer');
    if (canvas) {
      visualizerEngine.init(canvas);
      visualizerEngine.setMode(store.getState().vibes.visualizer || 'stars');
    }

    // 4. Initialize Core UI Components
    new SpacesNav(document.getElementById('spaces-nav-container'));
    new CustomizeModal();
    new PhotoModal();
    new NightModeController();
    new Screensaver();

    // 5. Initialize Hardware Protection
    burnInProtector.start();

    // 6. Bind Global Fullscreen and Keyboard Actions
    this.initGlobalControls();

    // 7. Subscribe to Reactive Store Updates
    store.subscribe((event) => {
      if (
        event === 'space_changed' ||
        event === 'space_updated' ||
        event === 'clock_config_updated'
      ) {
        this.renderStage();
      }
      if (event === 'visualizer_changed') {
        visualizerEngine.setMode(store.getState().vibes.visualizer);
      }
      if (event === 'vibe_changed') {
        soundEngine.playAmbient(store.getState().vibes.activeTrack);
      }
    });

    // 8. Render Initial Active Stage
    this.renderStage();
  }

  initGlobalControls() {
    const fullscreenBtn = document.getElementById('btn-fullscreen');
    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      });
    }

    // Battery API Status
    const batteryStatusText = document.getElementById('battery-status-text');
    if (batteryStatusText && 'getBattery' in navigator) {
      navigator.getBattery().then(battery => {
        const updateBattery = () => {
          const level = Math.round(battery.level * 100);
          batteryStatusText.textContent = `${level}% ${battery.charging ? 'PWR' : 'BAT'}`;
        };
        updateBattery();
        battery.addEventListener('levelchange', updateBattery);
        battery.addEventListener('chargingchange', updateBattery);
      });
    }

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
      if (e.key === 'f' || e.key === 'F') {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
        else document.exitFullscreen().catch(() => {});
      } else if (e.key === 'n' || e.key === 'N') {
        store.toggleNightMode();
      } else if (e.key === '1') store.setActiveSpace('home');
      else if (e.key === '2') store.setActiveSpace('work');
      else if (e.key === '3') store.setActiveSpace('focus');
      else if (e.key === '4') store.setActiveSpace('night');
    });
  }

  renderStage() {
    if (!this.stageEl) return;

    if (this.currentPomoView) {
      this.currentPomoView.unmount();
      this.currentPomoView = null;
    }
    clockEngine.unmount();
    widgetEngine.unmountAll();

    const activeSpace = store.getActiveSpace();
    const clockConfig = store.getState().clockConfig;
    const layout = activeSpace.layout || 'standalone';

    // Layout A: Dedicated Pomodoro Focus Mode
    if (layout === 'focus' || activeSpace.id === 'focus') {
      this.currentPomoView = new PomoFocusView(this.stageEl);
      return;
    }

    // Layout B: Standalone Fullscreen Clock
    if (layout === 'standalone') {
      this.stageEl.innerHTML = `<div class="layout-standalone" id="standalone-clock-slot"></div>`;
      const slot = document.getElementById('standalone-clock-slot');
      clockEngine.mount(activeSpace.clockId || 'flip', slot, clockConfig);
      return;
    }

    // Layout C: Duo Split Mode (2 Panels)
    if (layout === 'duo') {
      this.stageEl.innerHTML = `
        <div class="layout-duo">
          <div class="widget-panel" id="duo-panel-1"></div>
          <div class="widget-panel" id="duo-panel-2"></div>
        </div>
      `;
      const panel1 = document.getElementById('duo-panel-1');
      const panel2 = document.getElementById('duo-panel-2');
      const w1 = activeSpace.widgets[0] || 'clock';
      const w2 = activeSpace.widgets[1] || 'weather';

      if (w1 === 'clock') clockEngine.mount(activeSpace.clockId || 'flip', panel1, clockConfig);
      else widgetEngine.mount(w1, panel1, 'duo-1');

      if (w2 === 'clock') clockEngine.mount(activeSpace.clockId || 'flip', panel2, clockConfig);
      else widgetEngine.mount(w2, panel2, 'duo-2');
      return;
    }

    // Layout D: Quad Grid Mode (4 Panels)
    if (layout === 'quad') {
      this.stageEl.innerHTML = `
        <div class="layout-quad">
          <div class="widget-panel" id="quad-panel-1"></div>
          <div class="widget-panel" id="quad-panel-2"></div>
          <div class="widget-panel" id="quad-panel-3"></div>
          <div class="widget-panel" id="quad-panel-4"></div>
        </div>
      `;
      const quadWidgets = activeSpace.quadWidgets || ['weather', 'calendar', 'media', 'timer'];
      quadWidgets.forEach((widgetId, index) => {
        const slot = document.getElementById(`quad-panel-${index + 1}`);
        if (slot) {
          if (widgetId === 'clock' || (index === 0 && widgetId === activeSpace.clockId)) {
            clockEngine.mount(activeSpace.clockId || 'flip', slot, clockConfig);
          } else {
            widgetEngine.mount(widgetId, slot, `quad-${index + 1}`);
          }
        }
      });
    }
  }
}

// Global Launcher
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.standbyApp = new App();
  });
} else {
  window.standbyApp = new App();
}


})();