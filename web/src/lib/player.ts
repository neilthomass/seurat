// Seurat dot player — renders and plays .seurat dot animations on a canvas.
//
// Self-contained and dependency-free: playback (play / pause / seek / fps),
// responsive + retina layout, and poppable dots (click or drag to pop, with a
// burst, an optional pop-count callback, and reset). This is everything needed
// to replicate the interactive dot player — copy this one file (plus seurat.ts).

import { decodeSeurat, type SeuratMeta } from './seurat.ts';

const WHITE = 0.95;

export interface DotPlayerOptions {
  background?: string;
  interactive?: boolean;
  popRadius?: number;
  onPop?: (total: number) => void;
  onPopCell?: (x: number, y: number) => void;
  // 'width' (default): canvas fills its parent's width. 'none': the caller
  // styles the canvas (e.g. height-bounded) and the bitmap tracks its own size.
  fit?: 'width' | 'none';
}

interface Burst { cx: number; cy: number; color: string; r: number; vel: Float32Array; t: number }

export class DotPlayer {
  canvas: HTMLCanvasElement;
  meta: SeuratMeta | null = null;
  frame = 0;
  fps = 12;
  playing = false;
  popCount = 0;

  private ctx: CanvasRenderingContext2D;
  private background: string;
  private interactive: boolean;
  private popRadius: number;
  private onPop?: (total: number) => void;
  private onPopCell?: (x: number, y: number) => void;
  private frames: Uint8Array | null = null;
  private cellSize = 0;
  private lastWidth = 0;
  private timer: number | null = null;
  private observer: ResizeObserver;

  private fit: 'width' | 'none';
  private popped = new Set<number>();
  private bursts: Burst[] = [];
  private burstRaf = 0;
  private lastBurstTime = 0;
  private dragging = false;
  private lastX = -1;
  private lastY = -1;

  constructor(canvas: HTMLCanvasElement, opts: DotPlayerOptions = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.background = opts.background ?? '#fcfcfc';
    this.interactive = opts.interactive ?? true;
    this.popRadius = opts.popRadius ?? 1;
    this.onPop = opts.onPop;
    this.onPopCell = opts.onPopCell;
    this.fit = opts.fit ?? 'width';

    canvas.style.display = 'block';
    if (this.fit === 'width') {
      canvas.style.width = '100%';
      canvas.style.height = 'auto';
    }

    this.observer = new ResizeObserver(() => this.layout());
    this.observer.observe(this.fit === 'none' ? canvas : (canvas.parentElement ?? canvas));

    if (this.interactive) {
      canvas.style.cursor = 'crosshair';
      canvas.style.touchAction = 'none';
      canvas.addEventListener('pointerdown', this.onPointerDown);
      canvas.addEventListener('pointermove', this.onPointerMove);
      window.addEventListener('pointerup', this.onPointerUp);
    }
  }

  async loadUrl(url: string) {
    const buf = await fetch(url).then((r) => r.arrayBuffer());
    const { metadata, frames } = await decodeSeurat(buf);
    return this.setData(metadata, frames);
  }

  async loadFile(file: File) {
    const { metadata, frames } = await decodeSeurat(await file.arrayBuffer());
    return this.setData(metadata, frames);
  }

  setData(meta: SeuratMeta, frames: Uint8Array) {
    this.meta = meta;
    this.frames = frames;
    this.frame = 0;
    this.fps = meta.fps > 0 ? meta.fps : 12;
    this.lastWidth = 0;
    this.popped.clear();
    this.bursts.length = 0;
    this.popCount = 0;
    this.layout();
    this.show(0);
    return this;
  }

  setFps(fps: number) {
    this.fps = fps > 0 ? fps : 12;
  }

  resetPops() {
    this.popped.clear();
    this.popCount = 0;
    this.onPop?.(0);
    this.show(this.frame);
  }

