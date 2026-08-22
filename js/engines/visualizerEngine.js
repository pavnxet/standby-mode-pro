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

export const visualizerEngine = new VisualizerEngine();
