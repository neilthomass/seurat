// Seurat dot converter — browser glue around the WebAssembly core.
// Decodes a video, downscales each frame to the dot grid, runs it through the
// WASM DotConverter, and packs the result into the .seurat format the player reads.

import createConverter from '../wasm/converter.js';
import { encodeSeurat } from './seurat.ts';

export interface ConvertOptions {
  fps?: number;
  gridWidth?: number;
  skipStartFrames?: number;
  skipEndFrames?: number;
  cropTop?: number;
}

export interface DotResult {
  rgbFrames: Uint8Array[];
  fps: number;
  width: number;
  height: number;
  frameCount: number;
  duration: number;
}

export interface Progress {
  stage: 'extracting' | 'converting' | 'complete';
  current?: number;
  total?: number;
  percent: number;
}

let modulePromise: Promise<any> | null = null;
const loadModule = () => (modulePromise ??= createConverter());

export class SeuratDotConverter {
  whiteThreshold: number;
  contrast: number;
  exposure: number;
  maskedPixels: Set<string>;
  onProgress: (p: Progress) => void;
  private conv: any = null;

  constructor(options: Partial<Pick<SeuratDotConverter, 'whiteThreshold' | 'contrast' | 'exposure' | 'maskedPixels' | 'onProgress'>> = {}) {
    this.whiteThreshold = options.whiteThreshold ?? 240;
    this.contrast = options.contrast ?? 100;
    this.exposure = options.exposure ?? 0;
    this.maskedPixels = options.maskedPixels ?? new Set();
    this.onProgress = options.onProgress ?? (() => {});
  }

  async ready() {
    if (!this.conv) {
      const Module = await loadModule();
      this.conv = new Module.DotConverter();
    }
    this.applySettings();
    return this.conv;
  }

  update(options: Partial<Pick<SeuratDotConverter, 'whiteThreshold' | 'contrast' | 'exposure' | 'maskedPixels'>> = {}) {
    Object.assign(this, options);
    if (this.conv) this.applySettings();
  }

  gridHeight(srcWidth: number, srcHeight: number, gridWidth: number): number {
    return this.conv.gridHeight(srcWidth, srcHeight, gridWidth);
  }

  // One already-downscaled RGBA grid frame -> packed RGB frame (for live preview).
  convertGridFrame(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
    return this.conv.convertFrame(rgba, width, height).slice();
  }

  async convertToDots(videoFile: File, options: ConvertOptions = {}): Promise<DotResult> {
    const { fps = 10, gridWidth = 300, skipStartFrames = 0, skipEndFrames = 0, cropTop = 0 } = options;
    await this.ready();

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;

    try {
      await this.loadMetadata(video, videoFile);
      const srcW = video.videoWidth;
      const srcH = Math.max(1, video.videoHeight - cropTop);
      const width = gridWidth;
      const height = this.gridHeight(srcW, srcH, gridWidth);

      const grid = document.createElement('canvas');
      grid.width = width;
      grid.height = height;
      const ctx = grid.getContext('2d', { willReadFrequently: true })!;

      const rgbFrames: Uint8Array[] = [];
      await this.eachFrame(video, fps, skipStartFrames, skipEndFrames, (index, total) => {
        ctx.drawImage(video, 0, cropTop, srcW, srcH, 0, 0, width, height);
        const { data } = ctx.getImageData(0, 0, width, height);
        rgbFrames.push(this.convertGridFrame(data, width, height));
        this.onProgress({ stage: 'converting', current: index + 1, total, percent: Math.round(((index + 1) / total) * 100) });
      });

      this.onProgress({ stage: 'complete', percent: 100 });
      return { rgbFrames, fps, width, height, frameCount: rgbFrames.length, duration: rgbFrames.length / fps };
    } finally {
      video.removeAttribute('src');
      video.load();
    }
  }

  // Pack frames into a single .seurat file (additive delta, 4-bit color).
  async toSeurat(result: DotResult): Promise<Blob> {
    return encodeSeurat(
      { width: result.width, height: result.height, fps: result.fps, frameCount: result.frameCount },
      result.rgbFrames,
    );
  }

  dispose() {
    this.conv?.delete();
    this.conv = null;
  }

  private applySettings() {
    const c = this.conv;
    c.setContrast(this.contrast);
    c.setExposure(this.exposure);
    c.setWhiteThreshold(this.whiteThreshold);
    c.clearMask();
    for (const k of this.maskedPixels) {
      const [x, y] = k.split(',').map(Number);
      c.addMaskPixel(x, y);
    }
  }

  private loadMetadata(video: HTMLVideoElement, file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Failed to load video'));
      video.src = URL.createObjectURL(file);
    });
  }

  private eachFrame(
    video: HTMLVideoElement,
    fps: number,
    skipStart: number,
    skipEnd: number,
    onFrame: (index: number, total: number) => void,
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      const total = Math.max(0, Math.floor(video.duration * fps) - skipStart - skipEnd);
      let i = 0;
      const seek = () => {
        if (i >= total) return resolve(total);
        video.currentTime = (skipStart + i) * (1 / fps);
      };
      video.onseeked = () => {
        onFrame(i, total);
        i++;
        this.onProgress({ stage: 'extracting', current: i, total, percent: Math.round((i / total) * 50) });
        setTimeout(seek, 0);
      };
      video.onerror = () => reject(new Error('Failed to read frame'));
      seek();
    });
  }
}
