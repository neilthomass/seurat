import { useCallback, useEffect, useRef, useState } from 'react';
import { SeuratDotConverter } from '../lib/converter.ts';
import { DotPlayer } from '../lib/player.ts';
import type { Animation } from './Player.tsx';

const download = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const CROP_TOP = 5;

const sourceDims = (el: HTMLVideoElement | HTMLImageElement): [number, number] =>
  el instanceof HTMLVideoElement ? [el.videoWidth, el.videoHeight] : [el.naturalWidth, el.naturalHeight];

interface Opts {
  contrast: number;
  exposure: number;
  threshold: number;
  fps: number;
  width: number;
  skipStart: number;
  skipEnd: number;
}

function Slider({ label, value, suffix = '', min, max, step = 1, onChange }: { label: string; value: number; suffix?: string; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="label">{label}</span>
        <span className="mono text-sm text-ink">{value}{suffix}</span>
      </div>
      <input className="slider" type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

// One timeline, two handles: a kept window of frames.
function FrameWindow({ total, start, end, onStart, onEnd }: { total: number; start: number; end: number; onStart: (v: number) => void; onEnd: (v: number) => void }) {
  const last = Math.max(0, total - 1);
  const lo = start;
  const hi = last - end;
  const pct = (v: number) => (last > 0 ? (v / last) * 100 : 0);
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="label">Frame window</span>
        <span className="mono text-sm text-ink">{Math.max(0, hi - lo + 1)} frames</span>
      </div>
      <div className="relative h-4">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
        <div className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-ink" style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }} />
        <input className="range-dual" type="range" min={0} max={last} value={lo} onChange={(e) => onStart(Math.min(Number(e.target.value), hi))} />
        <input className="range-dual" type="range" min={0} max={last} value={hi} onChange={(e) => onEnd(last - Math.max(Number(e.target.value), lo))} />
      </div>
    </div>
  );
}

export default function Converter({ onPlay }: { onPlay: (anim: Animation) => void }) {
  const [opts, setOpts] = useState<Opts>({ contrast: 100, exposure: 0, threshold: 240, fps: 10, width: 120, skipStart: 2, skipEnd: 0 });
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const set = <K extends keyof Opts>(k: K, v: number) => setOpts((o) => ({ ...o, [k]: v }));

  const [ready, setReady] = useState(false);
  const [hasVideo, setHasVideo] = useState(false);
  const [frame, setFrame] = useState(0);
  const [total, setTotal] = useState(1);
  const [sourceFrames, setSourceFrames] = useState(1);
  const [fileName, setFileName] = useState('video');
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const playableRef = useRef<Animation | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement>(null);
  const dotCanvasRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef<HTMLCanvasElement | null>(null);
  const playerRef = useRef<DotPlayer | null>(null);
  const sourceElRef = useRef<HTMLVideoElement | HTMLImageElement | null>(null);
  const maskedRef = useRef(new Set<string>());
  const convRef = useRef<SeuratDotConverter | null>(null);
  if (!convRef.current) {
    convRef.current = new SeuratDotConverter();
    convRef.current.maskedPixels = maskedRef.current;
  }
  const fileRef = useRef<File | null>(null);

  const renderPreview = useCallback(async () => {
    const el = sourceElRef.current;
    const dotCanvas = dotCanvasRef.current;
    const srcCanvas = sourceCanvasRef.current;
    if (!el || !dotCanvas || !srcCanvas) return;
    const [sw, sh0] = sourceDims(el);
    if (!sw) return;
    const sh = Math.max(1, sh0 - CROP_TOP);

    const conv = convRef.current!;
    await conv.ready();
    const o = optsRef.current;

    const scale = Math.min(1, 900 / sw);
    srcCanvas.width = Math.round(sw * scale);
    srcCanvas.height = Math.round(sh * scale);
    srcCanvas.getContext('2d')!.drawImage(el, 0, CROP_TOP, sw, sh, 0, 0, srcCanvas.width, srcCanvas.height);

    const w = o.width;
    const h = conv.gridHeight(sw, sh, w);
    const grid = (gridRef.current ??= document.createElement('canvas'));
    grid.width = w;
    grid.height = h;
    const ctx = grid.getContext('2d', { willReadFrequently: true })!;
    conv.update({ contrast: o.contrast, exposure: o.exposure, whiteThreshold: o.threshold });
    ctx.drawImage(el, 0, CROP_TOP, sw, sh, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    const fr = conv.convertGridFrame(data, w, h);

    if (!playerRef.current) {
      playerRef.current = new DotPlayer(dotCanvas, {
        onPopCell: (x, y) => maskedRef.current.add(`${x},${y}`),
      });
    }
    playerRef.current.setData({ width: w, height: h, fps: 1, frameCount: 1, format: 'raw' }, fr);
    setReady(true);
  }, []);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      if (sourceElRef.current) return;
      sourceElRef.current = img;
      renderPreview();
    };
    img.src = '/example.jpg';
  }, [renderPreview]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !hasVideo) return;
    v.currentTime = (opts.skipStart + frame) / opts.fps;
  }, [frame, opts.fps, opts.skipStart, hasVideo]);

  useEffect(() => {
    if (ready) renderPreview();
  }, [opts.contrast, opts.exposure, opts.threshold, opts.width, renderPreview, ready]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !hasVideo) return;
    const src = Math.floor(v.duration * opts.fps);
    setSourceFrames(src);
    setTotal(Math.max(1, src - opts.skipStart - opts.skipEnd));
    setFrame((f) => Math.min(f, Math.max(0, src - opts.skipStart - opts.skipEnd - 1)));
  }, [opts.fps, opts.skipStart, opts.skipEnd, hasVideo]);

  useEffect(() => () => {
    playerRef.current?.destroy();
    convRef.current?.dispose();
  }, []);

  const clearMask = () => {
    maskedRef.current.clear();
    playerRef.current?.resetPops();
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    fileRef.current = f;
    setFileName(f.name.replace(/\.[^.]+$/, '') || 'video');
    setDone(null);
    setError(null);
    clearMask();
    const v = videoRef.current!;
    sourceElRef.current = v;
    v.src = URL.createObjectURL(f);
  };

  const onMeta = () => {
    const v = videoRef.current!;
    const o = optsRef.current;
    const src = Math.floor(v.duration * o.fps);
    setHasVideo(true);
    setSourceFrames(src);
    setTotal(Math.max(1, src - o.skipStart - o.skipEnd));
    setFrame(0);
    v.currentTime = o.skipStart / o.fps;
  };

  const setWidth = (v: number) => {
    clearMask(); // dot coordinates change with the grid
    set('width', v);
  };

  const convert = async () => {
    const file = fileRef.current;
    if (!file) return;
    setConverting(true);
    setError(null);
    setDone(null);
    setProgress(0);
    const conv = convRef.current!;
    conv.onProgress = ({ percent }) => setProgress(percent ?? 0);
    conv.update({ contrast: opts.contrast, exposure: opts.exposure, whiteThreshold: opts.threshold });
    try {
      const res = await conv.convertToDots(file, { fps: opts.fps, gridWidth: opts.width, skipStartFrames: opts.skipStart, skipEndFrames: opts.skipEnd, cropTop: CROP_TOP });
      download(await conv.toSeurat(res), `${fileName}.seurat`);

      // Keep the result in memory so "Play your file" can open it instantly.
      const per = res.width * res.height * 3;
      const frames = new Uint8Array(res.rgbFrames.length * per);
      res.rgbFrames.forEach((f, i) => frames.set(f, i * per));
      playableRef.current = { meta: { width: res.width, height: res.height, fps: res.fps, frameCount: res.frameCount, format: 'raw' }, frames };
      setDone(fileName);
    } catch (e) {
      setError((e as Error).message || 'Conversion failed');
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl py-14">
      <video ref={videoRef} onLoadedMetadata={onMeta} onSeeked={renderPreview} muted playsInline className="hidden" />

      <header className="mb-10 max-w-2xl">
        <p className="eyebrow mb-4">Pointillist video converter</p>
        <h1 className="font-display text-[2.6rem] font-extrabold leading-[1.02] tracking-tight sm:text-6xl">
          Resolve any video<br />into a field of dots.
        </h1>
        <p className="mt-5 text-lg text-muted">
          Drop in a clip; Seurat rebuilds every frame as thousands of points of color, tuned live,
          right in your browser, then exported as a single <span className="mono text-[0.92em] text-ink">.seurat</span> file.
        </p>
      </header>

      <div className="card card-raised p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <div className="overflow-hidden rounded-xl"><canvas ref={sourceCanvasRef} className="w-full" style={{ display: 'block' }} /></div>
          <div className="overflow-hidden rounded-xl"><canvas ref={dotCanvasRef} className="w-full" style={{ display: 'block' }} /></div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-faint">Click or drag the dots to erase them. Erased dots stay out of every frame and the export.</p>

      <div className="card mt-6 space-y-8 p-6 sm:p-8">
        {hasVideo && (
          <>
            <Slider label="Preview frame" value={frame} min={0} max={Math.max(0, total - 1)} onChange={setFrame} />
            <FrameWindow total={sourceFrames} start={opts.skipStart} end={opts.skipEnd} onStart={(v) => set('skipStart', v)} onEnd={(v) => set('skipEnd', v)} />
          </>
        )}
        <div className="grid gap-7 sm:grid-cols-3">
          <Slider label="Contrast" suffix="%" value={opts.contrast} min={50} max={200} onChange={(v) => set('contrast', v)} />
          <Slider label="Exposure" value={opts.exposure} min={-100} max={100} onChange={(v) => set('exposure', v)} />
          <Slider label="White point" value={opts.threshold} min={0} max={255} onChange={(v) => set('threshold', v)} />
        </div>
        <div className="grid gap-7 sm:grid-cols-2">
          <Slider label="Frame rate" suffix=" fps" value={opts.fps} min={1} max={30} onChange={(v) => set('fps', v)} />
          <Slider label="Dot width" suffix=" cols" value={opts.width} min={40} max={400} step={10} onChange={setWidth} />
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex-1">
          <span className="label mb-2 block">Your footage</span>
          <input className="field cursor-pointer" type="file" accept="video/*" onChange={onFile} />
        </label>
        <button className="btn h-[46px] px-7 sm:mt-6" onClick={convert} disabled={!hasVideo || converting}>
          {converting ? `Converting ${progress}%` : 'Convert to dots'}
        </button>
      </div>

      {converting && (
        <div className="mt-6 h-0.5 w-full overflow-hidden rounded-full bg-line">
          <div className="h-full bg-ink transition-[width] duration-200" style={{ width: `${progress}%` }} />
        </div>
      )}
      {done && (
        <p className="mt-6 text-muted">
          Saved <span className="mono text-sm text-ink">{done}.seurat</span>.{' '}
          <button className="font-semibold text-ink underline underline-offset-2" onClick={() => playableRef.current && onPlay(playableRef.current)}>
            Play your file
          </button>
        </p>
      )}
      {error && <p className="mt-6 text-accent">{error}</p>}
    </div>
  );
}