  layout() {
    if (!this.meta) return;
    const ref = this.fit === 'none' ? this.canvas : (this.canvas.parentElement ?? this.canvas);
    const box = ref.clientWidth;
    const cssWidth = box || this.meta.width * 8;
    if (cssWidth === this.lastWidth) return;
    this.lastWidth = cssWidth;

    const dpr = window.devicePixelRatio || 1;
    this.cellSize = cssWidth / this.meta.width;
    this.canvas.width = Math.round(cssWidth * dpr);
    this.canvas.height = Math.round(this.meta.height * this.cellSize * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.show(this.frame);
  }

  show(index: number) {
    if (!this.frames || !this.meta) return;
    this.frame = index;
    const { width, height } = this.meta;
    const cell = this.cellSize;
    const ctx = this.ctx;
    const base = index * width * height * 3;

    ctx.fillStyle = this.background;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (this.popped.has(y * width + x)) continue;
        const o = base + (y * width + x) * 3;
        const r = this.frames[o], g = this.frames[o + 1], b = this.frames[o + 2];
        const brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        if (brightness >= WHITE) continue;
        const radius = (cell / 2) * Math.min(1, 1 - brightness + 0.3);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.beginPath();
        ctx.arc(x * cell + cell / 2, y * cell + cell / 2, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Particle bursts (matches neiltthomas.com: 8 particles, ease-out cubic).
    for (const b of this.bursts) {
      const eased = 1 - Math.pow(1 - b.t, 3);
      const scale = Math.max(0.1, b.r * (1 - eased * 0.7));
      ctx.globalAlpha = Math.max(0, 1 - eased);
      ctx.fillStyle = b.color;
      for (let k = 0; k < b.vel.length; k += 2) {
        ctx.beginPath();
        ctx.arc(b.cx + b.vel[k] * eased, b.cy + b.vel[k + 1] * eased, scale, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  play() {
    if (this.playing || !this.meta || this.meta.frameCount <= 1) return;
    this.playing = true;
    const step = () => {
      this.show((this.frame + 1) % this.meta!.frameCount);
      this.timer = window.setTimeout(step, 1000 / this.fps);
    };
    this.timer = window.setTimeout(step, 1000 / this.fps);
  }

  pause() {
    this.playing = false;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  toggle() {
    this.playing ? this.pause() : this.play();
  }

  seek(index: number) {
    if (!this.meta) return;
    this.show(Math.max(0, Math.min(this.meta.frameCount - 1, index)));
  }

  destroy() {
    this.pause();
    cancelAnimationFrame(this.burstRaf);
    this.observer.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
  }

  // ── Popping ────────────────────────────────────────────────────────────────

  private cellAt(clientX: number, clientY: number): [number, number] | null {
    if (!this.meta) return null;
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = Math.floor(((clientX - rect.left) / rect.width) * this.meta.width);
    const y = Math.floor(((clientY - rect.top) / rect.height) * this.meta.height);
    return [x, y];
  }

  private dotInfoAt(x: number, y: number): { color: string; radius: number } | null {
    if (!this.frames || !this.meta) return null;
    const { width, height } = this.meta;
    if (x < 0 || y < 0 || x >= width || y >= height) return null;
    if (this.popped.has(y * width + x)) return null;
    const o = this.frame * width * height * 3 + (y * width + x) * 3;
    const r = this.frames[o], g = this.frames[o + 1], b = this.frames[o + 2];
    const bri = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (bri >= WHITE) return null;
    return { color: `rgb(${r},${g},${b})`, radius: (this.cellSize / 2) * Math.min(1, 1 - bri + 0.3) };
  }

  // Spawn an 8-particle burst, matching neiltthomas.com's pop.
  private spawnBurst(x: number, y: number, color: string, baseR: number) {
    const cell = this.cellSize;
    const n = 8;
    const pr = Math.max(baseR * 0.5, cell * 0.2);
    const speed = cell * 4;
    const vel = new Float32Array(n * 2);
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * Math.PI * 2 + Math.random() * 0.6;
      const s = speed * (0.6 + Math.random() * 0.8);
      vel[k * 2] = Math.cos(ang) * s;
      vel[k * 2 + 1] = Math.sin(ang) * s;
    }
    this.bursts.push({ cx: x * cell + cell / 2, cy: y * cell + cell / 2, color, r: pr, vel, t: 0 });
  }

  private popAround(gx: number, gy: number) {
    if (!this.meta) return;
    const r = this.popRadius;
    let popped = false;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const x = gx + dx, y = gy + dy;
        const info = this.dotInfoAt(x, y);
        if (!info) continue;
        this.popped.add(y * this.meta.width + x);
        this.popCount++;
        this.spawnBurst(x, y, info.color, info.radius);
        this.onPopCell?.(x, y);
        popped = true;
      }
    }
    if (popped) {
      this.onPop?.(this.popCount);
      this.show(this.frame);
      this.startBursts();
    }
  }

  // Interpolate along the drag so fast moves don't skip dots.
  private popLine(x0: number, y0: number, x1: number, y1: number) {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, x = x0, y = y0;
    for (;;) {
      this.popAround(x, y);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  }

  private startBursts() {
    if (this.burstRaf) return;
    this.lastBurstTime = performance.now();
    const tick = (now: number) => {
      const dt = (now - this.lastBurstTime) / 1000;
      this.lastBurstTime = now;
      for (const b of this.bursts) b.t += dt / 0.6;
      this.bursts = this.bursts.filter((b) => b.t < 1);
      this.show(this.frame);
      if (this.bursts.length) {
        this.burstRaf = requestAnimationFrame(tick);
      } else {
        this.burstRaf = 0;
      }
    };
    this.burstRaf = requestAnimationFrame(tick);
  }

  private onPointerDown = (e: PointerEvent) => {
    const cell = this.cellAt(e.clientX, e.clientY);
    if (!cell) return;
    this.dragging = true;
    [this.lastX, this.lastY] = cell;
    this.popAround(cell[0], cell[1]);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    const cell = this.cellAt(e.clientX, e.clientY);
    if (!cell) return;
    if (this.lastX >= 0) this.popLine(this.lastX, this.lastY, cell[0], cell[1]);
    else this.popAround(cell[0], cell[1]);
    [this.lastX, this.lastY] = cell;
  };

  private onPointerUp = () => {
    this.dragging = false;
    this.lastX = -1;
    this.lastY = -1;
  };
}
